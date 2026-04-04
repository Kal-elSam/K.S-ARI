"use client";

import { AnnouncementsSection } from "./components/announcements-section";
import { BusinessInfoSection } from "./components/business-info-section";
import { ServicesSection } from "./components/services-section";
import { SettingsPreviewSection } from "./components/settings-preview-section";
import { saveSuccessText } from "./settings-constants";
import { useSettingsForm } from "./use-settings-form";

export default function SettingsPage() {
  const form = useSettingsForm();

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold text-white">Configurador</h2>
        <p className="mt-1 text-sm text-slate-400">Parámetros base del bot ARI.</p>
      </header>

      {form.loadError ? (
        <p className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {form.loadError}
        </p>
      ) : null}

      {form.isLoadingConfig ? (
        <article className="space-y-3 rounded-xl border border-white/10 bg-ari-card p-4">
          <div className="h-6 w-52 animate-pulse rounded bg-white/10" />
          <div className="h-10 w-full animate-pulse rounded bg-white/10" />
          <div className="h-10 w-full animate-pulse rounded bg-white/10" />
        </article>
      ) : null}

      <BusinessInfoSection
        businessName={form.businessName}
        onBusinessNameChange={form.setBusinessName}
        businessType={form.businessType}
        onBusinessTypeChange={form.setBusinessType}
        customBusinessType={form.customBusinessType}
        onCustomBusinessTypeChange={form.setCustomBusinessType}
        slogan={form.slogan}
        onSloganChange={form.setSlogan}
        ownerPhone={form.ownerPhone}
        onOwnerPhoneChange={form.setOwnerPhone}
        welcomeMessage={form.welcomeMessage}
        onWelcomeMessageChange={form.setWelcomeMessage}
        accentColor={form.accentColor}
        onAccentColorChange={form.setAccentColor}
        startTime={form.startTime}
        onStartTimeChange={form.setStartTime}
        endTime={form.endTime}
        onEndTimeChange={form.setEndTime}
        botTone={form.botTone}
        onBotToneChange={form.setBotTone}
      />

      <ServicesSection
        services={form.services}
        onAddService={form.handleAddService}
        onRemoveService={form.handleRemoveService}
        onUpdateService={form.updateService}
      />

      <SettingsPreviewSection
        showPreview={form.showPreview}
        onTogglePreview={() => form.setShowPreview((currentValue) => !currentValue)}
        welcomeMessage={form.welcomeMessage}
        accentColor={form.accentColor}
      />

      <AnnouncementsSection
        activeAnnouncement={form.activeAnnouncement}
        onActiveAnnouncementChange={form.setActiveAnnouncement}
        hasActiveAnnouncement={form.hasActiveAnnouncement}
        onPublishAnnouncement={() => {
          void form.handlePublishAnnouncement();
        }}
        saveStatus={form.saveStatus}
        isLoadingConfig={form.isLoadingConfig}
      />

      <footer className="pb-2">
        <button
          type="button"
          onClick={() => {
            void form.handleSaveConfiguration();
          }}
          disabled={form.saveStatus === "saving" || form.isLoadingConfig}
          className="inline-flex items-center gap-2 rounded-lg bg-ari-accent px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-70"
        >
          {form.saveStatus === "saving" ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Guardando configuración...
            </>
          ) : form.saveStatus === "success" ? (
            saveSuccessText
          ) : form.saveStatus === "error" ? (
            "Error al guardar configuración"
          ) : (
            "Guardar configuración"
          )}
        </button>
      </footer>
    </section>
  );
}
