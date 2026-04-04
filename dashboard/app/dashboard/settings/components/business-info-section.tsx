import { accentColorOptions, botToneOptions, businessTypeOptions } from "../settings-constants";
import type { BotTone, BusinessType } from "../settings-types";

export interface BusinessInfoSectionProps {
  businessName: string;
  onBusinessNameChange: (value: string) => void;
  businessType: BusinessType;
  onBusinessTypeChange: (value: BusinessType) => void;
  customBusinessType: string;
  onCustomBusinessTypeChange: (value: string) => void;
  slogan: string;
  onSloganChange: (value: string) => void;
  ownerPhone: string;
  onOwnerPhoneChange: (value: string) => void;
  welcomeMessage: string;
  onWelcomeMessageChange: (value: string) => void;
  accentColor: string;
  onAccentColorChange: (color: string) => void;
  startTime: string;
  onStartTimeChange: (value: string) => void;
  endTime: string;
  onEndTimeChange: (value: string) => void;
  botTone: BotTone;
  onBotToneChange: (value: BotTone) => void;
}

export function BusinessInfoSection({
  businessName,
  onBusinessNameChange,
  businessType,
  onBusinessTypeChange,
  customBusinessType,
  onCustomBusinessTypeChange,
  slogan,
  onSloganChange,
  ownerPhone,
  onOwnerPhoneChange,
  welcomeMessage,
  onWelcomeMessageChange,
  accentColor,
  onAccentColorChange,
  startTime,
  onStartTimeChange,
  endTime,
  onEndTimeChange,
  botTone,
  onBotToneChange,
}: BusinessInfoSectionProps) {
  return (
    <article className="space-y-4 rounded-xl border border-white/10 bg-ari-card p-4">
      <h3 className="text-lg font-semibold text-white">1. Información del negocio</h3>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm text-slate-300">
          <span>Nombre del negocio</span>
          <input
            value={businessName}
            onChange={(event) => onBusinessNameChange(event.target.value)}
            className="w-full rounded-lg border border-white/10 bg-[#111217] px-3 py-2 text-white outline-none focus:border-ari-accent"
          />
        </label>

        <div className="space-y-2">
          <label className="space-y-1 text-sm text-slate-300">
            <span>Tipo de negocio</span>
            <select
              value={businessType}
              onChange={(event) => {
                const next = event.target.value as BusinessType;
                onBusinessTypeChange(next);
                if (next !== "Otro") {
                  onCustomBusinessTypeChange("");
                }
              }}
              className="w-full rounded-lg border border-white/10 bg-[#111217] px-3 py-2 text-white outline-none focus:border-ari-accent"
            >
              {businessTypeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          {businessType === "Otro" ? (
            <label className="space-y-1 text-sm text-slate-300">
              <span>Especifica tu tipo de negocio</span>
              <input
                value={customBusinessType}
                onChange={(event) => onCustomBusinessTypeChange(event.target.value)}
                placeholder="Ej. Floristería, Coworking..."
                className="w-full rounded-lg border border-white/10 bg-[#111217] px-3 py-2 text-white outline-none focus:border-ari-accent"
              />
            </label>
          ) : null}
        </div>
      </div>

      <section className="space-y-3 rounded-lg border border-white/10 bg-white/5 p-3">
        <h4 className="font-medium text-white">Identidad del negocio</h4>
        <label className="space-y-1 text-sm text-slate-300">
          <span>Slogan</span>
          <input
            value={slogan}
            onChange={(event) => onSloganChange(event.target.value)}
            placeholder="Ej. El mejor corte de tu vida"
            className="w-full rounded-lg border border-white/10 bg-[#111217] px-3 py-2 text-white outline-none focus:border-ari-accent"
          />
        </label>
        <label className="space-y-1 text-sm text-slate-300">
          <span>Tu WhatsApp para notificaciones</span>
          <input
            type="tel"
            value={ownerPhone}
            onChange={(event) => onOwnerPhoneChange(event.target.value)}
            placeholder="524427471950 (con código de país, sin +)"
            className="w-full rounded-lg border border-white/10 bg-[#111217] px-3 py-2 text-white outline-none focus:border-ari-accent"
          />
          <small className="block text-xs text-slate-400">
            ARI te avisará aquí cuando lleguen nuevas citas y podrás gestionar tu agenda desde WhatsApp.
          </small>
        </label>
        <label className="space-y-1 text-sm text-slate-300">
          <span>Mensaje de bienvenida</span>
          <textarea
            value={welcomeMessage}
            onChange={(event) => onWelcomeMessageChange(event.target.value)}
            rows={4}
            className="w-full rounded-lg border border-white/10 bg-[#111217] px-3 py-2 text-sm text-white outline-none focus:border-ari-accent"
          />
        </label>
        <fieldset>
          <legend className="mb-2 text-sm text-slate-300">Color de acento</legend>
          <div className="flex flex-wrap gap-2">
            {accentColorOptions.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => onAccentColorChange(color)}
                aria-label={`Seleccionar color ${color}`}
                className={`h-9 w-9 rounded-full border-2 transition ${
                  accentColor === color ? "border-white scale-105" : "border-white/20 hover:border-white/50"
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </fieldset>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm text-slate-300">
          <span>Hora inicio</span>
          <input
            type="time"
            value={startTime}
            onChange={(event) => onStartTimeChange(event.target.value)}
            className="w-full rounded-lg border border-white/10 bg-[#111217] px-3 py-2 text-white outline-none focus:border-ari-accent"
          />
        </label>
        <label className="space-y-1 text-sm text-slate-300">
          <span>Hora fin</span>
          <input
            type="time"
            value={endTime}
            onChange={(event) => onEndTimeChange(event.target.value)}
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
                onChange={() => onBotToneChange(toneOption)}
                className="accent-ari-accent"
              />
              {toneOption}
            </label>
          ))}
        </div>
      </fieldset>
    </article>
  );
}
