import type { ServiceCurrency, ServicePriceType } from "@/lib/api";
import { CURRENCY_OPTIONS, PRICE_TYPE_OPTIONS } from "../settings-constants";
import type { ServiceItem } from "../settings-types";

export interface ServicesSectionProps {
  services: ServiceItem[];
  onAddService: () => void;
  onRemoveService: (serviceId: string) => void;
  onUpdateService: (serviceId: string, patch: Partial<ServiceItem>) => void;
}

export function ServicesSection({
  services,
  onAddService,
  onRemoveService,
  onUpdateService,
}: ServicesSectionProps) {
  return (
    <article className="space-y-4 rounded-xl border border-white/10 bg-ari-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-white">2. Servicios</h3>
        <button
          type="button"
          onClick={onAddService}
          className="rounded-lg bg-ari-accent px-3 py-2 text-sm font-medium text-white hover:brightness-110"
        >
          Agregar servicio
        </button>
      </div>

      <div className="space-y-4">
        {services.map((service) => {
          const showSetup = service.price_type === "monthly" || service.price_type === "annual";
          const showDurationBlock = service.price_type === "per_session";

          return (
            <div
              key={service.id}
              className="space-y-3 rounded-lg border border-white/10 bg-white/5 p-3"
            >
              <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                <label className="space-y-1 text-sm text-slate-300">
                  <span>Nombre del servicio</span>
                  <input
                    value={service.name}
                    onChange={(event) => onUpdateService(service.id, { name: event.target.value })}
                    className="w-full rounded-lg border border-white/10 bg-[#111217] px-3 py-2 text-white outline-none focus:border-ari-accent"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => onRemoveService(service.id)}
                  className="rounded-lg bg-red-500/20 px-3 py-2 text-sm font-medium text-red-200 hover:bg-red-500/30 md:max-w-[120px]"
                >
                  Eliminar
                </button>
              </div>

              <label className="block space-y-1 text-sm text-slate-300">
                <span>Descripción corta (opcional)</span>
                <input
                  value={service.description}
                  onChange={(event) =>
                    onUpdateService(service.id, { description: event.target.value })
                  }
                  placeholder="Ej. Incluye radiografía"
                  className="w-full rounded-lg border border-white/10 bg-[#111217] px-3 py-2 text-white outline-none focus:border-ari-accent"
                />
              </label>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1 text-sm text-slate-300">
                  <span>Tipo de cobro</span>
                  <select
                    value={service.price_type}
                    onChange={(event) =>
                      onUpdateService(service.id, {
                        price_type: event.target.value as ServicePriceType,
                      })
                    }
                    className="w-full rounded-lg border border-white/10 bg-[#111217] px-3 py-2 text-white outline-none focus:border-ari-accent"
                  >
                    {PRICE_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <label className="space-y-1 text-sm text-slate-300">
                    <span>Precio</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={service.price}
                      onChange={(event) =>
                        onUpdateService(service.id, { price: Number(event.target.value) })
                      }
                      className="w-full rounded-lg border border-white/10 bg-[#111217] px-3 py-2 text-white outline-none focus:border-ari-accent"
                    />
                  </label>
                  <label className="space-y-1 text-sm text-slate-300">
                    <span>Moneda</span>
                    <select
                      value={service.currency}
                      onChange={(event) =>
                        onUpdateService(service.id, {
                          currency: event.target.value as ServiceCurrency,
                        })
                      }
                      className="w-full min-w-[88px] rounded-lg border border-white/10 bg-[#111217] px-3 py-2 text-white outline-none focus:border-ari-accent"
                    >
                      {CURRENCY_OPTIONS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              {showSetup ? (
                <label className="block space-y-1 text-sm text-slate-300">
                  <span>Setup inicial / Inscripción (opcional)</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={service.setup_fee ?? ""}
                    onChange={(event) => {
                      const raw = event.target.value;
                      if (raw === "") {
                        onUpdateService(service.id, { setup_fee: null });
                        return;
                      }
                      onUpdateService(service.id, { setup_fee: Number(raw) });
                    }}
                    placeholder="—"
                    className="w-full max-w-xs rounded-lg border border-white/10 bg-[#111217] px-3 py-2 text-white outline-none focus:border-ari-accent"
                  />
                </label>
              ) : null}

              {showDurationBlock ? (
                <div className="space-y-2 rounded-lg border border-white/5 bg-black/20 p-3">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={service.durationApplies}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        onUpdateService(service.id, {
                          durationApplies: checked,
                          duration: checked ? service.duration ?? 30 : null,
                        });
                      }}
                      className="accent-ari-accent"
                    />
                    ¿Aplica duración?
                  </label>
                  {service.durationApplies ? (
                    <label className="block space-y-1 text-sm text-slate-300">
                      <span>Duración (minutos)</span>
                      <input
                        type="number"
                        min={5}
                        step={5}
                        value={service.duration ?? ""}
                        onChange={(event) => {
                          const raw = event.target.value;
                          if (raw === "") {
                            onUpdateService(service.id, { duration: null });
                            return;
                          }
                          onUpdateService(service.id, { duration: Number(raw) });
                        }}
                        className="w-full max-w-xs rounded-lg border border-white/10 bg-[#111217] px-3 py-2 text-white outline-none focus:border-ari-accent"
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </article>
  );
}
