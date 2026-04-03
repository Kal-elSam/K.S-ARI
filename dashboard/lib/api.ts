export const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

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
  slogan: string;
  type: string;
  start_hour: number;
  end_hour: number;
  tone: string;
  welcome_message: string;
  active_announcement: string | null;
  accent_color?: string;
  services: BusinessService[];
  created_at?: string;
  updated_at?: string;
}

export interface UpdateConfigResponse {
  success: boolean;
  config: BusinessConfig;
}

export type SocialPlatform = "instagram" | "facebook" | "both";
export type SocialStatus = "draft" | "scheduled" | "published" | "failed";

export interface GenerateSocialPostPayload {
  topic: string;
  tone: string;
  businessId: string;
}

export interface GenerateSocialPostResponse {
  content: string;
  hashtags: string;
  preview: string;
}

export interface PublishSocialPostPayload {
  content: string;
  hashtags: string;
  platform: SocialPlatform;
  imageUrl?: string;
  businessId: string;
}

export interface PublishSocialPostResponse {
  success: boolean;
  ig_post_id?: string | null;
  fb_post_id?: string | null;
}

export interface ScheduleSocialPostPayload extends PublishSocialPostPayload {
  scheduledAt: string;
}

export interface ScheduleSocialPostResponse {
  success: boolean;
  post_id: string;
  scheduledAt: string;
}

export interface SocialPost {
  id: string;
  business_id: string;
  platform: SocialPlatform;
  content: string;
  image_url: string | null;
  hashtags: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  status: SocialStatus;
  ig_post_id: string | null;
  fb_post_id: string | null;
  created_at: string;
  updated_at: string;
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

export function generateSocialPost(
  payload: GenerateSocialPostPayload
): Promise<GenerateSocialPostResponse> {
  return fetchAPI<GenerateSocialPostResponse>("/api/social/generate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function publishSocialPost(payload: PublishSocialPostPayload): Promise<PublishSocialPostResponse> {
  return fetchAPI<PublishSocialPostResponse>("/api/social/publish", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function scheduleSocialPost(
  payload: ScheduleSocialPostPayload
): Promise<ScheduleSocialPostResponse> {
  return fetchAPI<ScheduleSocialPostResponse>("/api/social/schedule", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getSocialPosts(businessId: string, status: string = "all"): Promise<SocialPost[]> {
  const params = new URLSearchParams({
    businessId,
    status,
  });
  return fetchAPI<SocialPost[]>(`/api/social/posts?${params.toString()}`);
}

export function deleteSocialPost(id: string): Promise<{ success: boolean }> {
  return fetchAPI<{ success: boolean }>(`/api/social/posts/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
