#!/usr/bin/env node
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Command } from "commander";
import { appendMetric, createCaptureStore, createRuntimeCapture, generateReproScript, minimizeInput, readMetrics, replayCapture, renderMetricsDashboardHtml, summarizeMetrics, writeMetricsDashboard, } from "@bugrepro/core";
const program = new Command();
program
    .name("bugrepro")
    .description("Capture production failures and replay them deterministically.")
    .version("0.1.0");
program
    .command("capture")
    .description("Capture an error from JSON files (for ingestion pipeline / CI).")
    .requiredOption("--app <name>", "application/service name")
    .requiredOption("--operation <name>", "failing operation name")
    .requiredOption("--input <path>", "JSON file containing failing input")
    .requiredOption("--error <path>", "JSON file containing error payload")
    .option("--context <path>", "JSON context metadata")
    .option("--capture-dir <path>", "output directory", "captures")
    .action(async (opts) => {
    const input = await readJsonFile(opts.input);
    const errorPayload = await readJsonFile(opts.error);
    const context = opts.context ? await readJsonFile(opts.context) : undefined;
    const runtime = createRuntimeCapture({
        app: opts.app,
        captureDir: opts.captureDir,
    });
    const error = new Error(String(errorPayload.message ?? "Captured error"));
    error.name = String(errorPayload.name ?? "CapturedError");
    if (typeof errorPayload.stack === "string") {
        error.stack = String(errorPayload.stack);
    }
    const output = await runtime.captureFromError(opts.operation, input, error, { context });
    console.log(output.capturePath);
});
program
    .command("list")
    .description("List saved capture files.")
    .option("--capture-dir <path>", "capture directory", "captures")
    .action(async (opts) => {
    const store = createCaptureStore(opts.captureDir);
    const files = await store.list();
    if (files.length === 0) {
        console.log("(no captures)");
        return;
    }
    for (const file of files) {
        console.log(file);
    }
});
program
    .command("replay")
    .description("Replay a capture with deterministic runtime + mocked dependencies.")
    .requiredOption("--capture <path>", "capture file path")
    .requiredOption("--adapter <path>", "adapter module path, exporting `adapter`")
    .option("--metrics-file <path>", "append replay metrics to NDJSON file")
    .option("--baseline-minutes <number>", "historical debug time (for impact metrics)")
    .option("--replay-minutes <number>", "actual debug time with bugrepro")
    .action(async (opts) => {
    const adapter = await loadAdapter(opts.adapter);
    const capturePath = path.resolve(opts.capture);
    const result = await replayCapture({
        capturePath,
        adapter,
    });
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
program
    .command("generate")
    .description("Generate standalone local repro script from a capture.")
    .requiredOption("--capture <path>", "capture file path")
    .requiredOption("--out <path>", "output script path")
    .requiredOption("--adapter <module>", "module path as it should be imported in script")
    .action(async (opts) => {
    await generateReproScript(path.resolve(opts.capture), path.resolve(opts.out), opts.adapter);
    console.log(path.resolve(opts.out));
});
program
    .command("ci-attach")
    .description("Generate repro script in CI artifact directory for failed runs.")
    .requiredOption("--capture <path>", "capture file path")
    .requiredOption("--adapter <module>", "adapter module import path used in generated script")
    .option("--artifacts <path>", "artifact output directory", "ci-artifacts")
    .action(async (opts) => {
    const capturePath = path.resolve(opts.capture);
    const base = path.basename(capturePath, ".json");
    const out = path.resolve(opts.artifacts, `${base}.repro.mjs`);
    await generateReproScript(capturePath, out, opts.adapter);
    console.log(out);
});
program
    .command("minimize")
    .description("Find a smaller failing input while preserving failure behavior.")
    .requiredOption("--capture <path>", "capture file path")
    .requiredOption("--adapter <path>", "adapter module path, exporting `stillFails(input, capture)` OR `adapter`")
    .option("--out <path>", "where to write minimized capture", "captures/minimized.json")
    .action(async (opts) => {
    const capturePath = path.resolve(opts.capture);
    const store = createCaptureStore(path.dirname(capturePath));
    const capture = await store.read(capturePath);
    const mod = await import(pathToFileURL(path.resolve(opts.adapter)).href);
    const stillFails = await buildStillFails(mod, capture);
    const minimizedInput = await minimizeInput(capture.input, (candidate) => stillFails(candidate));
    const minimizedCapture = {
        ...capture,
        input: minimizedInput,
        tags: [...(capture.tags ?? []), "minimized"],
    };
    const outPath = path.resolve(opts.out);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, JSON.stringify(minimizedCapture, null, 2), "utf8");
    console.log(outPath);
});
program
    .command("metrics")
    .description("Summarize and render bug reproduction impact metrics.")
    .requiredOption("--in <path>", "metrics NDJSON input")
    .option("--out <path>", "dashboard HTML output", "reports/impact-dashboard.html")
    .action(async (opts) => {
    const rows = await readMetrics(path.resolve(opts.in));
    const summary = summarizeMetrics(rows);
    await writeMetricsDashboard(path.resolve(opts.out), summary, rows);
    console.log(JSON.stringify(summary, null, 2));
    console.log(`dashboard: ${path.resolve(opts.out)}`);
});
program
    .command("dashboard")
    .description("Serve impact metrics dashboard locally.")
    .requiredOption("--in <path>", "metrics NDJSON input")
    .option("--host <host>", "host", "127.0.0.1")
    .option("--port <number>", "port", "4173")
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
        }
        catch (err) {
            res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
            res.end(err.stack ?? String(err));
        }
    });
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => resolve());
    });
    const url = `http://${host}:${port}`;
    console.log(`dashboard server: ${url}`);
    console.log(`source: ${inputFile}`);
});
program.parseAsync(process.argv).catch((err) => {
    const e = err;
    console.error(e.stack ?? e.message);
    process.exit(1);
});
async function readJsonFile(filePath) {
    const raw = await fs.readFile(path.resolve(filePath), "utf8");
    return JSON.parse(raw);
}
async function loadAdapter(filePath) {
    const mod = await import(pathToFileURL(path.resolve(filePath)).href);
    if (!mod.adapter || typeof mod.adapter.run !== "function") {
        throw new Error(`Adapter module must export { adapter: { run(input, capture) } }`);
    }
    return mod.adapter;
}
function numOrUndefined(v) {
    if (v === undefined || v === null || v === "")
        return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
}
async function buildStillFails(mod, capture) {
    if (typeof mod.stillFails === "function") {
        return async (input) => {
            return Boolean(await mod.stillFails(input, capture));
        };
    }
    if (mod.adapter && typeof mod.adapter.run === "function") {
        return async (input) => {
            try {
                await mod.adapter.run(input, capture);
                return false;
            }
            catch {
                return true;
            }
        };
    }
    throw new Error("Adapter must export stillFails(input, capture) or adapter.run(input, capture)");
}
//# sourceMappingURL=index.js.map