# BugReproducer

A TypeScript monorepo for runtime bug reproduction:

- Capture production failure context (input, logs, external calls, deterministic runtime config)
- Replay failures locally with deterministic `Date.now()` + `Math.random()` behavior
- Generate standalone repro scripts for local debugging or CI artifacts
- Minimize failing inputs
- Track impact metrics (debug time before vs after, auto-repro rate, replay success %)

## Project Layout

- `packages/core`: capture/replay engine and metrics primitives
- `packages/cli`: `bugrepro` command line tool
- `examples`: demo failing workload + replay adapter
- `.github/workflows/ci.yml`: sample CI integration with artifact upload

## Quick Start

```bash
cd bugreproducer
npm install
npm run build
```

### 1) Simulate a production failure capture

```bash
node examples/failing-production-sim.mjs
```

This writes a capture file into `captures/`.

### 2) Replay deterministically

```bash
node packages/cli/dist/index.js replay \
  --capture captures/<capture-file>.json \
  --adapter examples/replay-adapter.mjs
```

### 3) Generate standalone repro script

```bash
node packages/cli/dist/index.js generate \
  --capture captures/<capture-file>.json \
  --out captures/repro.mjs \
  --adapter "../examples/replay-adapter.mjs"
```

### 4) Minimize failing input

```bash
node packages/cli/dist/index.js minimize \
  --capture captures/<capture-file>.json \
  --adapter examples/replay-adapter.mjs \
  --out captures/minimized.json
```

### 5) Track impact metrics + dashboard

```bash
node packages/cli/dist/index.js replay \
  --capture captures/<capture-file>.json \
  --adapter examples/replay-adapter.mjs \
  --metrics-file reports/metrics.ndjson \
  --baseline-minutes 90 \
  --replay-minutes 18

node packages/cli/dist/index.js metrics \
  --in reports/metrics.ndjson \
  --out reports/impact-dashboard.html

node packages/cli/dist/index.js dashboard \
  --in reports/metrics.ndjson \
  --host 127.0.0.1 \
  --port 4173
```

## CLI Commands

- `bugrepro capture`: ingest captured input + error payload into capture record
- `bugrepro list`: list capture files
- `bugrepro replay`: deterministic replay with adapter module
- `bugrepro generate`: build standalone repro script
- `bugrepro ci-attach`: generate repro script in CI artifact folder
- `bugrepro minimize`: shrink failing input while preserving failure
- `bugrepro metrics`: summarize metrics and generate dashboard HTML
- `bugrepro dashboard`: serve a live local dashboard from metrics NDJSON

## Architecture

Pipeline:

1. Capture: on production exception, serialize input, context, logs, external call records, and deterministic seed/clock config into `captures/*.json`.
2. Reconstruct: replay locally with deterministic runtime hooks and captured API/DB responses via mocks.
3. Minimize: reduce captured input using a delta-debug style loop while preserving failure.
4. Generate: produce a standalone repro script for one-command local execution.
5. Integrate: attach capture + repro scripts to CI artifacts for failed builds.
6. Measure: track before/after debug time and replay success metrics.

Core modules:

- Capture and schema validation: [`packages/core/src/capture.ts`](packages/core/src/capture.ts), [`packages/core/src/schema.ts`](packages/core/src/schema.ts)
- Deterministic runtime: [`packages/core/src/deterministic.ts`](packages/core/src/deterministic.ts)
- Replay and script generation: [`packages/core/src/replay.ts`](packages/core/src/replay.ts)
- Minimization: [`packages/core/src/minimize.ts`](packages/core/src/minimize.ts)
- Impact metrics and dashboard renderer: [`packages/core/src/metrics.ts`](packages/core/src/metrics.ts)
- CLI orchestration: [`packages/cli/src/index.ts`](packages/cli/src/index.ts)

## Results Template

Use this section to publish concrete impact once you gather production data:

- Bugs auto-captured: `N`
- Bugs successfully replayed: `M`
- Replay success rate: `M / N`
- Median debug time before: `X min`
- Median debug time after: `Y min`
- Median time saved per incident: `X - Y min`
- CI failed runs with attached repro artifacts: `K`

Example resume bullets:

- Built a runtime bug reproducer CLI that captures production failures and generates deterministic local replay scripts, improving reproducibility from `<baseline%>` to `<target%>`.
- Added input minimization and CI artifact integration, reducing median time-to-debug from `<X>` minutes to `<Y>` minutes.
- Implemented replay impact analytics dashboard adopted by `<team/service>`, tracking replay success rate and debug-time savings across incidents.

## Capture Model

Capture files include:

- App + operation metadata
- Serialized input + optional context
- Logs captured around failure
- External call records for HTTP/DB mocking
- Deterministic config (seed, epoch, tick) for replay
- Error summary (name, message, stack)

## Resume-Ready Talking Points

- Deterministic replay layer for flaky/non-deterministic bug reconstruction
- Input delta-debug style minimization to isolate smallest failing payload
- CI integration that auto-attaches replay scripts as artifacts for failed runs
- Observable impact metrics (mean debug time before/after, % auto-reproduced, replay success rate)
