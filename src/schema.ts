import { z } from "zod";

export const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(jsonValueSchema)])
);

export const failureSchema = z.object({
  name: z.string(),
  message: z.string(),
  stack: z.string().optional(),
});

export const deterministicSchema = z.object({
  seed: z.number(),
  epochMs: z.number(),
  tickMs: z.number(),
  timezone: z.string().optional(),
});

export const captureSchema = z.object({
  version: z.literal(1),
  captureId: z.string(),
  app: z.string(),
  operation: z.string(),
  capturedAt: z.string(),
  deterministic: deterministicSchema,
  input: jsonValueSchema,
  context: jsonValueSchema.optional(),
  logs: z.array(
    z.object({
      tsOffsetMs: z.number(),
      level: z.enum(["info", "warn", "error", "debug"]),
      message: z.string(),
      meta: jsonValueSchema.optional(),
    })
  ),
  externalCalls: z.array(
    z.object({
      kind: z.enum(["http", "db"]),
      name: z.string(),
      request: jsonValueSchema,
      response: jsonValueSchema.optional(),
      error: z.string().optional(),
    })
  ),
  dbSnapshotPath: z.string().optional(),
  error: failureSchema,
  tags: z.array(z.string()).optional(),
});
