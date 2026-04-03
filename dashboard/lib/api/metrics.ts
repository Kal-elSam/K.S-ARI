import { fetchAPI } from "./client";
import type { MetricsResponse } from "./types";

export function getMetrics(): Promise<MetricsResponse> {
  return fetchAPI<MetricsResponse>("/api/metrics");
}
