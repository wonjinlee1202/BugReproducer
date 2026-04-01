import assert from "node:assert/strict";
import test from "node:test";
import { minimizeInput } from "./minimize.js";
test("minimizeInput removes non-essential keys", async () => {
    const input = {
        crash: true,
        keep: "boom",
        noise1: 1,
        noise2: "x",
    };
    const out = await minimizeInput(input, async (candidate) => {
        const c = candidate;
        return c.crash === true && c.keep === "boom";
    });
    assert.deepEqual(out, { crash: true, keep: "boom" });
});
//# sourceMappingURL=minimize.test.js.map