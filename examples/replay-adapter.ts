import { makeDbMock, makeHttpMock, type ReplayAdapter } from "@bugrepro/core";

export const adapter: ReplayAdapter = {
  async run(input: unknown, capture) {
    const http = makeHttpMock(capture);
    const db = makeDbMock(capture);

    const payload = input as {
      userId: string;
      paymentToken: string;
      items: Array<{ sku: string; qty: number }>;
    };

    const payment = await http("payments.authorize", { token: payload.paymentToken });
    const user = await db("users.lookup", { userId: payload.userId });

    const p = payment as { approved: boolean; riskScore: number };

    if (!p.approved || p.riskScore > 90) {
      throw new Error(`Payment rejected for user ${(user as { tier: string }).tier}`);
    }
  },
};
