import type { ReproMetrics } from "./types.js";
export interface MetricsSummary {
    totalBugs: number;
    autoReproduced: number;
    replaySuccessRate: number;
    averageDebugMinutesBefore: number;
    averageDebugMinutesAfter: number;
    averageMinutesSaved: number;
}
export declare function appendMetric(metricsFile: string, metric: ReproMetrics): Promise<void>;
export declare function readMetrics(metricsFile: string): Promise<ReproMetrics[]>;
export declare function summarizeMetrics(metrics: ReproMetrics[]): MetricsSummary;
export declare function writeMetricsDashboard(outFile: string, summary: MetricsSummary, rows: ReproMetrics[]): Promise<void>;
export declare function renderMetricsDashboardHtml(summary: MetricsSummary, rows: ReproMetrics[]): string;
