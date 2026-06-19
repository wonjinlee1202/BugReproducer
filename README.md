# BugReproducer

A CLI tool for capturing production failures and replaying them deterministically.

When your service throws in production, BugReproducer snapshots everything — the input, all logs, every HTTP and DB call and its response, and the clock value at the time of the crash — into a single JSON file. You can then replay that exact crash on any machine, shrink the input down to the smallest version that still breaks, and generate a one-command repro script to share with teammates or attach to a CI artifact.

---

## How It Works

```
Production crash
      │
      ▼
withCapture() catches the exception
      │
      ├── serializes: input, logs, HTTP/DB responses, error, deterministic seed
      │
      ▼
captures/cap_<id>.json                ← everything needed to reproduce the bug
      │
      ├── replay     → re-run with mocked deps, same clock/RNG
      ├── minimize   → strip input down to smallest failing version
      ├── generate   → write a standalone one-command repro script
      └── metrics    → track debug time before vs. after
```

No real services are hit during replay. Every external call (HTTP, DB) is answered from the captured responses in the JSON file.

---

## Project Layout

```
src/              source — engine and CLI in one flat package
  capture.ts      withCapture() wrapper and captureFromError() API
  replay.ts       deterministic replay and repro script generation
  minimize.ts     delta-debug style input minimizer
  deterministic.ts  patches Math.random / Date.now for identical replay
  mocks.ts        makeHttpMock() / makeDbMock() helpers for adapters
  metrics.ts      NDJSON metrics store and HTML dashboard renderer
  store.ts        capture file I/O (read / write / list)
  schema.ts       Zod validation for capture files
  types.ts        shared TypeScript types
  cli.ts          CLI entry point (all commands)
  index.ts        public API exports

examples/
  sim.ts          fake checkout service that intentionally crashes
  adapter.ts      replay adapter for the example service

captures/         JSON capture files (one per crash)
repros/           generated standalone repro scripts
reports/          metrics NDJSON + HTML dashboard output
```

---

## Setup

```bash
npm install
```

No build step required. All commands run TypeScript directly via `tsx`.

---

## Walkthrough

The included example is a fake e-commerce checkout service. It crashes intentionally on a bad payment token so you can try every command with a real capture file.

### 1. Simulate a production failure

```bash
npm run sim
```

```
Simulated production failure captured.
capture: captures/cap_1781892208778_33dbafae.json
```

`npm run sim` runs [`examples/sim.ts`](examples/sim.ts), which calls a fake `checkout()` operation with a payment token that starts with `fail_`. The fake payment API returns `{ approved: false, riskScore: 98 }`, the checkout logic throws, and `withCapture()` catches the crash and writes everything to `captures/`.

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
    { "level": "error", "message": "payment rejected", "meta": { "payment": { "approved": false, "riskScore": 98 }, "user": { "tier": "vip" } } }
  ],
  "externalCalls": [
    { "kind": "http", "name": "payments.authorize",
      "request":  { "token": "fail_tok_123" },
      "response": { "approved": false, "riskScore": 98 } },
    { "kind": "db", "name": "users.lookup",
      "request":  { "userId": "vip_123" },
      "response": { "tier": "vip" } }
  ],
  "error": { "name": "Error", "message": "Payment rejected with high risk score" },
  "deterministic": { "seed": 3815419686, "epochMs": 1781892208777, "tickMs": 3 }
}
```

This file is the complete state of the crash. You can hand it to anyone and they can reproduce the exact failure without access to the payment API or the database.

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

The CLI loads the capture, patches `Math.random` and `Date.now` to use the stored seed and clock, then runs your adapter with the captured input. The adapter re-runs the checkout logic but reads the HTTP and DB responses directly from the capture file instead of hitting real services. The same crash happens.

Exit code 1 when the failure is reproduced, 0 when it is not (useful in CI).

---

### 4. Minimize the input

```bash
npm run bugrepro -- minimize \
  --capture captures/cap_1781892208778_33dbafae.json \
  --adapter examples/adapter.ts \
  --out captures/minimized.json
```

```
/home/wonjin/projects/BugReproducer/captures/minimized.json
```

The minimizer iteratively removes keys from the input — one at a time — and replays after each removal. If the crash still happens, the key is dropped permanently. If removing a key makes the crash go away, it is kept.

The original input had three fields. After minimization:

```json
{ "paymentToken": "fail_tok_123" }
```

`userId` and `items` turned out to be irrelevant — the crash is entirely in the payment token handling.

---

### 5. Generate a standalone repro script

```bash
npm run bugrepro -- generate \
  --capture captures/cap_1781892208778_33dbafae.json \
  --adapter examples/adapter.ts \
  --out repros/payment-rejection.mjs
```

```
/home/wonjin/projects/BugReproducer/repros/payment-rejection.mjs
```

Give the script a meaningful name with `--out` so multiple repros do not overwrite each other. You can then run it with plain Node — no CLI, no TypeScript, no build:

```bash
node repros/payment-rejection.mjs
```

```
Reproduced failure: Error: Payment rejected for user vip_123
```

The capture path and adapter path are baked in as absolute file URLs. In CI, use `ci-attach` instead — it automatically names the script after the capture ID so there are never collisions:

```bash
npm run bugrepro -- ci-attach \
  --capture captures/cap_1781892208778_33dbafae.json \
  --adapter examples/adapter.ts \
  --artifacts repros
# → repros/cap_1781892208778_33dbafae.repro.mjs
```

---

### 6. Track metrics and view the dashboard

Record timing data alongside a replay:

```bash
npm run bugrepro -- replay \
  --capture captures/cap_1781892208778_33dbafae.json \
  --adapter examples/adapter.ts \
  --metrics-file reports/metrics.ndjson \
  --baseline-minutes 90 \
  --replay-minutes 12
```

`--baseline-minutes` is how long this bug would have taken to track down without BugReproducer. `--replay-minutes` is how long it actually took. Each replay appends one line to the NDJSON file.

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

## Writing Adapters

An adapter is a module that exports `{ adapter: { run(input, capture) } }`. It is the glue between the capture file and your actual business logic — it re-runs your code using the captured responses instead of real services.

**You write one adapter per service or operation you want to be able to replay.** The example adapter at [`examples/adapter.ts`](examples/adapter.ts) is specific to the fake checkout service. In a real project you might have `adapters/checkout.ts`, `adapters/order-processor.ts`, and so on.

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

The `makeHttpMock()` and `makeDbMock()` helpers in `src/mocks.ts` can build typed mock functions from the capture automatically:

```ts
import { makeHttpMock, makeDbMock, type ReplayAdapter } from "./src/index.js";

export const adapter: ReplayAdapter = {
  async run(input, capture) {
    const http = makeHttpMock(capture);
    const db   = makeDbMock(capture);

    const payment = await http("payments.authorize", { token: (input as any).paymentToken });
    const user    = await db("users.lookup", { userId: (input as any).userId });
    // ... your logic here
  },
};
```

---

## All CLI Commands

```bash
npm run bugrepro -- <command> [options]
```

| Command | What it does |
|---|---|
| `capture` | Ingest a pre-existing error + input payload into a capture file |
| `list` | List all capture files in the capture directory |
| `replay` | Deterministic replay using an adapter; optionally record metrics |
| `minimize` | Shrink the failing input to the smallest version that still reproduces the failure |
| `generate` | Write a named standalone repro script to `repros/` |
| `ci-attach` | Same as `generate`, auto-named after the capture ID for CI artifact upload |
| `metrics` | Read metrics NDJSON → print summary JSON + write HTML dashboard |
| `dashboard` | Serve a live dashboard at `http://127.0.0.1:4173` |

Run any command with `--help` for all options:

```bash
npm run bugrepro -- replay --help
```

---

## Other Scripts

```bash
npm test          # run the test suite
npm run build     # compile to dist/ (only needed for production use or publishing)
```
