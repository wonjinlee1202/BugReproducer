import type { JsonValue } from "./types.js";

export type FailsPredicate = (input: JsonValue) => Promise<boolean>;

function isObject(v: JsonValue): v is { [key: string]: JsonValue } {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

async function minimizeArray(input: JsonValue[], stillFails: FailsPredicate): Promise<JsonValue[]> {
  let current = [...input];
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < current.length; i += 1) {
      const candidate = [...current.slice(0, i), ...current.slice(i + 1)];
      if (await stillFails(candidate)) {
        current = candidate;
        changed = true;
        break;
      }
    }
  }
  return current;
}

async function minimizeObject(
  input: { [key: string]: JsonValue },
  stillFails: FailsPredicate
): Promise<{ [key: string]: JsonValue }> {
  let current = { ...input };
  let changed = true;
  while (changed) {
    changed = false;
    const keys = Object.keys(current);
    for (const key of keys) {
      const candidate = { ...current };
      delete candidate[key];
      if (await stillFails(candidate)) {
        current = candidate;
        changed = true;
        break;
      }
    }
  }
  return current;
}

export async function minimizeInput(input: JsonValue, stillFails: FailsPredicate): Promise<JsonValue> {
  if (Array.isArray(input)) {
    return minimizeArray(input, stillFails);
  }
  if (isObject(input)) {
    const minimized = await minimizeObject(input, stillFails);
    const out: { [key: string]: JsonValue } = {};
    for (const [k, v] of Object.entries(minimized)) {
      out[k] = await minimizeInput(v, async (candidateChild) => {
        const candidateParent = { ...minimized, [k]: candidateChild };
        return stillFails(candidateParent);
      });
    }
    return out;
  }
  return input;
}
