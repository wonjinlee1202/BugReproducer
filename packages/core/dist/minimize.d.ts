import type { JsonValue } from "./types.js";
export type FailsPredicate = (input: JsonValue) => Promise<boolean>;
export declare function minimizeInput(input: JsonValue, stillFails: FailsPredicate): Promise<JsonValue>;
