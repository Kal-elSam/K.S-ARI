import type { ServiceCurrency, ServicePriceType } from "@/lib/api";

export type BusinessType =
  | "Consultorio"
  | "Barbería"
  | "Inmobiliaria"
  | "Taller"
  | "Software Company"
  | "Agencia de marketing"
  | "Restaurante"
  | "Gimnasio"
  | "Spa / Estética"
  | "Otro";

export type BotTone = "Formal" | "Amigable" | "Muy casual";

export type SaveStatus = "idle" | "saving" | "publishing" | "success" | "error";

export interface ServiceItem {
  id: string;
  name: string;
  description: string;
  price_type: ServicePriceType;
  price: number;
  setup_fee: number | null;
  currency: ServiceCurrency;
  duration: number | null;
  durationApplies: boolean;
}
