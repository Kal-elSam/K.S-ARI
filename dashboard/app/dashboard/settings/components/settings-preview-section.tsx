export interface SettingsPreviewSectionProps {
  showPreview: boolean;
  onTogglePreview: () => void;
  welcomeMessage: string;
  accentColor: string;
}

export function SettingsPreviewSection({
  showPreview,
  onTogglePreview,
  welcomeMessage,
  accentColor,
}: SettingsPreviewSectionProps) {
  return (
    <article className="space-y-4 rounded-xl border border-white/10 bg-ari-card p-4">
      <h3 className="text-lg font-semibold text-white">3. Vista previa</h3>
      <button
        type="button"
        onClick={onTogglePreview}
        className="rounded-lg border border-ari-accent bg-ari-accent/20 px-3 py-2 text-sm font-medium text-violet-200 hover:bg-ari-accent/30"
      >
        Vista previa
      </button>
      {showPreview ? (
        <div className="max-w-md rounded-2xl border border-white/10 bg-[#0d0f14] p-3">
          <p className="text-xs text-slate-400">WhatsApp preview</p>
          <div
            className="mt-2 ml-auto max-w-[85%] rounded-2xl px-3 py-2 text-sm text-white"
            style={{ backgroundColor: `${accentColor}66` }}
          >
            {welcomeMessage}
          </div>
        </div>
      ) : null}
    </article>
  );
}
