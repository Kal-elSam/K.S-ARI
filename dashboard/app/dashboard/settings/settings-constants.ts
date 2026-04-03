import type { ServicePriceType } from "@/lib/api";
import type { BotTone, BusinessType, ServiceItem } from "./settings-types";

export const initialServiceItems: ServiceItem[] = [
  {
    id: "s-1",
    name: "Limpieza dental",
    description: "",
    price_type: "per_session",
    price: 650,
    quotePrice: false,
    setup_fee: null,
    currency: "MXN",
    duration: 45,
    durationApplies: true,
  },
  {
    id: "s-2",
    name: "Valoración general",
    description: "",
    price_type: "per_session",
    price: 400,
    quotePrice: false,
    setup_fee: null,
    currency: "MXN",
    duration: 30,
    durationApplies: true,
  },
];

export const PRICE_TYPE_OPTIONS: { value: ServicePriceType; label: string }[] = [
  { value: "one_time", label: "Pago único" },
  { value: "monthly", label: "Renta mensual" },
  { value: "annual", label: "Renta anual" },
  { value: "per_session", label: "Por sesión/visita" },
];

export const CURRENCY_OPTIONS = ["MXN", "USD"] as const;

export const businessTypeOptions: BusinessType[] = [
  "Consultorio",
  "Barbería",
  "Inmobiliaria",
  "Taller",
  "Software Company",
  "Agencia de marketing",
  "Restaurante",
  "Gimnasio",
  "Spa / Estética",
  "Otro",
];

export const botToneOptions: BotTone[] = ["Formal", "Amigable", "Muy casual"];

export const accentColorOptions = [
  "#7c3aed",
  "#2563eb",
  "#0f766e",
  "#dc2626",
  "#d97706",
  "#475569",
] as const;

export const saveSuccessText = "✅ Configuración guardada — ARI ya usa esta información";

export const defaultAccentColor = accentColorOptions[0];
