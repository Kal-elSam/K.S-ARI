import type { SaveStatus } from "../settings-types";

export interface AnnouncementsSectionProps {
  activeAnnouncement: string;
  onActiveAnnouncementChange: (value: string) => void;
  hasActiveAnnouncement: boolean;
  onPublishAnnouncement: () => void;
  saveStatus: SaveStatus;
  isLoadingConfig: boolean;
}

export function AnnouncementsSection({
  activeAnnouncement,
  onActiveAnnouncementChange,
  hasActiveAnnouncement,
  onPublishAnnouncement,
  saveStatus,
  isLoadingConfig,
}: AnnouncementsSectionProps) {
  return (
    <article className="space-y-4 rounded-xl border border-white/10 bg-ari-card p-4">
      <h3 className="text-lg font-semibold text-white">4. Anuncios activos</h3>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-slate-300">Anuncio actual</p>
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
            hasActiveAnnouncement ? "bg-emerald-500/20 text-emerald-200" : "bg-slate-600/30 text-slate-300"
          }`}
        >
          {hasActiveAnnouncement ? "Anuncio activo" : "Sin anuncio"}
        </span>
      </div>
      <textarea
        value={activeAnnouncement}
        onChange={(event) => onActiveAnnouncementChange(event.target.value)}
        rows={4}
        className="w-full rounded-lg border border-white/10 bg-[#111217] px-3 py-2 text-sm text-white outline-none focus:border-ari-accent"
      />
      <button
        type="button"
        onClick={onPublishAnnouncement}
        disabled={saveStatus === "publishing" || saveStatus === "saving" || isLoadingConfig}
        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {saveStatus === "publishing" ? "Publicando anuncio..." : "Publicar anuncio"}
      </button>
    </article>
  );
}
