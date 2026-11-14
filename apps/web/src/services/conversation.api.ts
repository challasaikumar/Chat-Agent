import type { ConversationMessage, ConversationSummary } from "@minimi/shared";
import { apiRequest } from "./api.client.js";

type Page<T> = {
  items: T[];
  limit: number;
  nextCursor: string | null;
};

export async function listConversations(options?: {
  cursor?: string;
  includeArchived?: boolean;
  limit?: number;
}): Promise<Page<ConversationSummary>> {
  const params = new URLSearchParams();
  if (options?.cursor) params.set("cursor", options.cursor);
  if (options?.includeArchived) params.set("includeArchived", "true");
  if (options?.limit) params.set("limit", String(options.limit));
  const qs = params.toString();
  return apiRequest(`/api/conversations${qs ? `?${qs}` : ""}`);
}

export async function createConversation(
  title?: string,
): Promise<ConversationSummary> {
  return apiRequest("/api/conversations", {
    method: "POST",
    body: JSON.stringify(title ? { title } : {}),
  });
}

export async function getConversation(
  id: string,
): Promise<ConversationSummary> {
  return apiRequest(`/api/conversations/${id}`);
}

export async function updateConversation(
  id: string,
  patch: { title?: string; archived?: boolean },
): Promise<ConversationSummary> {
  return apiRequest(`/api/conversations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteConversation(
  id: string,
): Promise<{ deleted: true; id: string }> {
  return apiRequest(`/api/conversations/${id}`, {
    method: "DELETE",
  });
}

export async function listMessages(
  conversationId: string,
  options?: { cursor?: string; limit?: number },
): Promise<Page<ConversationMessage>> {
  const params = new URLSearchParams();
  if (options?.cursor) params.set("cursor", options.cursor);
  if (options?.limit) params.set("limit", String(options.limit));
  const qs = params.toString();
  return apiRequest(
    `/api/conversations/${conversationId}/messages${qs ? `?${qs}` : ""}`,
  );
}

export type { ConversationMessage, ConversationSummary };
