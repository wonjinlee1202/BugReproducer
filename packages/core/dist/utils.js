import crypto from "node:crypto";
import path from "node:path";
export function nowIso() {
    return new Date().toISOString();
}
export function makeId(prefix) {
    return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}
export function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}
export function toSafeFileComponent(input) {
    return input.replace(/[^a-zA-Z0-9._-]/g, "_");
}
export function getCaptureFilePath(dir, captureId) {
    return path.join(dir, `${toSafeFileComponent(captureId)}.json`);
}
export function createSeedFromCaptureId(captureId) {
    let h = 2166136261;
    for (let i = 0; i < captureId.length; i += 1) {
        h ^= captureId.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}
//# sourceMappingURL=utils.js.map