import crypto from "node:crypto";
import path from "node:path";

export function nowIso(): string {
  return new Date().toISOString();
}

export function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function toSafeFileComponent(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function getCaptureFilePath(dir: string, captureId: string): string {
  return path.join(dir, `${toSafeFileComponent(captureId)}.json`);
}

export function createSeedFromCaptureId(captureId: string): number {
  let h = 2166136261;
  for (let i = 0; i < captureId.length; i += 1) {
    h ^= captureId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
