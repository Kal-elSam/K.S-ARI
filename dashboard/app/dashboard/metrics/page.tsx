"use client";

import { useEffect, useState } from "react";
import { getMetrics, type MetricsResponse } from "@/lib/api";

interface Kpi {
  title: string;
  value: string;
  detail: string;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export default function MetricsPage() {
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let isMounted = true;

    const loadMetrics = async () => {
      setIsLoading(true);
      setError("");

      try {
        const data = await getMetrics();
        if (isMounted) {
          setMetrics(data);
        }
      } catch {
        if (isMounted) {
          setError("No se pudieron cargar las métricas");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadMetrics();
    return () => {
      isMounted = false;
    };
  }, []);

  const kpis: Kpi[] = metrics
    ? [
        {
          title: "Leads atendidos hoy",
          value: String(metrics.leads_today),
          detail: "Conversaciones creadas hoy",
        },
        {
          title: "Citas agendadas esta semana",
          value: String(metrics.appointments_week),
          detail: "Estado BOOKED en semana actual",
        },
        {
          title: "Tasa de conversión",
          value: `${metrics.conversion_rate.toFixed(1)}%`,
          detail: "BOOKED / conversaciones",
        },
        {
          title: "Tiempo promedio de respuesta",
          value: metrics.avg_response_time,
          detail: "Referencia operativa actual",
        },
      ]
    : [];

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-white">Dashboard de métricas</h2>
        <p className="mt-1 text-sm text-slate-400">Vista general del rendimiento de ARI.</p>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, index) => (
              <article
                key={`kpi-skeleton-${index}`}
                className="rounded-xl border border-white/10 bg-ari-card p-4"
              >
                <div className="h-4 w-40 animate-pulse rounded bg-white/10" />
                <div className="mt-3 h-9 w-24 animate-pulse rounded bg-white/10" />
                <div className="mt-2 h-3 w-44 animate-pulse rounded bg-white/10" />
              </article>
            ))
          : kpis.map((kpi) => (
              <article key={kpi.title} className="rounded-xl border border-white/10 bg-ari-card p-4">
                <p className="text-sm text-slate-400">{kpi.title}</p>
                <p className="mt-3 text-3xl font-bold tracking-tight text-white">{kpi.value}</p>
                <p className="mt-2 text-xs text-violet-300">{kpi.detail}</p>
              </article>
            ))}
      </div>

      <article className="overflow-hidden rounded-xl border border-white/10 bg-ari-card">
        <header className="border-b border-white/10 px-4 py-3">
          <h3 className="font-medium text-white">Últimas 5 conversaciones</h3>
        </header>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-white/5 text-left text-slate-300">
              <tr>
                <th className="px-4 py-3 font-medium">Teléfono</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Negocio</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <tr key={`recent-skeleton-${index}`} className="border-t border-white/5">
                    <td className="px-4 py-3">
                      <div className="h-4 w-36 animate-pulse rounded bg-white/10" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-4 w-24 animate-pulse rounded bg-white/10" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-4 w-28 animate-pulse rounded bg-white/10" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-4 w-32 animate-pulse rounded bg-white/10" />
                    </td>
                  </tr>
                ))
              ) : metrics?.recent_conversations.length ? (
                metrics.recent_conversations.map((conversation) => (
                  <tr key={conversation.id} className="border-t border-white/5">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-100">{conversation.phone}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-300">{conversation.state}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-300">{conversation.business_id}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-300">
                      {formatDate(conversation.created_at)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr className="border-t border-white/5">
                  <td colSpan={4} className="px-4 py-4 text-center text-sm text-slate-400">
                    No hay conversaciones recientes.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
