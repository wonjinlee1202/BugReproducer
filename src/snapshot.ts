import fs from "node:fs/promises";
import path from "node:path";
import type { JsonValue } from "./types.js";

export async function writeDbSnapshot(snapshotDir: string, captureId: string, data: JsonValue): Promise<string> {
  await fs.mkdir(snapshotDir, { recursive: true });
  const filePath = path.join(snapshotDir, `${captureId}.db-snapshot.json`);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
  return filePath;
}

export async function readDbSnapshot(snapshotPath: string): Promise<JsonValue> {
  const raw = await fs.readFile(snapshotPath, "utf8");
  return JSON.parse(raw) as JsonValue;
}
