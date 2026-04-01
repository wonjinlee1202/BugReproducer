import { createRuntimeCapture, type JsonValue } from "@bugrepro/core";

interface CheckoutInput {
  userId: string;
  items: Array<{ sku: string; qty: number }>;
  paymentToken: string;
}

const runtime = createRuntimeCapture({
  app: "checkout-service",
  captureDir: "captures",
});

async function fakePaymentApi(token: string): Promise<{ approved: boolean; riskScore: number }> {
  if (token.startsWith("fail_")) {
    return { approved: false, riskScore: 98 };
  }
  return { approved: true, riskScore: 20 };
}

async function fakeDbLookup(userId: string): Promise<{ tier: "standard" | "vip" }> {
  return userId.startsWith("vip") ? { tier: "vip" } : { tier: "standard" };
}

async function checkout(input: CheckoutInput): Promise<void> {
  await runtime.withCapture("checkout", input as unknown as JsonValue, async (ctx) => {
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

    ctx.log("info", "checkout completed");
  });
}

checkout({
  userId: "vip_123",
  items: [{ sku: "SKU-1", qty: 1 }],
  paymentToken: "fail_tok_123",
})
  .then(() => {
    console.log("unexpected success");
  })
  .catch((err) => {
    const capturePath = (err as Error & { capturePath?: string }).capturePath;
    console.error("Simulated production failure captured.");
    if (capturePath) {
      console.error("capture:", capturePath);
    }
  });
