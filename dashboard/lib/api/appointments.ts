import { fetchAPI } from "./client";
import type { Appointment } from "./types";

export function getAppointments(): Promise<Appointment[]> {
  return fetchAPI<Appointment[]>("/api/appointments");
}
