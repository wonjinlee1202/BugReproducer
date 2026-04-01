#!/usr/bin/env node
import { replayCapture } from "@bugrepro/core";
import { adapter } from "../examples/replay-adapter.mjs";

const capturePath = "/Users/wonjinlee/Desktop/BugReproducer/bugreproducer/captures/cap_1775001745965_342d9dfc.json";

const result = await replayCapture({
  capturePath,
  adapter,
});

if (result.ok) {
  console.log("Replay completed with no error.");
  process.exit(0);
}

console.error("Replay reproduced failure:");
console.error(result.error?.name + ": " + result.error?.message);
console.error(result.error?.stack ?? "(no stack)");
process.exit(1);
