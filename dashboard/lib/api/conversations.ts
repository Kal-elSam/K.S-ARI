import { fetchAPI } from "./client";
import type { Conversation, Message } from "./types";

export function getConversations(): Promise<Conversation[]> {
  return fetchAPI<Conversation[]>("/api/conversations");
}

export function getMessages(phone: string): Promise<Message[]> {
  return fetchAPI<Message[]>(`/api/conversations/${encodeURIComponent(phone)}/messages`);
}
