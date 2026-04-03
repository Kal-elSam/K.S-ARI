import { fetchAPI } from "./client";
import type {
  CreateSocialImagePayload,
  GenerateSocialPostPayload,
  GenerateSocialPostResponse,
  PublishNowPayload,
  PublishNowResponse,
  PublishSocialPostPayload,
  PublishSocialPostResponse,
  ScheduleSocialPostPayload,
  ScheduleSocialPostResponse,
  SocialImage,
  SocialPost,
  SocialScheduleConfig,
  ToggleSocialSchedulePayload,
  ToggleSocialScheduleResponse,
  UpsertSocialScheduleConfigPayload,
} from "./types";

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

export function getSocialScheduleConfig(businessId: string): Promise<SocialScheduleConfig> {
  return fetchAPI<SocialScheduleConfig>(
    `/api/social/schedule/config/${encodeURIComponent(businessId)}`
  );
}

export function upsertSocialScheduleConfig(
  payload: UpsertSocialScheduleConfigPayload
): Promise<SocialScheduleConfig> {
  return fetchAPI<SocialScheduleConfig>("/api/social/schedule/config", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function toggleSocialSchedule(
  payload: ToggleSocialSchedulePayload
): Promise<ToggleSocialScheduleResponse> {
  return fetchAPI<ToggleSocialScheduleResponse>("/api/social/schedule/toggle", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getSocialImages(businessId: string): Promise<SocialImage[]> {
  return fetchAPI<SocialImage[]>(`/api/social/images/${encodeURIComponent(businessId)}`);
}

export function createSocialImage(payload: CreateSocialImagePayload): Promise<SocialImage> {
  return fetchAPI<SocialImage>("/api/social/images", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteSocialImage(imageId: string): Promise<{ success: boolean }> {
  return fetchAPI<{ success: boolean }>(`/api/social/images/${encodeURIComponent(imageId)}`, {
    method: "DELETE",
  });
}

export function publishSocialNow(payload: PublishNowPayload): Promise<PublishNowResponse> {
  return fetchAPI<PublishNowResponse>("/api/social/publish/now", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
