"use client";

import { useCallback, useEffect, useState } from "react";
import { getConfig, updateConfig, type BusinessConfig } from "@/lib/api";
import { notifyBusinessConfigUpdated } from "@/lib/business-config-updated";
import { defaultAccentColor, initialServiceItems } from "./settings-constants";
import {
  apiToneToUI,
  apiTypeToUI,
  hourToTime,
  timeToHour,
  uiToneToAPI,
  uiTypeToAPI,
} from "./settings-mappers";
import type { BotTone, BusinessType, SaveStatus, ServiceItem } from "./settings-types";
import { serviceToPayload, toServiceItem } from "./service-model";

function messageFromUnknownError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return fallback;
}

export function useSettingsForm() {
  const [businessName, setBusinessName] = useState<string>("Clínica ARI Demo");
  const [slogan, setSlogan] = useState<string>("");
  const [businessType, setBusinessType] = useState<BusinessType>("Consultorio");
  const [customBusinessType, setCustomBusinessType] = useState<string>("");
  const [startTime, setStartTime] = useState<string>("09:00");
  const [endTime, setEndTime] = useState<string>("19:00");
  const [botTone, setBotTone] = useState<BotTone>("Amigable");
  const [services, setServices] = useState<ServiceItem[]>(initialServiceItems);
  const [welcomeMessage, setWelcomeMessage] = useState<string>(
    "Hola, soy ARI. Te ayudo a agendar tu cita en minutos. ¿Qué servicio te interesa?"
  );
  const [showPreview, setShowPreview] = useState<boolean>(false);
  const [activeAnnouncement, setActiveAnnouncement] = useState<string>(
    "Hoy hay 10% de descuento en limpiezas"
  );
  const [accentColor, setAccentColor] = useState<string>(defaultAccentColor);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [isLoadingConfig, setIsLoadingConfig] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string>("");
  const [lastPersistedConfig, setLastPersistedConfig] = useState<BusinessConfig | null>(null);

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
        setSlogan(config.slogan || "");
        const typeFromApi = apiTypeToUI(config.type);
        setBusinessType(typeFromApi.select);
        setCustomBusinessType(typeFromApi.custom);
        setStartTime(hourToTime(config.start_hour));
        setEndTime(hourToTime(config.end_hour));
        setBotTone(apiToneToUI(config.tone));
        setWelcomeMessage(config.welcome_message);
        setActiveAnnouncement(config.active_announcement || "");
        setAccentColor(config.accent_color || defaultAccentColor);
        setServices(config.services.map((svc, index) => toServiceItem(svc, index)));
        setLastPersistedConfig({
          ...config,
          slogan: config.slogan || "",
          active_announcement: config.active_announcement || null,
          accent_color: config.accent_color || defaultAccentColor,
          services: Array.isArray(config.services) ? config.services : [],
        });
      } catch (error) {
        if (isMounted) {
          setLoadError(
            messageFromUnknownError(error, "No se pudo cargar la configuración actual")
          );
        }
      } finally {
        if (isMounted) {
          setIsLoadingConfig(false);
        }
      }
    };

    void loadConfig();
    return () => {
      isMounted = false;
    };
  }, []);

  const buildCurrentPayload = useCallback((): BusinessConfig => {
    return {
      name: businessName,
      slogan,
      type: uiTypeToAPI(businessType, customBusinessType),
      start_hour: timeToHour(startTime),
      end_hour: timeToHour(endTime),
      tone: uiToneToAPI(botTone),
      welcome_message: welcomeMessage,
      active_announcement: activeAnnouncement || null,
      accent_color: accentColor,
      services: services.map((service) => serviceToPayload(service)),
    };
  }, [
    accentColor,
    activeAnnouncement,
    botTone,
    businessName,
    businessType,
    customBusinessType,
    endTime,
    services,
    slogan,
    startTime,
    welcomeMessage,
  ]);

  const resetSaveStatusLater = useCallback(() => {
    window.setTimeout(() => setSaveStatus("idle"), 3000);
  }, []);

  const handleAddService = useCallback(() => {
    setServices((currentServices) => [
      ...currentServices,
      {
        id: `s-${Date.now()}`,
        name: "",
        description: "",
        price_type: "one_time",
        price: 0,
        quotePrice: false,
        setup_fee: null,
        currency: "MXN",
        duration: null,
        durationApplies: false,
      },
    ]);
  }, []);

  const handleRemoveService = useCallback((serviceId: string) => {
    setServices((currentServices) => currentServices.filter((service) => service.id !== serviceId));
  }, []);

  const updateService = useCallback((serviceId: string, patch: Partial<ServiceItem>) => {
    setServices((currentServices) =>
      currentServices.map((service) => {
        if (service.id !== serviceId) {
          return service;
        }
        const next: ServiceItem = { ...service, ...patch };
        if (patch.quotePrice === false) {
          if (typeof next.price !== "number" || Number.isNaN(next.price)) {
            next.price = 0;
          }
        }
        if (patch.price_type !== undefined) {
          if (patch.price_type !== "monthly" && patch.price_type !== "annual") {
            next.setup_fee = null;
          }
          if (patch.price_type !== "per_session") {
            next.duration = null;
            next.durationApplies = false;
          }
        }
        return next;
      })
    );
  }, []);

  const handleSaveConfiguration = useCallback(async () => {
    const payload = buildCurrentPayload();
    setSaveStatus("saving");
    setLoadError("");

    try {
      await updateConfig("demo", payload);
      setLastPersistedConfig(payload);
      setSaveStatus("success");
      notifyBusinessConfigUpdated();
      resetSaveStatusLater();
    } catch (error) {
      setSaveStatus("error");
      setLoadError(messageFromUnknownError(error, "No se pudo guardar la configuración"));
      resetSaveStatusLater();
    }
  }, [buildCurrentPayload, resetSaveStatusLater]);

  const handlePublishAnnouncement = useCallback(async () => {
    const basePayload = lastPersistedConfig ?? buildCurrentPayload();
    const payload: BusinessConfig = {
      ...basePayload,
      active_announcement: activeAnnouncement.trim() ? activeAnnouncement.trim() : null,
    };

    setSaveStatus("publishing");
    setLoadError("");

    try {
      await updateConfig("demo", payload);
      setLastPersistedConfig(payload);
      setSaveStatus("success");
      notifyBusinessConfigUpdated();
      resetSaveStatusLater();
    } catch (error) {
      setSaveStatus("error");
      setLoadError(messageFromUnknownError(error, "No se pudo publicar el anuncio"));
      resetSaveStatusLater();
    }
  }, [activeAnnouncement, buildCurrentPayload, lastPersistedConfig, resetSaveStatusLater]);

  const hasActiveAnnouncement = activeAnnouncement.trim().length > 0;

  return {
    businessName,
    setBusinessName,
    slogan,
    setSlogan,
    businessType,
    setBusinessType,
    customBusinessType,
    setCustomBusinessType,
    startTime,
    setStartTime,
    endTime,
    setEndTime,
    botTone,
    setBotTone,
    services,
    welcomeMessage,
    setWelcomeMessage,
    showPreview,
    setShowPreview,
    activeAnnouncement,
    setActiveAnnouncement,
    accentColor,
    setAccentColor,
    saveStatus,
    isLoadingConfig,
    loadError,
    hasActiveAnnouncement,
    handleAddService,
    handleRemoveService,
    updateService,
    handleSaveConfiguration,
    handlePublishAnnouncement,
  };
}
