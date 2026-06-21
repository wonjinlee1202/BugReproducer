import type { ReplayAdapter } from "../../src/index.js";

type Item = { sku: string; qty: number };

const PRICES: Record<string, number> = { "MUG-L": 18, "SHIRT-M": 32, "HAT-S": 24 };

export const adapter: ReplayAdapter = {
  async run(input, capture) {
    const find = (kind: "http" | "db", name: string) =>
      capture.externalCalls.find((x) => x.kind === kind && x.name === name);

    const couponCall = find("db", "coupons.get");
    if (!couponCall) throw new Error("Missing captured coupons.get call");

    const coupon = couponCall.response as { discountPct: number } | null;

    // Replay the exact same logic — including the bug
    const discount = (coupon as NonNullable<typeof coupon>).discountPct / 100;
    const items = (input as { items: Item[] }).items;
    const subtotal = items.reduce((sum, item) => sum + (PRICES[item.sku] ?? 0) * item.qty, 0);
    const total = subtotal * (1 - discount);

    return { total };
  },
};
