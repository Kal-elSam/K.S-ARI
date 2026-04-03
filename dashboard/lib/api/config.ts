import { fetchAPI } from "./client";
import type { BusinessConfig, UpdateConfigResponse } from "./types";

export function getConfig(businessId: string): Promise<BusinessConfig> {
  return fetchAPI<BusinessConfig>(`/api/config/${encodeURIComponent(businessId)}`);
}

export function updateConfig(businessId: string, data: BusinessConfig): Promise<UpdateConfigResponse> {
  return fetchAPI<UpdateConfigResponse>(`/api/config/${encodeURIComponent(businessId)}`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}
