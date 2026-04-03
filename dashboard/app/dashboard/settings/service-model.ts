import type { BusinessService } from "@/lib/api";
import type { ServiceItem } from "./settings-types";

export function isLegacyServiceRow(
  service: unknown
): service is { name?: string; duration?: number; price?: number } {
  if (service === null || typeof service !== "object") {
    return false;
  }
  const row = service as Record<string, unknown>;
  return row.price_type === undefined || row.price_type === null || row.price_type === "";
}

export function toServiceItem(service: unknown, index: number): ServiceItem {
  const id = `s-${Date.now()}-${index}`;
  if (isLegacyServiceRow(service)) {
    const duration = typeof service.duration === "number" ? service.duration : null;
    return {
      id,
      name: String(service.name ?? ""),
      description: "",
      price_type: "per_session",
      price: typeof service.price === "number" ? service.price : 0,
      quotePrice: false,
      setup_fee: null,
      currency: "MXN",
      duration,
      durationApplies: duration != null,
    };
  }

  const s = service as BusinessService;
  const priceType = (["one_time", "monthly", "annual", "per_session"] as const).includes(s.price_type)
    ? s.price_type
    : "one_time";
  const rawDuration = s.duration;
  const duration =
    typeof rawDuration === "number" && !Number.isNaN(rawDuration) ? rawDuration : null;
  const setupRaw: unknown = s.setup_fee;
  let setupFee: number | null = null;
  if (setupRaw !== null && setupRaw !== undefined) {
    if (typeof setupRaw === "number" && !Number.isNaN(setupRaw)) {
      setupFee = setupRaw;
    } else if (typeof setupRaw === "string" && setupRaw.trim() !== "") {
      const n = Number(setupRaw);
      setupFee = Number.isNaN(n) ? null : n;
    }
  }

  const quotePrice = s.price === null;

  return {
    id,
    name: String(s.name ?? ""),
    description: String(s.description ?? ""),
    price_type: priceType,
    price: typeof s.price === "number" && !Number.isNaN(s.price) ? s.price : 0,
    quotePrice,
    setup_fee: setupFee != null && !Number.isNaN(setupFee) ? setupFee : null,
    currency: s.currency === "USD" ? "USD" : "MXN",
    duration,
    durationApplies: priceType === "per_session" && duration != null,
  };
}

export function serviceToPayload(service: ServiceItem): BusinessService {
  const setupVisible = service.price_type === "monthly" || service.price_type === "annual";
  const durationVisible = service.price_type === "per_session" && service.durationApplies;

  if (service.quotePrice) {
    return {
      name: service.name.trim() || "Servicio",
      description: service.description.trim(),
      price_type: service.price_type,
      price: null,
      price_label: "Por cotización",
      setup_fee:
        setupVisible && service.setup_fee != null && !Number.isNaN(service.setup_fee)
          ? service.setup_fee
          : null,
      currency: service.currency,
      duration:
        durationVisible && service.duration != null && !Number.isNaN(service.duration)
          ? service.duration
          : null,
    };
  }

  return {
    name: service.name.trim() || "Servicio",
    description: service.description.trim(),
    price_type: service.price_type,
    price: service.price,
    price_label: null,
    setup_fee:
      setupVisible && service.setup_fee != null && !Number.isNaN(service.setup_fee)
        ? service.setup_fee
        : null,
    currency: service.currency,
    duration:
      durationVisible && service.duration != null && !Number.isNaN(service.duration)
        ? service.duration
        : null,
  };
}
