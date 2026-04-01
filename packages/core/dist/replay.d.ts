import type { CaptureRecord, ReplayResult } from "./types.js";
export interface ReplayAdapter {
    run(input: unknown, capture: CaptureRecord): Promise<unknown>;
}
export interface ReplayOptions {
    capturePath: string;
    adapter: ReplayAdapter;
}
export declare function replayCapture(options: ReplayOptions): Promise<ReplayResult>;
export declare function generateReproScript(capturePath: string, outputPath: string, adapterModulePath: string): Promise<void>;
export interface ReplayLogLine {
    capturedAt: string;
    replayedAt: string;
    capturePath: string;
    ok: boolean;
}
export declare function appendReplayLog(logFile: string, line: ReplayLogLine): Promise<void>;
export declare function makeReplayLogLine(capturePath: string, capture: CaptureRecord, ok: boolean): ReplayLogLine;
