import fs from "node:fs/promises";
import path from "node:path";
import { installDeterministicRuntime } from "./deterministic.js";
import { createCaptureStore } from "./store.js";
import { nowIso } from "./utils.js";
export async function replayCapture(options) {
    const store = createCaptureStore(path.dirname(options.capturePath));
    const capture = await store.read(options.capturePath);
    const restore = installDeterministicRuntime(capture.deterministic);
    const start = Date.now();
    try {
        await options.adapter.run(capture.input, capture);
        return {
            ok: true,
            elapsedMs: Date.now() - start,
        };
    }
    catch (err) {
        const error = err instanceof Error
            ? { name: err.name, message: err.message, stack: err.stack }
            : { name: "UnknownError", message: String(err) };
        return {
            ok: false,
            elapsedMs: Date.now() - start,
            error,
        };
    }
    finally {
        restore();
    }
}
export async function generateReproScript(capturePath, outputPath, adapterModulePath) {
    const script = `#!/usr/bin/env node
import { replayCapture } from "@bugrepro/core";
import { adapter } from "${adapterModulePath}";

const capturePath = ${JSON.stringify(capturePath)};

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
`;
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, script, "utf8");
    await fs.chmod(outputPath, 0o755);
}
export async function appendReplayLog(logFile, line) {
    await fs.mkdir(path.dirname(logFile), { recursive: true });
    await fs.appendFile(logFile, `${JSON.stringify(line)}\n`, "utf8");
}
export function makeReplayLogLine(capturePath, capture, ok) {
    return {
        capturedAt: capture.capturedAt,
        replayedAt: nowIso(),
        capturePath,
        ok,
    };
}
//# sourceMappingURL=replay.js.map