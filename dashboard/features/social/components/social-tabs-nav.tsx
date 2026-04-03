"use client";

import type { TabKey } from "../hooks/use-social-ui";

const tabs: Array<{ id: TabKey; label: string }> = [
  { id: "publicar", label: "Publicar ahora" },
  { id: "automatizacion", label: "Automatización" },
  { id: "imagenes", label: "Banco de imágenes" },
  { id: "historial", label: "Historial" },
];

export interface SocialTabsNavProps {
  activeTab: TabKey;
  onChange: (tab: TabKey) => void;
}

export function SocialTabsNav({ activeTab, onChange }: SocialTabsNavProps) {
  return (
    <nav className="flex flex-wrap gap-2">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`rounded-lg px-3 py-2 text-sm font-medium ${
            activeTab === tab.id
              ? "bg-ari-accent text-white"
              : "border border-white/10 bg-white/5 text-slate-300"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
