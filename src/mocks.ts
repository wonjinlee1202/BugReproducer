import type { CaptureRecord, ExternalCallRecord, JsonValue } from "./types.js";

function findCall(capture: CaptureRecord, kind: "http" | "db", name: string): ExternalCallRecord | undefined {
  return capture.externalCalls.find((call) => call.kind === kind && call.name === name);
}

export function makeHttpMock(capture: CaptureRecord) {
  return async function http(name: string, request: JsonValue): Promise<JsonValue> {
    const call = findCall(capture, "http", name);
    if (!call) {
      throw new Error(`No captured HTTP call for ${name}`);
    }
    if (call.error) {
      throw new Error(`Captured HTTP error for ${name}: ${call.error}`);
    }
    return call.response ?? request;
  };
}

export function makeDbMock(capture: CaptureRecord) {
  return async function db(name: string, request: JsonValue): Promise<JsonValue> {
    const call = findCall(capture, "db", name);
    if (!call) {
      throw new Error(`No captured DB call for ${name}`);
    }
    if (call.error) {
      throw new Error(`Captured DB error for ${name}: ${call.error}`);
    }
    return call.response ?? request;
  };
}
