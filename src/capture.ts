import { createCaptureStore } from "./store.js";
import type {
  CaptureLevel,
  CaptureRecord,
  CapturedLog,
  ExternalCallRecord,
  FailureSummary,
  JsonValue,
} from "./types.js";
import { createSeedFromCaptureId, makeId, nowIso } from "./utils.js";

export interface RuntimeCaptureOptions {
  app: string;
  captureDir: string;
  timezone?: string;
}

export interface CaptureContext {
  log: (level: CaptureLevel, message: string, meta?: JsonValue) => void;
  recordExternalCall: (record: ExternalCallRecord) => void;
}

export interface CapturedFailure {
  capture: CaptureRecord;
  capturePath: string;
}

export function toFailureSummary(err: unknown): FailureSummary {
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

export function createRuntimeCapture(options: RuntimeCaptureOptions) {
  const store = createCaptureStore(options.captureDir);

  async function captureFailure<TInput extends JsonValue>(
    operation: string,
    input: TInput,
    context: JsonValue | undefined,
    run: (captureCtx: CaptureContext) => Promise<unknown>
  ): Promise<unknown> {
    const startedAtMs = Date.now();
    const logs: CapturedLog[] = [];
    const externalCalls: ExternalCallRecord[] = [];

    const captureCtx: CaptureContext = {
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
    } catch (err) {
      const captureId = makeId("cap");
      const deterministic = {
        seed: createSeedFromCaptureId(captureId),
        epochMs: startedAtMs,
        tickMs: 3,
        timezone: options.timezone ?? "UTC",
      };
      const capture: CaptureRecord = {
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
      throw Object.assign(err as Error, { capturePath });
    }
  }

  return {
    store,
    async withCapture<TInput extends JsonValue, TResult>(
      operation: string,
      input: TInput,
      run: (captureCtx: CaptureContext) => Promise<TResult>,
      context?: JsonValue
    ): Promise<TResult> {
      return (await captureFailure(operation, input, context, run)) as TResult;
    },
    async captureFromError(
      operation: string,
      input: JsonValue,
      err: unknown,
      extra?: {
        context?: JsonValue;
        logs?: CapturedLog[];
        externalCalls?: ExternalCallRecord[];
      }
    ): Promise<CapturedFailure> {
      const captureId = makeId("cap");
      const deterministic = {
        seed: createSeedFromCaptureId(captureId),
        epochMs: Date.now(),
        tickMs: 3,
        timezone: options.timezone ?? "UTC",
      };
      const capture: CaptureRecord = {
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
