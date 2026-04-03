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

export type ServicePriceType = "one_time" | "monthly" | "annual" | "per_session";
export type ServiceCurrency = "MXN" | "USD";

export interface BusinessService {
  name: string;
  description: string;
  price_type: ServicePriceType;
  price: number | null;
  /** Presente cuando `price` es null (precio por cotización). */
  price_label?: string | null;
  setup_fee: number | null;
  currency: ServiceCurrency;
  duration: number | null;
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
export type SocialSchedulePlatform = "instagram" | "facebook";
export type SocialScheduleFrequency = "daily" | "3x_week" | "5x_week";
export type SocialImageSource = "own" | "unsplash" | "auto";

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

export interface SocialScheduleConfig {
  business_id: string;
  is_active: boolean;
  frequency: SocialScheduleFrequency;
  post_times: string[];
  topics: string[];
  platforms: SocialSchedulePlatform[];
  tone: string;
  image_source: SocialImageSource;
}

export interface UpsertSocialScheduleConfigPayload {
  businessId: string;
  frequency: SocialScheduleFrequency;
  post_times: string[];
  topics: string[];
  platforms: SocialSchedulePlatform[];
  tone: string;
  image_source: SocialImageSource;
}

export interface ToggleSocialSchedulePayload {
  businessId: string;
  active: boolean;
}

export interface ToggleSocialScheduleResponse {
  success: boolean;
  is_active: boolean;
  nextPost: string | null;
}

export interface SocialImage {
  id: string;
  business_id: string;
  url: string;
  topic_tags: string[];
  source: "own" | "unsplash";
  created_at: string;
}

export interface CreateSocialImagePayload {
  businessId: string;
  url: string;
  topic_tags: string[];
}

export interface PublishNowPayload {
  businessId: string;
  topic?: string;
  platforms?: SocialSchedulePlatform[];
  tone?: string;
  /** Si vienen del preview, se publican sin regenerar con IA. */
  content?: string;
  hashtags?: string;
  imageUrl?: string;
}

export interface PublishNowResponse {
  success: boolean;
  topic: string;
  platforms: SocialSchedulePlatform[];
  ig_post_id: string | null;
  fb_post_id: string | null;
  content: string;
  imageUrl: string;
}
