import { z } from "zod";
export declare const jsonValueSchema: z.ZodType<unknown>;
export declare const failureSchema: z.ZodObject<{
    name: z.ZodString;
    message: z.ZodString;
    stack: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    message: string;
    name: string;
    stack?: string | undefined;
}, {
    message: string;
    name: string;
    stack?: string | undefined;
}>;
export declare const deterministicSchema: z.ZodObject<{
    seed: z.ZodNumber;
    epochMs: z.ZodNumber;
    tickMs: z.ZodNumber;
    timezone: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    seed: number;
    epochMs: number;
    tickMs: number;
    timezone?: string | undefined;
}, {
    seed: number;
    epochMs: number;
    tickMs: number;
    timezone?: string | undefined;
}>;
export declare const captureSchema: z.ZodObject<{
    version: z.ZodLiteral<1>;
    captureId: z.ZodString;
    app: z.ZodString;
    operation: z.ZodString;
    capturedAt: z.ZodString;
    deterministic: z.ZodObject<{
        seed: z.ZodNumber;
        epochMs: z.ZodNumber;
        tickMs: z.ZodNumber;
        timezone: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        seed: number;
        epochMs: number;
        tickMs: number;
        timezone?: string | undefined;
    }, {
        seed: number;
        epochMs: number;
        tickMs: number;
        timezone?: string | undefined;
    }>;
    input: z.ZodType<unknown, z.ZodTypeDef, unknown>;
    context: z.ZodOptional<z.ZodType<unknown, z.ZodTypeDef, unknown>>;
    logs: z.ZodArray<z.ZodObject<{
        tsOffsetMs: z.ZodNumber;
        level: z.ZodEnum<["info", "warn", "error", "debug"]>;
        message: z.ZodString;
        meta: z.ZodOptional<z.ZodType<unknown, z.ZodTypeDef, unknown>>;
    }, "strip", z.ZodTypeAny, {
        message: string;
        tsOffsetMs: number;
        level: "info" | "warn" | "error" | "debug";
        meta?: unknown;
    }, {
        message: string;
        tsOffsetMs: number;
        level: "info" | "warn" | "error" | "debug";
        meta?: unknown;
    }>, "many">;
    externalCalls: z.ZodArray<z.ZodObject<{
        kind: z.ZodEnum<["http", "db"]>;
        name: z.ZodString;
        request: z.ZodType<unknown, z.ZodTypeDef, unknown>;
        response: z.ZodOptional<z.ZodType<unknown, z.ZodTypeDef, unknown>>;
        error: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        kind: "http" | "db";
        error?: string | undefined;
        request?: unknown;
        response?: unknown;
    }, {
        name: string;
        kind: "http" | "db";
        error?: string | undefined;
        request?: unknown;
        response?: unknown;
    }>, "many">;
    dbSnapshotPath: z.ZodOptional<z.ZodString>;
    error: z.ZodObject<{
        name: z.ZodString;
        message: z.ZodString;
        stack: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        message: string;
        name: string;
        stack?: string | undefined;
    }, {
        message: string;
        name: string;
        stack?: string | undefined;
    }>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    version: 1;
    captureId: string;
    app: string;
    operation: string;
    capturedAt: string;
    deterministic: {
        seed: number;
        epochMs: number;
        tickMs: number;
        timezone?: string | undefined;
    };
    logs: {
        message: string;
        tsOffsetMs: number;
        level: "info" | "warn" | "error" | "debug";
        meta?: unknown;
    }[];
    error: {
        message: string;
        name: string;
        stack?: string | undefined;
    };
    externalCalls: {
        name: string;
        kind: "http" | "db";
        error?: string | undefined;
        request?: unknown;
        response?: unknown;
    }[];
    input?: unknown;
    context?: unknown;
    dbSnapshotPath?: string | undefined;
    tags?: string[] | undefined;
}, {
    version: 1;
    captureId: string;
    app: string;
    operation: string;
    capturedAt: string;
    deterministic: {
        seed: number;
        epochMs: number;
        tickMs: number;
        timezone?: string | undefined;
    };
    logs: {
        message: string;
        tsOffsetMs: number;
        level: "info" | "warn" | "error" | "debug";
        meta?: unknown;
    }[];
    error: {
        message: string;
        name: string;
        stack?: string | undefined;
    };
    externalCalls: {
        name: string;
        kind: "http" | "db";
        error?: string | undefined;
        request?: unknown;
        response?: unknown;
    }[];
    input?: unknown;
    context?: unknown;
    dbSnapshotPath?: string | undefined;
    tags?: string[] | undefined;
}>;
