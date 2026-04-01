import fs from "node:fs/promises";
import path from "node:path";
function mean(nums) {
    if (nums.length === 0)
        return 0;
    return nums.reduce((acc, n) => acc + n, 0) / nums.length;
}
export async function appendMetric(metricsFile, metric) {
    await fs.mkdir(path.dirname(metricsFile), { recursive: true });
    await fs.appendFile(metricsFile, `${JSON.stringify(metric)}\n`, "utf8");
}
export async function readMetrics(metricsFile) {
    try {
        const raw = await fs.readFile(metricsFile, "utf8");
        return raw
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => JSON.parse(line));
    }
    catch {
        return [];
    }
}
export function summarizeMetrics(metrics) {
    const totalBugs = metrics.length;
    const autoReproduced = metrics.filter((m) => m.replaySuccess === true).length;
    const replaySuccessRate = totalBugs === 0 ? 0 : autoReproduced / totalBugs;
    const before = metrics
        .map((m) => m.baselineDebugMinutes)
        .filter((v) => typeof v === "number");
    const after = metrics
        .map((m) => m.replayDebugMinutes)
        .filter((v) => typeof v === "number");
    const averageDebugMinutesBefore = mean(before);
    const averageDebugMinutesAfter = mean(after);
    const averageMinutesSaved = averageDebugMinutesBefore - averageDebugMinutesAfter;
    return {
        totalBugs,
        autoReproduced,
        replaySuccessRate,
        averageDebugMinutesBefore,
        averageDebugMinutesAfter,
        averageMinutesSaved,
    };
}
export async function writeMetricsDashboard(outFile, summary, rows) {
    const html = renderMetricsDashboardHtml(summary, rows);
    await fs.mkdir(path.dirname(outFile), { recursive: true });
    await fs.writeFile(outFile, html, "utf8");
}
export function renderMetricsDashboardHtml(summary, rows) {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>BugReproducer Metrics</title>
  <style>
    :root {
      --bg: #f4efe6;
      --panel: #fff9f2;
      --ink: #221f1a;
      --accent: #ca5d1f;
      --muted: #5e5a52;
      --ok: #287a4c;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--ink);
      background:
        radial-gradient(circle at 8% 10%, #ffe3c9 0%, transparent 35%),
        radial-gradient(circle at 90% 85%, #ffd9b8 0%, transparent 30%),
        var(--bg);
      font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", serif;
      padding: 24px;
    }
    h1 { margin: 0 0 20px 0; letter-spacing: 0.02em; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 14px;
      margin-bottom: 24px;
    }
    .card {
      background: var(--panel);
      border: 1px solid #ead6c2;
      border-radius: 12px;
      padding: 14px;
      box-shadow: 0 6px 18px rgba(41, 29, 15, 0.06);
    }
    .k { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; }
    .v { font-size: 27px; margin-top: 6px; color: var(--accent); }
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--panel);
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid #ead6c2;
    }
    th, td {
      padding: 10px;
      text-align: left;
      border-bottom: 1px solid #efe2d5;
      font-size: 14px;
    }
    th { background: #f8ede1; }
    tr:last-child td { border-bottom: none; }
    .ok { color: var(--ok); font-weight: 700; }
  </style>
</head>
<body>
  <h1>BugReproducer Impact Dashboard</h1>
  <div class="grid">
    <div class="card"><div class="k">Total Bugs</div><div class="v">${summary.totalBugs}</div></div>
    <div class="card"><div class="k">Auto Reproduced</div><div class="v">${summary.autoReproduced}</div></div>
    <div class="card"><div class="k">Replay Success Rate</div><div class="v">${(summary.replaySuccessRate * 100).toFixed(1)}%</div></div>
    <div class="card"><div class="k">Avg Debug Time Before</div><div class="v">${summary.averageDebugMinutesBefore.toFixed(1)}m</div></div>
    <div class="card"><div class="k">Avg Debug Time After</div><div class="v">${summary.averageDebugMinutesAfter.toFixed(1)}m</div></div>
    <div class="card"><div class="k">Avg Time Saved</div><div class="v">${summary.averageMinutesSaved.toFixed(1)}m</div></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Bug ID</th>
        <th>Captured At</th>
        <th>Replayed</th>
        <th>Before (min)</th>
        <th>After (min)</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map((row) => {
        return `<tr>
          <td>${row.bugId}</td>
          <td>${row.capturedAt}</td>
          <td class="${row.replaySuccess ? "ok" : ""}">${row.replaySuccess ? "yes" : "no"}</td>
          <td>${row.baselineDebugMinutes ?? "-"}</td>
          <td>${row.replayDebugMinutes ?? "-"}</td>
        </tr>`;
    }).join("\n")}
    </tbody>
  </table>
</body>
</html>`;
}
//# sourceMappingURL=metrics.js.map