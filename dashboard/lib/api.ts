export const BASE_URL = "http://localhost:3000";

export type ConversationStatus =
  | "NEW_LEAD"
  | "QUALIFYING"
  | "READY_TO_BOOK"
  | "BOOKED"
  | "FOLLOW_UP";

export interface RecentConversation {
  id: string;
  phone: string;
  state: ConversationStatus | string;
  business_id: string;
  created_at: string;
}

export interface MetricsResponse {
  leads_today: number;
  appointments_week: number;
  conversion_rate: number;
  avg_response_time: string;
  recent_conversations: RecentConversation[];
}

export interface Conversation {
  id: string;
  phone: string;
  state: ConversationStatus | string;
  business_id: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  from: string;
  text: string;
  sent_at: string;
}

export interface Appointment {
  id: string;
  title: string;
  start: string | null;
  end: string | null;
  phone: string | null;
  service: string | null;
}

export interface BusinessService {
  name: string;
  duration: number;
  price: number;
}

export interface BusinessConfig {
  id?: string;
  business_id?: string;
  name: string;
  type: string;
  start_hour: number;
  end_hour: number;
  tone: string;
  welcome_message: string;
  active_announcement: string | null;
  services: BusinessService[];
  created_at?: string;
  updated_at?: string;
}

export interface UpdateConfigResponse {
  success: boolean;
  config: BusinessConfig;
}

/**
 * Helper central para consumo de la API de ARI.
 * Maneja errores de red y HTTP en un solo lugar.
 */
export async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers || {}),
      },
      ...options,
    });

    const rawText = await response.text();
    const parsedBody = rawText ? (JSON.parse(rawText) as unknown) : null;

    if (!response.ok) {
      const errorMessage =
        parsedBody && typeof parsedBody === "object" && "error" in parsedBody
          ? String((parsedBody as { error?: string }).error || "Error desconocido")
          : `Error HTTP ${response.status}`;
      throw new Error(errorMessage);
    }

    return parsedBody as T;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Respuesta inválida del servidor.");
    }

    if (error instanceof Error) {
      throw new Error(`No se pudo completar la petición: ${error.message}`);
    }

    throw new Error("No se pudo completar la petición.");
  }
}

export function getMetrics(): Promise<MetricsResponse> {
  return fetchAPI<MetricsResponse>("/api/metrics");
}

export function getConversations(): Promise<Conversation[]> {
  return fetchAPI<Conversation[]>("/api/conversations");
}

export function getMessages(phone: string): Promise<Message[]> {
  return fetchAPI<Message[]>(`/api/conversations/${encodeURIComponent(phone)}/messages`);
}

export function getAppointments(): Promise<Appointment[]> {
  return fetchAPI<Appointment[]>("/api/appointments");
}

export function getConfig(businessId: string): Promise<BusinessConfig> {
  return fetchAPI<BusinessConfig>(`/api/config/${encodeURIComponent(businessId)}`);
}

export function updateConfig(businessId: string, data: BusinessConfig): Promise<UpdateConfigResponse> {
  return fetchAPI<UpdateConfigResponse>(`/api/config/${encodeURIComponent(businessId)}`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}
