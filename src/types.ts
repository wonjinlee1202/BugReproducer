export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type CaptureLevel = "info" | "warn" | "error" | "debug";

export interface CapturedLog {
  tsOffsetMs: number;
  level: CaptureLevel;
  message: string;
  meta?: JsonValue;
}

export interface ExternalCallRecord {
  kind: "http" | "db";
  name: string;
  request: JsonValue;
  response?: JsonValue;
  error?: string;
}

export interface FailureSummary {
  name: string;
  message: string;
  stack?: string;
}

export interface DeterministicConfig {
  seed: number;
  epochMs: number;
  tickMs: number;
  timezone?: string;
}

export interface CaptureRecord {
  version: 1;
  captureId: string;
  app: string;
  operation: string;
  capturedAt: string;
  deterministic: DeterministicConfig;
  input: JsonValue;
  context?: JsonValue;
  logs: CapturedLog[];
  externalCalls: ExternalCallRecord[];
  dbSnapshotPath?: string;
  error: FailureSummary;
  tags?: string[];
}

export interface ReplayResult {
  ok: boolean;
  elapsedMs: number;
  error?: FailureSummary;
}

export interface ReproMetrics {
  bugId: string;
  capturedAt: string;
  replayedAt?: string;
  replaySuccess?: boolean;
  baselineDebugMinutes?: number;
  replayDebugMinutes?: number;
}
