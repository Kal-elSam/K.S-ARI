import { NavLink } from "./nav-link";
import type { ReactNode } from "react";

interface DashboardLayoutProps {
  children: ReactNode;
}

const navigationItems = [
  { href: "/dashboard/metrics", label: "Métricas" },
  { href: "/dashboard/inbox", label: "Inbox" },
  { href: "/dashboard/agenda", label: "Agenda" },
  { href: "/dashboard/social", label: "📱 Redes sociales" },
  { href: "/dashboard/settings", label: "Configurador" }
];

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-ari-bg">
      <div className="mx-auto grid min-h-screen w-full max-w-[1400px] grid-cols-1 md:grid-cols-[240px_1fr]">
        <aside className="border-b border-white/10 bg-ari-card p-4 md:border-b-0 md:border-r md:p-6">
          <div className="mb-8">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">ARI</p>
            <h1 className="mt-2 text-xl font-semibold text-white">Panel de control</h1>
          </div>
          <nav className="space-y-2">
            {navigationItems.map((item) => (
              <NavLink key={item.href} href={item.href} label={item.label} />
            ))}
          </nav>
        </aside>

        <div className="flex min-h-screen flex-col">
          <header className="sticky top-0 z-20 flex items-center justify-between border-b border-white/10 bg-ari-bg/90 px-4 py-4 backdrop-blur md:px-6">
            <div>
              <p className="text-xs text-slate-400">Negocio</p>
              <p className="text-base font-semibold text-white md:text-lg">Clínica ARI Demo</p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300 md:text-sm">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Bot activo
            </div>
          </header>

          <main className="flex-1 p-4 md:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
