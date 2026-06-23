# BugReproducer

Capture production failures and replay them deterministically.

When your service throws in production, BugReproducer snapshots everything needed to reproduce the crash — the input, all log lines, every HTTP and DB call with its response, and the runtime clock and RNG state — into a single portable JSON file. You can then replay that exact crash on any machine, shrink the input to the smallest version that still fails, and generate a one-command repro script to share with teammates or attach to a CI artifact.

---

## How It Works

```
Production crash
      │
      ▼
withCapture() catches the exception
      │
      ├── serializes: input · logs · HTTP/DB responses · error · clock seed
      │
      ▼
captures/cap_<id>.json          ← self-contained crash snapshot
      │
      ├── replay     → re-run with mocked deps and same clock/RNG
      ├── minimize   → shrink input to the smallest failing version
      ├── generate   → write a standalone one-command repro script
      └── metrics    → track and compare debug time before vs. after
```

No real services are contacted during replay. Every external call (HTTP, DB) is answered from the captured responses stored in the JSON file.

---

## Project Layout

```
src/
  types.ts          shared TypeScript interfaces and data shapes
  schema.ts         Zod schemas that validate capture files on read
  utils.ts          ID generation, seed hashing, filename sanitization
  capture.ts        withCapture() wrapper and captureFromError() API
  deterministic.ts  patches Math.random / Date.now for identical replay
  replay.ts         replayCapture() and generateReproScript()
  minimize.ts       greedy input minimizer (delta-debug style)
  mocks.ts          makeHttpMock() / makeDbMock() adapter helpers
  store.ts          capture file I/O (read / write / list)
  snapshot.ts       side-car DB snapshot files (large state, separate file)
  metrics.ts        NDJSON metrics store and HTML dashboard renderer
  index.ts          public API exports
  cli.ts            all CLI commands (Commander.js)
  minimize.test.ts  unit tests for the minimizer

examples/
  sim.ts            fake checkout service that crashes intentionally
  adapter.ts        replay adapter for the sim example
  express-api/
    server.ts       Express order API demonstrating real-world integration
    adapter.ts      replay adapter for the Express example

captures/           JSON capture files (one per crash)
repros/             generated standalone repro scripts
reports/            metrics NDJSON and HTML dashboard output
```

---

## Setup

```bash
npm install
```

No build step required for development. All commands run TypeScript directly via `tsx`.

---

## Walkthrough

The included example uses a fake e-commerce checkout service that crashes intentionally on a bad payment token, giving you a real capture file to try every command against.

### 1. Simulate a production failure

```bash
npm run sim
```

```
Simulated production failure captured.
capture: captures/cap_1781892208778_33dbafae.json
```

`npm run sim` runs [`examples/sim.ts`](examples/sim.ts), which calls a fake `checkout()` operation with a payment token that starts with `fail_`. The fake payment API returns `{ approved: false, riskScore: 98 }`, the checkout logic throws, and `withCapture()` catches the crash and writes the snapshot to `captures/`.

The resulting capture file looks like this:

```json
{
  "captureId": "cap_1781892208778_33dbafae",
  "app": "checkout-service",
  "operation": "checkout",
  "input": {
    "userId": "vip_123",
    "items": [{ "sku": "SKU-1", "qty": 1 }],
    "paymentToken": "fail_tok_123"
  },
  "logs": [
    { "level": "info",  "message": "checkout started" },
    { "level": "error", "message": "payment rejected",
      "meta": { "payment": { "approved": false, "riskScore": 98 }, "user": { "tier": "vip" } } }
  ],
  "externalCalls": [
    { "kind": "http", "name": "payments.authorize",
      "request":  { "token": "fail_tok_123" },
      "response": { "approved": false, "riskScore": 98 } },
    { "kind": "db",   "name": "users.lookup",
      "request":  { "userId": "vip_123" },
      "response": { "tier": "vip" } }
  ],
  "error": { "name": "Error", "message": "Payment rejected with high risk score" },
  "deterministic": { "seed": 3815419686, "epochMs": 1781892208777, "tickMs": 3 }
}
```

This file is the complete state of the crash. Anyone can replay it without access to the payment API or the database.

---

### 2. List all captures

```bash
npm run bugrepro -- list
```

```
captures/cap_1775001745965_342d9dfc.json
captures/cap_1775003513128_1b929089.json
captures/cap_1781892208778_33dbafae.json
```

---

### 3. Replay the crash

```bash
npm run bugrepro -- replay \
  --capture captures/cap_1781892208778_33dbafae.json \
  --adapter examples/adapter.ts
```

```
Reproduced failure: Error: Payment rejected for user vip_123
```

The CLI loads the capture, patches `Math.random` and `Date.now` to use the stored seed and clock, then runs the adapter with the captured input. The adapter re-runs the checkout logic but reads all HTTP and DB responses directly from the capture file. The crash reproduces exactly.

Exit code 1 when the failure is reproduced, 0 when it is not — suitable for CI health checks.

---

### 4. Minimize the input

```bash
npm run bugrepro -- minimize \
  --capture captures/cap_1781892208778_33dbafae.json \
  --adapter examples/adapter.ts \
  --out captures/minimized.json
```

```
captures/minimized.json
```

The minimizer iteratively removes keys from the input and replays after each removal. If the crash still happens, the key is dropped permanently. If removing a key stops the crash, the key is kept.

The original input had three fields. After minimization:

```json
{ "paymentToken": "fail_tok_123" }
```

`userId` and `items` turned out to be irrelevant — the crash is entirely in the payment token check.

---

### 5. Generate a standalone repro script

```bash
npm run bugrepro -- generate \
  --capture captures/cap_1781892208778_33dbafae.json \
  --adapter examples/adapter.ts \
  --out repros/payment-rejection.mjs
```

```
repros/payment-rejection.mjs
```

The generated script has a tsx shebang and bakes in the capture and adapter paths as absolute file URLs — no arguments needed to run it:

```bash
npx tsx repros/payment-rejection.mjs
```

```
Reproduced failure: Error: Payment rejected for user vip_123
```

In CI, use `ci-attach` instead — it auto-names the script after the capture ID so multiple captures never overwrite each other:

```bash
npm run bugrepro -- ci-attach \
  --capture captures/cap_1781892208778_33dbafae.json \
  --adapter examples/adapter.ts \
  --artifacts repros
# → repros/cap_1781892208778_33dbafae.repro.mjs
```

---

### 6. Track metrics and view the dashboard

After a replay, pass `--metrics-file` to record the result:

```bash
npm run bugrepro -- replay \
  --capture captures/cap_1781892208778_33dbafae.json \
  --adapter examples/adapter.ts \
  --metrics-file reports/metrics.ndjson
```

Then annotate with timing data using the `record` command:

```bash
npm run bugrepro -- record \
  --capture captures/cap_1781892208778_33dbafae.json \
  --metrics-file reports/metrics.ndjson \
  --baseline-minutes 90 \
  --replay-minutes 12
```

`--baseline-minutes` is how long this bug would have taken to track down without BugReproducer. `--replay-minutes` is how long it actually took. Each bug gets one row in the NDJSON file, upserted by capture ID.

Generate a static HTML report:

```bash
npm run bugrepro -- metrics --in reports/metrics.ndjson
```

Or serve a live dashboard that re-reads the file on every request:

```bash
npm run bugrepro -- dashboard --in reports/metrics.ndjson
# → http://127.0.0.1:4173
```

---

## Real-World Integration: Express API

The sim example uses a fake service written specifically to demonstrate the tool. The following shows BugReproducer integrated into a real Express order API to capture a bug that was only reproducible in production.

**The scenario:** an order endpoint crashes with `TypeError: Cannot read properties of null (reading 'discountPct')` for roughly 2% of requests. In development every coupon in the database is active, so the bug never surfaces. In production some coupons have expired, the query returns `null`, and the route crashes.

### The bug

```ts
app.post("/orders", async (req, res) => {
  const { couponCode, items } = req.body;

  const coupon = await db.getCoupon(couponCode); // returns null for expired codes
  const discount = coupon.discountPct / 100;      // TypeError: Cannot read properties of null
  const total = calcSubtotal(items) * (1 - discount);

  res.json({ orderId: `ord_${Date.now()}`, total });
});
```

### 1. Wrap the route with withCapture()

```ts
import { createRuntimeCapture } from "../../src/index.js";

const runtime = createRuntimeCapture({ app: "order-api", captureDir: "captures" });

app.post("/orders", async (req, res) => {
  const input = req.body;
  try {
    await runtime.withCapture("POST /orders", input, async (ctx) => {
      ctx.log("info", "order received", { userId: input.userId });

      const coupon = await db.getCoupon(input.couponCode);
      ctx.recordExternalCall({
        kind: "db", name: "coupons.get",
        request: { code: input.couponCode }, response: coupon,
      });

      const discount = coupon.discountPct / 100; // still crashes — and now gets captured
      const total = calcSubtotal(input.items) * (1 - discount);
      res.json({ orderId: `ord_${Date.now()}`, total });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

The next time a request with an expired coupon reaches production, `withCapture()` catches the crash and writes a capture file with the exact input and the `null` DB response.

### 2. The capture file (written in production)

```json
{
  "captureId": "cap_1782041923400_a3f1b2c4",
  "app": "order-api",
  "operation": "POST /orders",
  "input": { "userId": "u_42", "items": [{ "sku": "MUG-L", "qty": 2 }], "couponCode": "SUMMER20" },
  "externalCalls": [
    { "kind": "db", "name": "coupons.get",
      "request":  { "code": "SUMMER20" },
      "response": null }
  ],
  "error": { "name": "TypeError", "message": "Cannot read properties of null (reading 'discountPct')" },
  "deterministic": { "seed": 2947183056, "epochMs": 1782041923399, "tickMs": 1 }
}
```

### 3. Replay locally — no database required

```bash
npm run bugrepro -- replay \
  --capture captures/cap_1782041923400_a3f1b2c4.json \
  --adapter examples/express-api/adapter.ts
```

```
Reproduced failure: TypeError: Cannot read properties of null (reading 'discountPct')
```

The adapter re-runs the order logic using the captured DB response (the `null` coupon) instead of hitting a real database.

### 4. Minimize to the root cause

```bash
npm run bugrepro -- minimize \
  --capture captures/cap_1782041923400_a3f1b2c4.json \
  --adapter examples/express-api/adapter.ts \
  --out captures/minimized.json
```

```json
{ "couponCode": "SUMMER20" }
```

`userId` and `items` are irrelevant. The crash is entirely in the coupon lookup. The fix:

```ts
const discount = coupon ? coupon.discountPct / 100 : 0;
```

> The full runnable version of this example is at [`examples/express-api/`](examples/express-api/).

---

## Writing Adapters

An adapter is a module that exports `{ adapter: { run(input, capture) } }`. It is the glue between the capture file and your actual business logic — it re-runs your code using the captured responses instead of real services.

**Write one adapter per service or operation you want to be able to replay.** The example adapter at [`examples/adapter.ts`](examples/adapter.ts) is specific to the fake checkout service.

```ts
import type { ReplayAdapter } from "./src/index.js";

export const adapter: ReplayAdapter = {
  async run(input, capture) {
    // Use capture.externalCalls to get pre-recorded HTTP/DB responses.
    // Re-run your real business logic with those responses.
    // If it throws, the failure is reproduced.
  },
};
```

The `makeHttpMock()` and `makeDbMock()` helpers build typed mock functions from the capture automatically, so you don't have to search `externalCalls` by hand:

```ts
import { makeHttpMock, makeDbMock, type ReplayAdapter } from "./src/index.js";

export const adapter: ReplayAdapter = {
  async run(input, capture) {
    const http = makeHttpMock(capture);
    const db   = makeDbMock(capture);

    const payment = await http("payments.authorize", { token: (input as any).paymentToken });
    const user    = await db("users.lookup", { userId: (input as any).userId });
    // ... your business logic
  },
};
```

---

## CLI Reference

```bash
npm run bugrepro -- <command> [options]
```

| Command | Description |
|---|---|
| `capture` | Ingest a pre-existing error and input payload into a capture file |
| `list` | List all capture files in the capture directory |
| `replay` | Deterministic replay using an adapter; optionally write replay result to a metrics file |
| `minimize` | Shrink the failing input to the smallest version that still reproduces the failure |
| `generate` | Write a named standalone repro script to `repros/` |
| `ci-attach` | Same as `generate`, auto-named after the capture ID for CI artifact upload |
| `record` | Annotate a capture's metrics row with timing data (baseline vs. replay minutes) |
| `metrics` | Read a metrics NDJSON file, print a summary, and write an HTML dashboard |
| `dashboard` | Serve a live auto-refreshing dashboard at `http://127.0.0.1:4173` |

Run any command with `--help` for the full option list:

```bash
npm run bugrepro -- replay --help
```

---

## Other Scripts

```bash
npm test          # run the test suite
npm run build     # compile to dist/
```
