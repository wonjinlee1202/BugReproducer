import fs from "node:fs/promises";
import path from "node:path";
export async function writeDbSnapshot(snapshotDir, captureId, data) {
    await fs.mkdir(snapshotDir, { recursive: true });
    const filePath = path.join(snapshotDir, `${captureId}.db-snapshot.json`);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
    return filePath;
}
export async function readDbSnapshot(snapshotPath) {
    const raw = await fs.readFile(snapshotPath, "utf8");
    return JSON.parse(raw);
}
//# sourceMappingURL=snapshot.js.map