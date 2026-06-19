import { clamp } from "./utils.js";

type RestoreFn = () => void;

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DeterministicHooks {
  seed: number;
  epochMs: number;
  tickMs?: number;
}

export function installDeterministicRuntime(hooks: DeterministicHooks): RestoreFn {
  const seed = hooks.seed >>> 0;
  const tickMs = clamp(hooks.tickMs ?? 3, 1, 1000);
  const rng = mulberry32(seed);
  let clockMs = hooks.epochMs;

  const originalRandom = Math.random;
  const originalNow = Date.now;
  const originalDate = globalThis.Date;
  const deterministicNow = () => {
    clockMs += tickMs;
    return clockMs;
  };

  Math.random = () => rng();
  Date.now = deterministicNow;

  class DeterministicDate extends Date {
    constructor(...args: any[]) {
      if (args.length === 0) {
        super(Date.now());
      } else {
        super(args[0] as any);
      }
    }

    static now(): number {
      return deterministicNow();
    }
  }

  globalThis.Date = DeterministicDate as DateConstructor;

  return () => {
    Math.random = originalRandom;
    Date.now = originalNow;
    globalThis.Date = originalDate;
  };
}
