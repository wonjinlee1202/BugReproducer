#!/usr/bin/env node
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Command } from "commander";
import {
  appendMetric,
  createCaptureStore,
  createRuntimeCapture,
  generateReproScript,
  minimizeInput,
  readMetrics,
  replayCapture,
  renderMetricsDashboardHtml,
  summarizeMetrics,
  writeMetricsDashboard,
  type CaptureRecord,
  type JsonValue,
  type ReplayAdapter,
} from "./index.js";

const program = new Command();

program
  .name("bugrepro")
  .description("Capture production failures and replay them deterministically.")
  .version("0.1.0");

// ── capture ──────────────────────────────────────────────────────────────────
program
  .command("capture")
  .description("Ingest an error + input payload into a capture file.")
  .requiredOption("--app <name>", "application/service name")
  .requiredOption("--operation <name>", "failing operation name")
  .requiredOption("--input <path>", "JSON file containing failing input")
  .requiredOption("--error <path>", "JSON file containing error payload")
  .option("--context <path>", "optional JSON context metadata")
  .option("--capture-dir <path>", "output directory for captures", "captures")
  .action(async (opts) => {
    const input = await readJsonFile(opts.input);
    const errorPayload = await readJsonFile(opts.error);
    const context = opts.context ? await readJsonFile(opts.context) : undefined;

    const runtime = createRuntimeCapture({ app: opts.app, captureDir: opts.captureDir });
    const error = new Error(String((errorPayload as any).message ?? "Captured error"));
    error.name = String((errorPayload as any).name ?? "CapturedError");
    if (typeof (errorPayload as any).stack === "string") {
      error.stack = String((errorPayload as any).stack);
    }

    const output = await runtime.captureFromError(opts.operation, input, error, { context });
    console.log(output.capturePath);
  });

// ── list ─────────────────────────────────────────────────────────────────────
program
  .command("list")
  .description("List all capture files.")
  .option("--capture-dir <path>", "capture directory", "captures")
  .action(async (opts) => {
    const store = createCaptureStore(opts.captureDir);
    const files = await store.list();
    if (files.length === 0) {
      console.log("(no captures)");
      return;
    }
    for (const file of files) console.log(file);
  });

// ── replay ───────────────────────────────────────────────────────────────────
program
  .command("replay")
  .description("Replay a capture deterministically with mocked dependencies.")
  .requiredOption("--capture <path>", "capture file path")
  .requiredOption("--adapter <path>", "path to adapter module (exports `adapter`)")
  .option("--metrics-file <path>", "append replay result to a metrics NDJSON file")
  .option("--baseline-minutes <number>", "historical debug time before bugrepro (for metrics)")
  .option("--replay-minutes <number>", "actual debug time with bugrepro (for metrics)")
  .action(async (opts) => {
    const adapter = await loadAdapter(opts.adapter);
    const capturePath = path.resolve(opts.capture);
    const result = await replayCapture({ capturePath, adapter });

    if (opts.metricsFile) {
      const store = createCaptureStore(path.dirname(capturePath));
      const capture = await store.read(capturePath);
      await appendMetric(path.resolve(opts.metricsFile), {
        bugId: capture.captureId,
        capturedAt: capture.capturedAt,
        replayedAt: new Date().toISOString(),
        replaySuccess: !result.ok,
        baselineDebugMinutes: numOrUndefined(opts.baselineMinutes),
        replayDebugMinutes: numOrUndefined(opts.replayMinutes),
      });
    }

    if (result.ok) {
      console.log("Replay completed with no error.");
      return;
    }
    console.error(`Reproduced failure: ${result.error?.name}: ${result.error?.message}`);
    process.exitCode = 1;
  });

// ── generate ─────────────────────────────────────────────────────────────────
program
  .command("generate")
  .description("Generate a standalone one-command repro script from a capture.")
  .requiredOption("--capture <path>", "capture file path")
  .requiredOption("--adapter <path>", "path to your adapter module")
  .option("--out <path>", "output script path", "repros/repro.mjs")
  .action(async (opts) => {
    const out = path.resolve(opts.out);
    await generateReproScript(
      path.resolve(opts.capture),
      out,
      path.resolve(opts.adapter),
    );
    console.log(out);
  });

// ── ci-attach ────────────────────────────────────────────────────────────────
program
  .command("ci-attach")
  .description("Generate a repro script in a CI artifact directory for failed runs.")
  .requiredOption("--capture <path>", "capture file path")
  .requiredOption("--adapter <path>", "path to your adapter module")
  .option("--artifacts <path>", "artifact output directory", "repros")
  .action(async (opts) => {
    const capturePath = path.resolve(opts.capture);
    const base = path.basename(capturePath, ".json");
    const out = path.resolve(opts.artifacts, `${base}.repro.mjs`);
    await generateReproScript(capturePath, out, path.resolve(opts.adapter));
    console.log(out);
  });

// ── minimize ─────────────────────────────────────────────────────────────────
program
  .command("minimize")
  .description("Shrink the failing input to the smallest version that still reproduces the failure.")
  .requiredOption("--capture <path>", "capture file path")
  .requiredOption("--adapter <path>", "path to adapter module (exports `stillFails` or `adapter`)")
  .option("--out <path>", "where to write minimized capture", "captures/minimized.json")
  .action(async (opts) => {
    const capturePath = path.resolve(opts.capture);
    const store = createCaptureStore(path.dirname(capturePath));
    const capture = await store.read(capturePath);

    const mod = await import(pathToFileURL(path.resolve(opts.adapter)).href);
    const stillFails = buildStillFails(mod, capture);

    const minimizedInput = await minimizeInput(capture.input, (candidate) => stillFails(candidate));
    const minimizedCapture: CaptureRecord = {
      ...capture,
      input: minimizedInput,
      tags: [...(capture.tags ?? []), "minimized"],
    };

    const outPath = path.resolve(opts.out);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, JSON.stringify(minimizedCapture, null, 2), "utf8");
    console.log(outPath);
  });

// ── metrics ───────────────────────────────────────────────────────────────────
program
  .command("metrics")
  .description("Summarize replay metrics and write an HTML impact dashboard.")
  .requiredOption("--in <path>", "metrics NDJSON input file")
  .option("--out <path>", "dashboard HTML output path", "reports/impact-dashboard.html")
  .action(async (opts) => {
    const rows = await readMetrics(path.resolve(opts.in));
    const summary = summarizeMetrics(rows);
    await writeMetricsDashboard(path.resolve(opts.out), summary, rows);
    console.log(JSON.stringify(summary, null, 2));
    console.log(`dashboard: ${path.resolve(opts.out)}`);
  });

// ── dashboard ────────────────────────────────────────────────────────────────
program
  .command("dashboard")
  .description("Serve a live metrics dashboard in your browser.")
  .requiredOption("--in <path>", "metrics NDJSON input file")
  .option("--host <host>", "host to listen on", "127.0.0.1")
  .option("--port <number>", "port to listen on", "4173")
  .action(async (opts) => {
    const inputFile = path.resolve(opts.in);
    const host = String(opts.host);
    const port = Number(opts.port);
    if (!Number.isFinite(port) || port <= 0) {
      throw new Error(`Invalid port: ${opts.port}`);
    }

    const server = http.createServer(async (_req, res) => {
      try {
        const rows = await readMetrics(inputFile);
        const summary = summarizeMetrics(rows);
        const html = renderMetricsDashboardHtml(summary, rows);
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        res.end(html);
      } catch (err) {
        res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
        res.end((err as Error).stack ?? String(err));
      }
    });

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, () => resolve());
    });

    console.log(`dashboard: http://${host}:${port}`);
    console.log(`source:    ${inputFile}`);
  });

program.parseAsync(process.argv).catch((err) => {
  const e = err as Error;
  console.error(e.stack ?? e.message);
  process.exit(1);
});

// ── helpers ───────────────────────────────────────────────────────────────────

async function readJsonFile(filePath: string): Promise<JsonValue> {
  const raw = await fs.readFile(path.resolve(filePath), "utf8");
  return JSON.parse(raw) as JsonValue;
}

async function loadAdapter(filePath: string): Promise<ReplayAdapter> {
  const mod = await import(pathToFileURL(path.resolve(filePath)).href);
  if (!mod.adapter || typeof mod.adapter.run !== "function") {
    throw new Error("Adapter module must export { adapter: { run(input, capture) } }");
  }
  return mod.adapter as ReplayAdapter;
}

function numOrUndefined(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function buildStillFails(
  mod: Record<string, unknown>,
  capture: CaptureRecord
): (input: JsonValue) => Promise<boolean> {
  if (typeof mod.stillFails === "function") {
    return async (input) =>
      Boolean(await (mod.stillFails as (x: JsonValue, c: CaptureRecord) => Promise<boolean>)(input, capture));
  }
  if (mod.adapter && typeof (mod.adapter as ReplayAdapter).run === "function") {
    return async (input) => {
      try {
        await (mod.adapter as ReplayAdapter).run(input, capture);
        return false;
      } catch {
        return true;
      }
    };
  }
  throw new Error("Adapter must export stillFails(input, capture) or adapter.run(input, capture)");
}
