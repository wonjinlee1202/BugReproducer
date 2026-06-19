import type { ReplayAdapter } from "../src/index.js";

export const adapter: ReplayAdapter = {
  async run(input, capture) {
    const find = (kind: "http" | "db", name: string) =>
      capture.externalCalls.find((x) => x.kind === kind && x.name === name);

    const paymentCall = find("http", "payments.authorize");
    const userCall = find("db", "users.lookup");

    if (!paymentCall || !userCall) {
      throw new Error("Missing captured external calls");
    }

    const payment = paymentCall.response as { approved: boolean; riskScore: number };
    const inp = input as { userId?: string };

    if (!payment.approved || payment.riskScore > 90) {
      throw new Error(`Payment rejected for user ${inp.userId ?? "unknown"}`);
    }
  },
};
