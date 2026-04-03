"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getConfig } from "@/lib/api";
import { ARI_BUSINESS_CONFIG_UPDATED } from "@/lib/business-config-updated";

const DEFAULT_NAME = "Clínica ARI Demo";

export function DashboardBusinessTitle() {
  const pathname = usePathname();
  const [name, setName] = useState(DEFAULT_NAME);

  useEffect(() => {
    let isMounted = true;
    const loadName = () => {
      void getConfig("demo")
        .then((config) => {
          if (!isMounted) {
            return;
          }
          const nextName = config?.name?.trim();
          if (nextName) {
            setName(nextName);
          }
        })
        .catch(() => {
          /* API no disponible: mantener fallback */
        });
    };

    loadName();

    const onConfigUpdated = () => {
      loadName();
    };
    window.addEventListener(ARI_BUSINESS_CONFIG_UPDATED, onConfigUpdated);
    return () => {
      isMounted = false;
      window.removeEventListener(ARI_BUSINESS_CONFIG_UPDATED, onConfigUpdated);
    };
  }, [pathname]);

  return <p className="text-base font-semibold text-white md:text-lg">{name}</p>;
}
