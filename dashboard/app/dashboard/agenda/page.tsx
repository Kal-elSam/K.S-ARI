"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { getAppointments, type Appointment } from "@/lib/api";

type WeekDay = "Lunes" | "Martes" | "Miércoles" | "Jueves" | "Viernes";
const weekDays: WeekDay[] = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

const today = new Date().toISOString().split("T")[0];

interface AppointmentCard {
  id: string;
  day: WeekDay;
  hour: string;
  service: string;
  phone: string;
}

/**
 * Un solo control "Acciones" con menú desplegable (sin librerías).
 * Cierra el menú al elegir una opción.
 */
function AppointmentActionsMenu() {
  const closeDetails = (event: MouseEvent<HTMLElement>) => {
    const details = event.currentTarget.closest("details");
    details?.removeAttribute("open");
  };

  return (
    <details className="group relative mt-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-xs font-medium text-slate-200 shadow-sm transition hover:border-white/25 hover:bg-white/10 [&::-webkit-details-marker]:hidden">
        <span>Acciones</span>
        <span
          aria-hidden
          className="text-[10px] text-slate-500 transition group-open:rotate-180 group-open:text-slate-400"
        >
          ▾
        </span>
      </summary>
      <div className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-lg border border-white/10 bg-[#0d0f14] py-1 shadow-xl ring-1 ring-black/50">
        <button
          type="button"
          onClick={closeDetails}
          className="flex w-full items-center px-3 py-2 text-left text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/15 focus-visible:outline-none focus-visible:bg-emerald-500/20"
        >
          Confirmar
        </button>
        <button
          type="button"
          onClick={closeDetails}
          className="flex w-full items-center px-3 py-2 text-left text-xs font-medium text-red-200 transition hover:bg-red-500/15 focus-visible:outline-none focus-visible:bg-red-500/20"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={closeDetails}
          className="flex w-full items-center px-3 py-2 text-left text-xs font-medium text-amber-200 transition hover:bg-amber-500/15 focus-visible:outline-none focus-visible:bg-amber-500/20"
        >
          Reagendar
        </button>
      </div>
    </details>
  );
}

function getDayNameFromISO(isoValue: string): WeekDay | null {
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const dayNames: Record<number, WeekDay | null> = {
    0: null,
    1: "Lunes",
    2: "Martes",
    3: "Miércoles",
    4: "Jueves",
    5: "Viernes",
    6: null,
  };

  return dayNames[date.getDay()];
}

function formatHourFromISO(isoValue: string): string {
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }

  return new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export default function AgendaPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let isMounted = true;

    const loadAppointments = async () => {
      setIsLoading(true);
      setError("");

      try {
        const data = await getAppointments();
        if (isMounted) {
          setAppointments(data);
        }
      } catch {
        if (isMounted) {
          setError("No se pudieron cargar las citas");
          setAppointments([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadAppointments();
    return () => {
      isMounted = false;
    };
  }, []);

  const mappedAppointments = useMemo<AppointmentCard[]>(
    () =>
      appointments
        .map((appointment) => {
          if (!appointment.start) {
            return null;
          }

          const day = getDayNameFromISO(appointment.start);
          if (!day) {
            return null;
          }

          return {
            id: appointment.id,
            day,
            hour: formatHourFromISO(appointment.start),
            service: appointment.service || "Sin servicio",
            phone: appointment.phone || "Sin teléfono",
          };
        })
        .filter((appointment): appointment is AppointmentCard => appointment !== null),
    [appointments]
  );

  const appointmentsByDay = useMemo(
    () =>
      weekDays.map((day) => ({
        day,
        appointments: mappedAppointments.filter((appointment) => appointment.day === day),
      })),
    [mappedAppointments]
  );

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-white">Agenda semanal</h2>
          <p className="mt-1 text-sm text-slate-400">Citas de Google Calendar agrupadas por día.</p>
        </div>
        <label className="space-y-1 text-sm text-slate-300">
          <span>Filtrar por fecha</span>
          <input
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
            className="block rounded-lg border border-white/10 bg-ari-card px-3 py-2 text-white outline-none focus:border-ari-accent"
          />
        </label>
      </header>

      <p className="rounded-lg border border-white/10 bg-ari-card px-3 py-2 text-xs text-slate-400">
        Fecha seleccionada: <span className="font-medium text-slate-200">{selectedDate}</span>
      </p>

      {error ? (
        <p className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-5">
        {isLoading
          ? weekDays.map((day) => (
              <article key={day} className="rounded-xl border border-white/10 bg-ari-card p-3">
                <h3 className="mb-3 border-b border-white/10 pb-2 text-sm font-semibold text-white">{day}</h3>
                <div className="space-y-3">
                  <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <div className="h-4 w-20 animate-pulse rounded bg-white/10" />
                    <div className="mt-2 h-3 w-28 animate-pulse rounded bg-white/10" />
                    <div className="mt-2 h-3 w-24 animate-pulse rounded bg-white/10" />
                  </div>
                </div>
              </article>
            ))
          : appointmentsByDay.map(({ day, appointments: dayAppointments }) => (
              <article key={day} className="rounded-xl border border-white/10 bg-ari-card p-3">
                <h3 className="mb-3 border-b border-white/10 pb-2 text-sm font-semibold text-white">{day}</h3>
                <div className="space-y-3">
                  {dayAppointments.length === 0 ? (
                    <p className="text-xs text-slate-500">Sin citas.</p>
                  ) : (
                    dayAppointments.map((appointment) => (
                      <div key={appointment.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                        <p className="text-sm font-semibold text-white">{appointment.hour}</p>
                        <p className="mt-1 text-sm text-slate-200">{appointment.service}</p>
                        <p className="mt-1 text-xs text-slate-400">{appointment.phone}</p>
                        <AppointmentActionsMenu />
                      </div>
                    ))
                  )}
                </div>
              </article>
            ))}
      </div>
    </section>
  );
}
