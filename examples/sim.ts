import { createRuntimeCapture } from "../src/index.js";

const runtime = createRuntimeCapture({
  app: "checkout-service",
  captureDir: "captures",
});

async function fakePaymentApi(token: string) {
  if (token.startsWith("fail_")) return { approved: false, riskScore: 98 };
  return { approved: true, riskScore: 20 };
}

async function fakeDbLookup(userId: string) {
  return userId.startsWith("vip") ? { tier: "vip" } : { tier: "standard" };
}

async function checkout(input: { userId: string; items: { sku: string; qty: number }[]; paymentToken: string }) {
  await runtime.withCapture("checkout", input, async (ctx) => {
    ctx.log("info", "checkout started", { userId: input.userId });

    const payment = await fakePaymentApi(input.paymentToken);
    ctx.recordExternalCall({
      kind: "http",
      name: "payments.authorize",
      request: { token: input.paymentToken },
      response: payment,
    });

    const user = await fakeDbLookup(input.userId);
    ctx.recordExternalCall({
      kind: "db",
      name: "users.lookup",
      request: { userId: input.userId },
      response: user,
    });

    if (!payment.approved || payment.riskScore > 90) {
      ctx.log("error", "payment rejected", { payment, user });
      throw new Error("Payment rejected with high risk score");
    }
  });
}

checkout({
  userId: "vip_123",
  items: [{ sku: "SKU-1", qty: 1 }],
  paymentToken: "fail_tok_123",
})
  .then(() => console.log("unexpected success"))
  .catch((err: Error & { capturePath?: string }) => {
    console.error("Simulated production failure captured.");
    if (err.capturePath) console.error("capture:", err.capturePath);
  });
