import fs from "node:fs/promises";
import path from "node:path";
import { captureSchema } from "./schema.js";
import { getCaptureFilePath } from "./utils.js";
export function createCaptureStore(captureDir) {
    return {
        async write(capture) {
            await fs.mkdir(captureDir, { recursive: true });
            const filePath = getCaptureFilePath(captureDir, capture.captureId);
            await fs.writeFile(filePath, JSON.stringify(capture, null, 2), "utf8");
            return filePath;
        },
        async read(capturePath) {
            const raw = await fs.readFile(capturePath, "utf8");
            return captureSchema.parse(JSON.parse(raw));
        },
        async list() {
            try {
                const entries = await fs.readdir(captureDir);
                return entries
                    .filter((entry) => entry.endsWith(".json"))
                    .map((entry) => path.join(captureDir, entry))
                    .sort();
            }
            catch {
                return [];
            }
        },
    };
}
//# sourceMappingURL=store.js.map