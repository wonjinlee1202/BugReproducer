import fs from "node:fs/promises";
import path from "node:path";
import type { ReproMetrics } from "./types.js";

export interface MetricsSummary {
  totalBugs: number;
  autoReproduced: number;
  replaySuccessRate: number;
  averageDebugMinutesBefore: number;
  averageDebugMinutesAfter: number;
  averageMinutesSaved: number;
  totalMinutesSaved: number;
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((acc, n) => acc + n, 0) / nums.length;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function appendMetric(metricsFile: string, metric: ReproMetrics): Promise<void> {
  await fs.mkdir(path.dirname(metricsFile), { recursive: true });
  await fs.appendFile(metricsFile, `${JSON.stringify(metric)}\n`, "utf8");
}

export async function upsertMetric(metricsFile: string, update: Partial<ReproMetrics> & { bugId: string }): Promise<void> {
  const existing = await readMetrics(metricsFile);
  const idx = existing.findIndex((m) => m.bugId === update.bugId);
  if (idx >= 0) {
    existing[idx] = { ...existing[idx], ...update };
  } else {
    existing.push(update as ReproMetrics);
  }
  await fs.mkdir(path.dirname(metricsFile), { recursive: true });
  await fs.writeFile(metricsFile, existing.map((m) => JSON.stringify(m)).join("\n") + "\n", "utf8");
}

export async function readMetrics(metricsFile: string): Promise<ReproMetrics[]> {
  try {
    const raw = await fs.readFile(metricsFile, "utf8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ReproMetrics);
  } catch {
    return [];
  }
}

export function summarizeMetrics(metrics: ReproMetrics[]): MetricsSummary {
  const totalBugs = metrics.length;
  const autoReproduced = metrics.filter((m) => m.replaySuccess === true).length;
  const replaySuccessRate = totalBugs === 0 ? 0 : autoReproduced / totalBugs;

  const before = metrics.map((m) => m.baselineDebugMinutes).filter((v): v is number => typeof v === "number");
  const after = metrics.map((m) => m.replayDebugMinutes).filter((v): v is number => typeof v === "number");

  const paired = metrics.filter(
    (m) => typeof m.baselineDebugMinutes === "number" && typeof m.replayDebugMinutes === "number"
  );
  const totalMinutesSaved = paired.reduce(
    (sum, m) => sum + m.baselineDebugMinutes! - m.replayDebugMinutes!,
    0
  );

  return {
    totalBugs,
    autoReproduced,
    replaySuccessRate,
    averageDebugMinutesBefore: mean(before),
    averageDebugMinutesAfter: mean(after),
    averageMinutesSaved: mean(before) - mean(after),
    totalMinutesSaved,
  };
}

export async function writeMetricsDashboard(
  outFile: string,
  summary: MetricsSummary,
  rows: ReproMetrics[]
): Promise<void> {
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, renderMetricsDashboardHtml(summary, rows), "utf8");
}

export function renderMetricsDashboardHtml(summary: MetricsSummary, rows: ReproMetrics[]): string {
  const updatedAt = new Date().toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const timedRows = rows.filter(
    (r) => typeof r.baselineDebugMinutes === "number" && typeof r.replayDebugMinutes === "number"
  );
  const maxMinutes = timedRows.length > 0
    ? Math.max(...timedRows.map((r) => Math.max(r.baselineDebugMinutes!, r.replayDebugMinutes!)))
    : 0;

  const successRatePct = (summary.replaySuccessRate * 100).toFixed(0);
  const successColor = summary.replaySuccessRate >= 0.8 ? "#16a34a" : summary.replaySuccessRate >= 0.5 ? "#d97706" : "#dc2626";

  // ── SVG bar chart ────────────────────────────────────────────────────────
  const LABEL_W = 140;
  const BAR_W = 360;
  const VAL_W = 80;
  const SVG_W = LABEL_W + BAR_W + VAL_W;
  const ROW_H = 52;
  const LEGEND_H = 36;
  const chartH = timedRows.length * ROW_H + LEGEND_H;
  const scale = maxMinutes > 0 ? BAR_W / maxMinutes : 1;

  const chartSvg = timedRows.length === 0 ? "" : `
    <div class="section">
      <div class="section-title">Debug Time: Before vs. After BugReproducer</div>
      <svg viewBox="0 0 ${SVG_W} ${chartH}" xmlns="http://www.w3.org/2000/svg" class="chart-svg" aria-label="Bar chart comparing debug time before and after using BugReproducer">
        <rect x="${LABEL_W}" y="10" width="10" height="10" rx="2" fill="#94a3b8"/>
        <text x="${LABEL_W + 14}" y="20" font-size="11" fill="#64748b" font-family="system-ui,sans-serif">Before</text>
        <rect x="${LABEL_W + 68}" y="10" width="10" height="10" rx="2" fill="#4ade80"/>
        <text x="${LABEL_W + 82}" y="20" font-size="11" fill="#16a34a" font-family="system-ui,sans-serif">After</text>
        ${timedRows.map((row, i) => {
          const y = i * ROW_H + LEGEND_H;
          const label = esc((row.operation ?? row.bugId.slice(-10)).slice(0, 18));
          const bW = Math.round(row.baselineDebugMinutes! * scale);
          const rW = Math.round(row.replayDebugMinutes! * scale);
          const saved = row.baselineDebugMinutes! - row.replayDebugMinutes!;
          return `
            <text x="${LABEL_W - 8}" y="${y + 11}" font-size="11" fill="#475569" font-family="system-ui,sans-serif" text-anchor="end">${label}</text>
            <rect x="${LABEL_W}" y="${y}" width="${Math.max(bW, 2)}" height="14" rx="3" fill="#94a3b8"/>
            <text x="${LABEL_W + bW + 5}" y="${y + 11}" font-size="11" fill="#64748b" font-family="system-ui,sans-serif">${row.baselineDebugMinutes}m</text>
            <rect x="${LABEL_W}" y="${y + 18}" width="${Math.max(rW, 2)}" height="14" rx="3" fill="#4ade80"/>
            <text x="${LABEL_W + rW + 5}" y="${y + 29}" font-size="11" fill="#16a34a" font-family="system-ui,sans-serif">${row.replayDebugMinutes}m</text>
            <text x="${LABEL_W + BAR_W + 6}" y="${y + 20}" font-size="11" fill="#16a34a" font-weight="600" font-family="system-ui,sans-serif">−${saved}m</text>
          `;
        }).join("")}
      </svg>
    </div>`;

  // ── Table rows ────────────────────────────────────────────────────────────
  const tableRows = rows.map((row) => {
    const saved = typeof row.baselineDebugMinutes === "number" && typeof row.replayDebugMinutes === "number"
      ? row.baselineDebugMinutes - row.replayDebugMinutes
      : undefined;
    const date = new Date(row.capturedAt).toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
    const badge = row.replaySuccess === true
      ? `<span class="badge ok">✓ reproduced</span>`
      : row.replaySuccess === false
      ? `<span class="badge fail">✗ not reproduced</span>`
      : `<span class="badge unknown">—</span>`;

    return `<tr>
      <td><span class="op-tag">${esc(row.operation ?? "—")}</span></td>
      <td><span class="err-msg" title="${esc(row.errorMessage ?? "")}">${esc(row.errorMessage ?? "—")}</span></td>
      <td class="mono">${date}</td>
      <td>${badge}</td>
      <td class="num">${row.baselineDebugMinutes !== undefined ? `${row.baselineDebugMinutes}m` : `<span class="nd">—</span>`}</td>
      <td class="num">${row.replayDebugMinutes !== undefined ? `${row.replayDebugMinutes}m` : `<span class="nd">—</span>`}</td>
      <td class="num">${saved !== undefined ? `<span class="saved">−${saved}m</span>` : `<span class="nd">—</span>`}</td>
    </tr>`;
  }).join("\n");

  const emptyState = `
    <div class="empty">
      <div class="empty-icon">📭</div>
      <p>No captures recorded yet.</p>
      <p class="empty-hint">Run <code>npm run bugrepro -- replay --metrics-file reports/metrics.ndjson</code> to start tracking.</p>
    </div>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>BugReproducer · Dashboard</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
      background: #f1f5f9;
      color: #1e293b;
      min-height: 100vh;
      font-size: 14px;
    }

    /* ── Header ── */
    .header {
      background: #1e293b;
      color: #f8fafc;
      padding: 14px 32px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    }
    .header-title { font-size: 16px; font-weight: 700; letter-spacing: -0.01em; }
    .header-title em { font-style: normal; color: #818cf8; }
    .header-meta { font-size: 12px; color: #64748b; }

    /* ── Layout ── */
    .main { max-width: 1080px; margin: 0 auto; padding: 28px 20px; }

    /* ── KPI cards ── */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(155px, 1fr));
      gap: 14px;
      margin-bottom: 22px;
    }
    .kpi-card {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 16px 18px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.04);
    }
    .kpi-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: #94a3b8;
      margin-bottom: 6px;
    }
    .kpi-value {
      font-size: 30px;
      font-weight: 800;
      letter-spacing: -0.03em;
      line-height: 1;
      color: #1e293b;
    }
    .kpi-value.indigo { color: #6366f1; }
    .kpi-value.green  { color: #16a34a; }
    .kpi-sub { font-size: 11px; color: #94a3b8; margin-top: 5px; }

    /* ── Sections ── */
    .section {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 20px 22px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.04);
      margin-bottom: 16px;
    }
    .section-title {
      font-size: 13px;
      font-weight: 600;
      color: #475569;
      letter-spacing: 0.01em;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid #f1f5f9;
    }

    /* ── Chart ── */
    .chart-svg { width: 100%; height: auto; display: block; overflow: visible; }

    /* ── Table ── */
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; }
    thead tr { border-bottom: 1px solid #e2e8f0; }
    th {
      padding: 8px 12px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: #94a3b8;
      text-align: left;
      background: #f8fafc;
      white-space: nowrap;
    }
    td {
      padding: 11px 12px;
      border-bottom: 1px solid #f1f5f9;
      color: #334155;
      vertical-align: middle;
    }
    tr:last-child td { border-bottom: none; }
    tbody tr:hover td { background: #f8fafc; }

    .op-tag {
      display: inline-block;
      font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
      font-size: 11px;
      background: #eef2ff;
      color: #6366f1;
      padding: 2px 6px;
      border-radius: 5px;
      white-space: nowrap;
    }
    .err-msg {
      display: block;
      max-width: 220px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 12px;
      color: #64748b;
    }
    .mono { font-size: 12px; color: #64748b; white-space: nowrap; }
    .num  { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .nd   { color: #cbd5e1; }
    .saved { font-weight: 700; color: #16a34a; }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 3px 8px;
      border-radius: 99px;
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
    }
    .badge.ok      { background: #dcfce7; color: #16a34a; }
    .badge.fail    { background: #fee2e2; color: #dc2626; }
    .badge.unknown { background: #f1f5f9; color: #94a3b8; }

    /* ── Empty state ── */
    .empty { text-align: center; padding: 52px 24px; color: #94a3b8; }
    .empty-icon { font-size: 36px; margin-bottom: 12px; }
    .empty p { font-size: 14px; }
    .empty-hint { font-size: 12px; margin-top: 8px; }
    .empty code {
      font-family: ui-monospace, monospace;
      background: #f1f5f9;
      padding: 2px 5px;
      border-radius: 4px;
      color: #475569;
    }

    @media (max-width: 600px) {
      .kpi-grid { grid-template-columns: repeat(2, 1fr); }
      .main { padding: 16px 12px; }
      .header { padding: 12px 16px; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-title">Bug<em>Reproducer</em> <span style="color:#475569;font-weight:400"> / Dashboard</span></div>
    <div class="header-meta">Updated ${updatedAt}</div>
  </div>

  <div class="main">

    <!-- KPI cards -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Total Captures</div>
        <div class="kpi-value">${summary.totalBugs}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Auto Reproduced</div>
        <div class="kpi-value indigo">${summary.autoReproduced}</div>
        <div class="kpi-sub">of ${summary.totalBugs} captures</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Replay Success Rate</div>
        <div class="kpi-value" style="color:${successColor}">${successRatePct}%</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Avg Debug Time Before</div>
        <div class="kpi-value">${summary.averageDebugMinutesBefore > 0 ? `${summary.averageDebugMinutesBefore.toFixed(0)}m` : "—"}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Avg Debug Time After</div>
        <div class="kpi-value green">${summary.averageDebugMinutesAfter > 0 ? `${summary.averageDebugMinutesAfter.toFixed(0)}m` : "—"}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Total Time Saved</div>
        <div class="kpi-value green">${summary.totalMinutesSaved > 0 ? `${summary.totalMinutesSaved.toFixed(0)}m` : "—"}</div>
        ${summary.averageMinutesSaved > 0 ? `<div class="kpi-sub">${summary.averageMinutesSaved.toFixed(0)}m avg per bug</div>` : ""}
      </div>
    </div>

    <!-- Bar chart (only when timing data exists) -->
    ${chartSvg}

    <!-- Capture log table -->
    <div class="section">
      <div class="section-title">Capture Log</div>
      ${rows.length === 0 ? emptyState : `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Operation</th>
              <th>Error</th>
              <th>Captured</th>
              <th>Replay</th>
              <th style="text-align:right">Before</th>
              <th style="text-align:right">After</th>
              <th style="text-align:right">Saved</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>`}
    </div>

  </div>

  <script>
    // Auto-refresh every 5 seconds when served via the dashboard command
    if (window.location.protocol !== 'file:') {
      setInterval(() => location.reload(), 5000);
    }
  </script>
</body>
</html>`;
}
