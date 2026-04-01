import type { CaptureRecord } from "./types.js";
export interface CaptureStore {
    write(capture: CaptureRecord): Promise<string>;
    read(capturePath: string): Promise<CaptureRecord>;
    list(): Promise<string[]>;
}
export declare function createCaptureStore(captureDir: string): CaptureStore;
