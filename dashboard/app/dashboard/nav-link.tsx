"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavLinkProps {
  href: string;
  label: string;
}

export function NavLink({ href, label }: NavLinkProps) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${
        isActive
          ? "bg-ari-accent/20 text-violet-200"
          : "text-slate-300 hover:bg-white/5 hover:text-white"
      }`}
    >
      {label}
    </Link>
  );
}
