import type { BusinessType, BotTone } from "./settings-types";

export function apiTypeToUI(value: string): { select: BusinessType; custom: string } {
  const normalized = String(value || "").trim().toLowerCase();
  switch (normalized) {
    case "consultorio":
      return { select: "Consultorio", custom: "" };
    case "barbería":
    case "barberia":
      return { select: "Barbería", custom: "" };
    case "inmobiliaria":
      return { select: "Inmobiliaria", custom: "" };
    case "taller":
      return { select: "Taller", custom: "" };
    case "software_company":
    case "software company":
      return { select: "Software Company", custom: "" };
    case "agencia_marketing":
    case "agencia de marketing":
      return { select: "Agencia de marketing", custom: "" };
    case "restaurante":
      return { select: "Restaurante", custom: "" };
    case "gimnasio":
      return { select: "Gimnasio", custom: "" };
    case "spa_estetica":
    case "spa / estética":
    case "spa estetica":
      return { select: "Spa / Estética", custom: "" };
    default:
      if (!normalized) {
        return { select: "Consultorio", custom: "" };
      }
      return { select: "Otro", custom: String(value).trim() };
  }
}

export function uiTypeToAPI(value: BusinessType, customType: string): string {
  switch (value) {
    case "Consultorio":
      return "consultorio";
    case "Barbería":
      return "barbería";
    case "Inmobiliaria":
      return "inmobiliaria";
    case "Taller":
      return "taller";
    case "Software Company":
      return "software_company";
    case "Agencia de marketing":
      return "agencia_marketing";
    case "Restaurante":
      return "restaurante";
    case "Gimnasio":
      return "gimnasio";
    case "Spa / Estética":
      return "spa_estetica";
    case "Otro":
      return customType.trim() || "otro";
    default: {
      const exhaustiveCheck: never = value;
      return exhaustiveCheck;
    }
  }
}

export function apiToneToUI(value: string): BotTone {
  switch (value) {
    case "formal":
      return "Formal";
    case "muy_casual":
      return "Muy casual";
    case "amigable":
    default:
      return "Amigable";
  }
}

export function uiToneToAPI(value: BotTone): string {
  switch (value) {
    case "Formal":
      return "formal";
    case "Muy casual":
      return "muy_casual";
    case "Amigable":
    default:
      return "amigable";
  }
}

export function hourToTime(value: number): string {
  const safeHour = Math.max(0, Math.min(23, value));
  return `${String(safeHour).padStart(2, "0")}:00`;
}

export function timeToHour(value: string): number {
  const [hourPart] = value.split(":");
  const parsed = Number(hourPart);
  return Number.isNaN(parsed) ? 9 : parsed;
}
