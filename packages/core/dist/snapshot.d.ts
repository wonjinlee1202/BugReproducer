import type { JsonValue } from "./types.js";
export declare function writeDbSnapshot(snapshotDir: string, captureId: string, data: JsonValue): Promise<string>;
export declare function readDbSnapshot(snapshotPath: string): Promise<JsonValue>;
