import type { CaptureLevel, CaptureRecord, CapturedLog, ExternalCallRecord, FailureSummary, JsonValue } from "./types.js";
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
export declare function toFailureSummary(err: unknown): FailureSummary;
export declare function createRuntimeCapture(options: RuntimeCaptureOptions): {
    store: import("./store.js").CaptureStore;
    withCapture<TInput extends JsonValue, TResult>(operation: string, input: TInput, run: (captureCtx: CaptureContext) => Promise<TResult>, context?: JsonValue): Promise<TResult>;
    captureFromError(operation: string, input: JsonValue, err: unknown, extra?: {
        context?: JsonValue;
        logs?: CapturedLog[];
        externalCalls?: ExternalCallRecord[];
    }): Promise<CapturedFailure>;
};
