"use client";

import { useMemo } from "react";
import type { SocialScheduleConfig, SocialScheduleFrequency } from "@/lib/api";

export type ToneOption = "Profesional" | "Casual" | "Divertido";
export type TabKey = "publicar" | "automatizacion" | "imagenes" | "historial";

export const toneOptions: ToneOption[] = ["Profesional", "Casual", "Divertido"];
export const platformOptions = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
] as const;
export const frequencyOptions: Array<{ value: SocialScheduleFrequency; label: string }> = [
  { value: "daily", label: "Diario" },
  { value: "3x_week", label: "3 veces por semana" },
  { value: "5x_week", label: "5 veces por semana" },
];
export const imageSourceOptions = [
  { value: "auto", label: "Ambas (recomendado)" },
  { value: "own", label: "Mis imágenes primero" },
  { value: "unsplash", label: "Unsplash automático" },
] as const;

export function getStatusChip(status: "draft" | "scheduled" | "published" | "failed"): string {
  switch (status) {
    case "draft":
      return "bg-slate-500/20 text-slate-200 border-slate-400/30";
    case "scheduled":
      return "bg-amber-500/20 text-amber-200 border-amber-400/30";
    case "published":
      return "bg-emerald-500/20 text-emerald-200 border-emerald-400/30";
    case "failed":
      return "bg-red-500/20 text-red-200 border-red-400/30";
    default: {
      const exhaustiveCheck: never = status;
      return exhaustiveCheck;
    }
  }
}

export function formatDate(value: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

export function getNextPostFromSchedule(schedule: SocialScheduleConfig): string | null {
  if (!schedule.is_active) return null;
  const now = new Date();

  for (let dayOffset = 0; dayOffset <= 14; dayOffset += 1) {
    const date = new Date(now);
    date.setDate(now.getDate() + dayOffset);
    const day = date.getDay();
    const inFrequency =
      schedule.frequency === "daily" ||
      (schedule.frequency === "3x_week" && (day === 1 || day === 3 || day === 5)) ||
      (schedule.frequency === "5x_week" && day >= 1 && day <= 5);
    if (!inFrequency) continue;

    for (const time of schedule.post_times) {
      const [hourText, minuteText] = time.split(":");
      const hour = Number.parseInt(hourText, 10);
      const minute = Number.parseInt(minuteText, 10);
      const candidate = new Date(date);
      candidate.setHours(hour, minute, 0, 0);
      if (candidate > now) return candidate.toISOString();
    }
  }

  return null;
}

export function useSocialPreview(content: string, hashtags: string): string {
  return useMemo(() => `${content}${hashtags ? `\n\n${hashtags}` : ""}`, [content, hashtags]);
}

export function useNextPostLabel(
  schedule: SocialScheduleConfig,
  nextPostOverride: string | null
): string {
  return useMemo(() => {
    const value = nextPostOverride || getNextPostFromSchedule(schedule);
    return value ? formatDate(value) : "Sin publicación programada";
  }, [nextPostOverride, schedule]);
}
