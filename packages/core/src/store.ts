import fs from "node:fs/promises";
import path from "node:path";
import { captureSchema } from "./schema.js";
import type { CaptureRecord } from "./types.js";
import { getCaptureFilePath } from "./utils.js";

export interface CaptureStore {
  write(capture: CaptureRecord): Promise<string>;
  read(capturePath: string): Promise<CaptureRecord>;
  list(): Promise<string[]>;
}

export function createCaptureStore(captureDir: string): CaptureStore {
  return {
    async write(capture: CaptureRecord): Promise<string> {
      await fs.mkdir(captureDir, { recursive: true });
      const filePath = getCaptureFilePath(captureDir, capture.captureId);
      await fs.writeFile(filePath, JSON.stringify(capture, null, 2), "utf8");
      return filePath;
    },
    async read(capturePath: string): Promise<CaptureRecord> {
      const raw = await fs.readFile(capturePath, "utf8");
      return captureSchema.parse(JSON.parse(raw)) as CaptureRecord;
    },
    async list(): Promise<string[]> {
      try {
        const entries = await fs.readdir(captureDir);
        return entries
          .filter((entry) => entry.endsWith(".json"))
          .map((entry) => path.join(captureDir, entry))
          .sort();
      } catch {
        return [];
      }
    },
  };
}
