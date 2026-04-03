export const ARI_BUSINESS_CONFIG_UPDATED = "ari-business-config-updated" as const;

export function notifyBusinessConfigUpdated(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent(ARI_BUSINESS_CONFIG_UPDATED));
}
