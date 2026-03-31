"use client";

import { useEffect, useState } from "react";
import { getConfig, updateConfig, type BusinessConfig, type BusinessService } from "@/lib/api";

type BusinessType = "Consultorio" | "Barbería" | "Inmobiliaria" | "Taller";
type BotTone = "Formal" | "Amigable" | "Muy casual";
type SaveStatus = "idle" | "saving" | "success";

interface ServiceItem {
  id: string;
  name: string;
  duration: number;
  price: number;
}

const businessTypeOptions: BusinessType[] = ["Consultorio", "Barbería", "Inmobiliaria", "Taller"];
const botToneOptions: BotTone[] = ["Formal", "Amigable", "Muy casual"];

function apiTypeToUI(value: string): BusinessType {
  switch (value) {
    case "consultorio":
      return "Consultorio";
    case "barbería":
    case "barberia":
      return "Barbería";
    case "inmobiliaria":
      return "Inmobiliaria";
    case "taller":
      return "Taller";
    default:
      return "Consultorio";
  }
}

function uiTypeToAPI(value: BusinessType): string {
  switch (value) {
    case "Consultorio":
      return "consultorio";
    case "Barbería":
      return "barbería";
    case "Inmobiliaria":
      return "inmobiliaria";
    case "Taller":
      return "taller";
    default:
      return "consultorio";
  }
}

function apiToneToUI(value: string): BotTone {
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

function uiToneToAPI(value: BotTone): string {
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

function hourToTime(value: number): string {
  const safeHour = Math.max(0, Math.min(23, value));
  return `${String(safeHour).padStart(2, "0")}:00`;
}

function timeToHour(value: string): number {
  const [hourPart] = value.split(":");
  const parsed = Number(hourPart);
  return Number.isNaN(parsed) ? 9 : parsed;
}

function toServiceItem(service: BusinessService, index: number): ServiceItem {
  return {
    id: `s-${Date.now()}-${index}`,
    name: service.name,
    duration: service.duration,
    price: service.price,
  };
}

export default function SettingsPage() {
  const [businessName, setBusinessName] = useState<string>("Clínica ARI Demo");
  const [businessType, setBusinessType] = useState<BusinessType>("Consultorio");
  const [startTime, setStartTime] = useState<string>("09:00");
  const [endTime, setEndTime] = useState<string>("19:00");
  const [botTone, setBotTone] = useState<BotTone>("Amigable");
  const [services, setServices] = useState<ServiceItem[]>([
    { id: "s-1", name: "Limpieza dental", duration: 45, price: 650 },
    { id: "s-2", name: "Valoración general", duration: 30, price: 400 }
  ]);
  const [welcomeMessage, setWelcomeMessage] = useState<string>(
    "Hola, soy ARI. Te ayudo a agendar tu cita en minutos. ¿Qué servicio te interesa?"
  );
  const [showPreview, setShowPreview] = useState<boolean>(false);
  const [activeAnnouncement, setActiveAnnouncement] = useState<string>(
    "Hoy hay 10% de descuento en limpiezas"
  );
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [isLoadingConfig, setIsLoadingConfig] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string>("");

  useEffect(() => {
    let isMounted = true;

    const loadConfig = async () => {
      setIsLoadingConfig(true);
      setLoadError("");

      try {
        const config = await getConfig("demo");
        if (!isMounted) {
          return;
        }

        setBusinessName(config.name);
        setBusinessType(apiTypeToUI(config.type));
        setStartTime(hourToTime(config.start_hour));
        setEndTime(hourToTime(config.end_hour));
        setBotTone(apiToneToUI(config.tone));
        setWelcomeMessage(config.welcome_message);
        setActiveAnnouncement(config.active_announcement || "");
        setServices(config.services.map(toServiceItem));
      } catch {
        if (isMounted) {
          setLoadError("No se pudo cargar la configuración actual");
        }
      } finally {
        if (isMounted) {
          setIsLoadingConfig(false);
        }
      }
    };

    loadConfig();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleAddService = () => {
    setServices((currentServices) => [
      ...currentServices,
      { id: `s-${Date.now()}`, name: "", duration: 30, price: 0 }
    ]);
  };

  const handleRemoveService = (serviceId: string) => {
    setServices((currentServices) => currentServices.filter((service) => service.id !== serviceId));
  };

  const handleServiceChange = <K extends keyof ServiceItem>(
    serviceId: string,
    field: K,
    value: ServiceItem[K]
  ) => {
    setServices((currentServices) =>
      currentServices.map((service) =>
        service.id === serviceId
          ? {
              ...service,
              [field]: value
            }
          : service
      )
    );
  };

  const handleSaveConfiguration = async () => {
    const payload: BusinessConfig = {
      name: businessName,
      type: uiTypeToAPI(businessType),
      start_hour: timeToHour(startTime),
      end_hour: timeToHour(endTime),
      tone: uiToneToAPI(botTone),
      welcome_message: welcomeMessage,
      active_announcement: activeAnnouncement || null,
      services: services.map((service) => ({
        name: service.name.trim() || "Servicio",
        duration: service.duration,
        price: service.price,
      })),
    };

    setSaveStatus("saving");
    try {
      await updateConfig("demo", payload);
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch {
      setSaveStatus("idle");
      setLoadError("No se pudo guardar la configuración");
    }
  };

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold text-white">Configurador</h2>
        <p className="mt-1 text-sm text-slate-400">Parámetros base del bot ARI.</p>
      </header>

      {loadError ? (
        <p className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {loadError}
        </p>
      ) : null}

      {isLoadingConfig ? (
        <article className="space-y-3 rounded-xl border border-white/10 bg-ari-card p-4">
          <div className="h-6 w-52 animate-pulse rounded bg-white/10" />
          <div className="h-10 w-full animate-pulse rounded bg-white/10" />
          <div className="h-10 w-full animate-pulse rounded bg-white/10" />
        </article>
      ) : null}

      <article className="space-y-4 rounded-xl border border-white/10 bg-ari-card p-4">
        <h3 className="text-lg font-semibold text-white">1. Información del negocio</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm text-slate-300">
            <span>Nombre del negocio</span>
            <input
              value={businessName}
              onChange={(event) => setBusinessName(event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#111217] px-3 py-2 text-white outline-none focus:border-ari-accent"
            />
          </label>

          <label className="space-y-1 text-sm text-slate-300">
            <span>Tipo de negocio</span>
            <select
              value={businessType}
              onChange={(event) => setBusinessType(event.target.value as BusinessType)}
              className="w-full rounded-lg border border-white/10 bg-[#111217] px-3 py-2 text-white outline-none focus:border-ari-accent"
            >
              {businessTypeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm text-slate-300">
            <span>Hora inicio</span>
            <input
              type="time"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#111217] px-3 py-2 text-white outline-none focus:border-ari-accent"
            />
          </label>
          <label className="space-y-1 text-sm text-slate-300">
            <span>Hora fin</span>
            <input
              type="time"
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#111217] px-3 py-2 text-white outline-none focus:border-ari-accent"
            />
          </label>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm text-slate-300">Tono del bot</legend>
          <div className="flex flex-wrap gap-3">
            {botToneOptions.map((toneOption) => (
              <label
                key={toneOption}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-[#111217] px-3 py-2 text-sm text-slate-200"
              >
                <input
                  type="radio"
                  name="botTone"
                  value={toneOption}
                  checked={botTone === toneOption}
                  onChange={() => setBotTone(toneOption)}
                  className="accent-ari-accent"
                />
                {toneOption}
              </label>
            ))}
          </div>
        </fieldset>
      </article>

      <article className="space-y-4 rounded-xl border border-white/10 bg-ari-card p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-white">2. Servicios</h3>
          <button
            type="button"
            onClick={handleAddService}
            className="rounded-lg bg-ari-accent px-3 py-2 text-sm font-medium text-white hover:brightness-110"
          >
            Agregar servicio
          </button>
        </div>

        <div className="space-y-3">
          {services.map((service) => (
            <div key={service.id} className="grid gap-3 rounded-lg border border-white/10 bg-white/5 p-3 md:grid-cols-4">
              <label className="space-y-1 text-sm text-slate-300 md:col-span-2">
                <span>Nombre</span>
                <input
                  value={service.name}
                  onChange={(event) => handleServiceChange(service.id, "name", event.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-[#111217] px-3 py-2 text-white outline-none focus:border-ari-accent"
                />
              </label>
              <label className="space-y-1 text-sm text-slate-300">
                <span>Duración (min)</span>
                <input
                  type="number"
                  min={5}
                  step={5}
                  value={service.duration}
                  onChange={(event) => handleServiceChange(service.id, "duration", Number(event.target.value))}
                  className="w-full rounded-lg border border-white/10 bg-[#111217] px-3 py-2 text-white outline-none focus:border-ari-accent"
                />
              </label>
              <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                <label className="space-y-1 text-sm text-slate-300">
                  <span>Precio MXN</span>
                  <input
                    type="number"
                    min={0}
                    step={50}
                    value={service.price}
                    onChange={(event) => handleServiceChange(service.id, "price", Number(event.target.value))}
                    className="w-full rounded-lg border border-white/10 bg-[#111217] px-3 py-2 text-white outline-none focus:border-ari-accent"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => handleRemoveService(service.id)}
                  className="rounded-lg bg-red-500/20 px-3 py-2 text-sm font-medium text-red-200 hover:bg-red-500/30"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      </article>

      <article className="space-y-4 rounded-xl border border-white/10 bg-ari-card p-4">
        <h3 className="text-lg font-semibold text-white">3. Mensaje de bienvenida</h3>
        <textarea
          value={welcomeMessage}
          onChange={(event) => setWelcomeMessage(event.target.value)}
          rows={4}
          className="w-full rounded-lg border border-white/10 bg-[#111217] px-3 py-2 text-sm text-white outline-none focus:border-ari-accent"
        />
        <button
          type="button"
          onClick={() => setShowPreview((currentValue) => !currentValue)}
          className="rounded-lg border border-ari-accent bg-ari-accent/20 px-3 py-2 text-sm font-medium text-violet-200 hover:bg-ari-accent/30"
        >
          Vista previa
        </button>
        {showPreview ? (
          <div className="max-w-md rounded-2xl border border-white/10 bg-[#0d0f14] p-3">
            <p className="text-xs text-slate-400">WhatsApp preview</p>
            <div className="mt-2 ml-auto max-w-[85%] rounded-2xl bg-ari-accent/25 px-3 py-2 text-sm text-violet-100">
              {welcomeMessage}
            </div>
          </div>
        ) : null}
      </article>

      <article className="space-y-4 rounded-xl border border-white/10 bg-ari-card p-4">
        <h3 className="text-lg font-semibold text-white">4. Anuncios activos</h3>
        <input
          value={activeAnnouncement}
          onChange={(event) => setActiveAnnouncement(event.target.value)}
          className="w-full rounded-lg border border-white/10 bg-[#111217] px-3 py-2 text-sm text-white outline-none focus:border-ari-accent"
        />
        <button
          type="button"
          onClick={handleSaveConfiguration}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 hover:bg-white/10"
        >
          Guardar
        </button>
      </article>

      <footer className="pb-2">
        <button
          type="button"
          onClick={handleSaveConfiguration}
          disabled={saveStatus === "saving" || isLoadingConfig}
          className="inline-flex items-center gap-2 rounded-lg bg-ari-accent px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-70"
        >
          {saveStatus === "saving" ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Guardando configuración...
            </>
          ) : saveStatus === "success" ? (
            "✅ Configuración guardada"
          ) : (
            "Guardar configuración"
          )}
        </button>
      </footer>
    </section>
  );
}
