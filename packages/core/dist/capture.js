import { createCaptureStore } from "./store.js";
import { createSeedFromCaptureId, makeId, nowIso } from "./utils.js";
export function toFailureSummary(err) {
    if (err instanceof Error) {
        return {
            name: err.name,
            message: err.message,
            stack: err.stack,
        };
    }
    return {
        name: "UnknownError",
        message: String(err),
    };
}
export function createRuntimeCapture(options) {
    const store = createCaptureStore(options.captureDir);
    async function captureFailure(operation, input, context, run) {
        const startedAtMs = Date.now();
        const logs = [];
        const externalCalls = [];
        const captureCtx = {
            log(level, message, meta) {
                logs.push({
                    tsOffsetMs: Date.now() - startedAtMs,
                    level,
                    message,
                    meta,
                });
            },
            recordExternalCall(record) {
                externalCalls.push(record);
            },
        };
        try {
            return await run(captureCtx);
        }
        catch (err) {
            const captureId = makeId("cap");
            const deterministic = {
                seed: createSeedFromCaptureId(captureId),
                epochMs: startedAtMs,
                tickMs: 3,
                timezone: options.timezone ?? "UTC",
            };
            const capture = {
                version: 1,
                captureId,
                app: options.app,
                operation,
                capturedAt: nowIso(),
                deterministic,
                input,
                context,
                logs,
                externalCalls,
                error: toFailureSummary(err),
            };
            const capturePath = await store.write(capture);
            throw Object.assign(err, {
                capturePath,
            });
        }
    }
    return {
        store,
        async withCapture(operation, input, run, context) {
            return (await captureFailure(operation, input, context, run));
        },
        async captureFromError(operation, input, err, extra) {
            const captureId = makeId("cap");
            const deterministic = {
                seed: createSeedFromCaptureId(captureId),
                epochMs: Date.now(),
                tickMs: 3,
                timezone: options.timezone ?? "UTC",
            };
            const capture = {
                version: 1,
                captureId,
                app: options.app,
                operation,
                capturedAt: nowIso(),
                deterministic,
                input,
                context: extra?.context,
                logs: extra?.logs ?? [],
                externalCalls: extra?.externalCalls ?? [],
                error: toFailureSummary(err),
            };
            const capturePath = await store.write(capture);
            return { capture, capturePath };
        },
    };
}
//# sourceMappingURL=capture.js.map