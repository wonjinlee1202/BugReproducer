import type { CaptureRecord, JsonValue } from "./types.js";
export declare function makeHttpMock(capture: CaptureRecord): (name: string, request: JsonValue) => Promise<JsonValue>;
export declare function makeDbMock(capture: CaptureRecord): (name: string, request: JsonValue) => Promise<JsonValue>;
