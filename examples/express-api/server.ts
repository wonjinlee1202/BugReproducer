/**
 * A minimal Express order API used to demonstrate BugReproducer in a real-world context.
 *
 * The bug: when a user submits an expired coupon code, db.getCoupon() returns null
 * and the route crashes with "Cannot read properties of null (reading 'discountPct')".
 * This only surfaces in production because the dev database still has all coupons active.
 *
 * Run:   npx tsx examples/express-api/server.ts
 * Test:  curl -X POST http://localhost:3000/orders \
 *          -H 'Content-Type: application/json' \
 *          -d '{"userId":"u_42","items":[{"sku":"MUG-L","qty":2}],"couponCode":"SUMMER20"}'
 */
import express from "express";
import { createRuntimeCapture } from "../../src/index.js";

const app = express();
app.use(express.json());

const runtime = createRuntimeCapture({ app: "order-api", captureDir: "captures" });

// --- fake data layer (stand-ins for a real DB) ---

type Item = { sku: string; qty: number };
type Coupon = { code: string; discountPct: number } | null;

const PRICES: Record<string, number> = { "MUG-L": 18, "SHIRT-M": 32, "HAT-S": 24 };

async function dbGetCoupon(code: string): Promise<Coupon> {
  const active: Record<string, number> = { WELCOME10: 10, VIP30: 30 };
  // SUMMER20 expired last month → returns null in production
  return code in active ? { code, discountPct: active[code] } : null;
}

async function dbGetUser(userId: string): Promise<{ tier: string }> {
  return userId.startsWith("vip") ? { tier: "vip" } : { tier: "standard" };
}

function calcSubtotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + (PRICES[item.sku] ?? 0) * item.qty, 0);
}

// --- route ---

app.post("/orders", async (req, res) => {
  const input = req.body as { userId: string; items: Item[]; couponCode?: string };

  try {
    await runtime.withCapture("POST /orders", input, async (ctx) => {
      ctx.log("info", "order received", { userId: input.userId, items: input.items.length });

      const user = await dbGetUser(input.userId);
      ctx.recordExternalCall({ kind: "db", name: "users.get", request: { userId: input.userId }, response: user });

      const coupon = input.couponCode ? await dbGetCoupon(input.couponCode) : null;
      ctx.recordExternalCall({ kind: "db", name: "coupons.get", request: { code: input.couponCode }, response: coupon });

      // BUG: no null check — crashes when coupon is expired (returns null)
      const discount = (coupon as NonNullable<typeof coupon>).discountPct / 100;
      const subtotal = calcSubtotal(input.items);
      const total = subtotal * (1 - discount);

      ctx.log("info", "order placed", { total });
      res.json({ orderId: `ord_${Date.now()}`, total });
    });
  } catch (err: unknown) {
    const e = err as Error & { capturePath?: string };
    const captured = e.capturePath ? ` (capture: ${e.capturePath})` : "";
    res.status(500).json({ error: e.message + captured });
  }
});

app.listen(3000, () => console.log("order-api listening on http://localhost:3000"));
