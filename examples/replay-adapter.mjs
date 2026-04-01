/** @type {import("@bugrepro/core").ReplayAdapter} */
export const adapter = {
  async run(input, capture) {
    const call = (kind, name) => capture.externalCalls.find((x) => x.kind === kind && x.name === name);
    const paymentCall = call("http", "payments.authorize");
    const userCall = call("db", "users.lookup");

    if (!paymentCall || !userCall) {
      throw new Error("Missing captured external calls");
    }

    const payment = paymentCall.response ?? { approved: true, riskScore: 0 };
    const p = /** @type {{ approved: boolean; riskScore: number }} */ (payment);

    const userId = input && typeof input === "object" && "userId" in input ? input.userId : "unknown";
    if (!p.approved || p.riskScore > 90) {
      throw new Error(`Payment rejected for user ${userId}`);
    }
  },
};
