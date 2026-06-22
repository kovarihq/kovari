import { NotificationType, EntityType } from "@kovari/types";

export interface PushPayload {
  title: string;
  body: string;
  entityType: EntityType | null;
  entityId: string | null;
  data: Record<string, string>;
}

export const NotificationPayloadBuilder = {
  message: (chatId: string): PushPayload => ({
    title: "New message",
    body: "Open Kovari to view message",
    entityType: "chat" as EntityType,
    entityId: chatId,
    data: { entity_type: "chat", entity_id: chatId },
  }),

  match: (partnerName: string, chatId: string): PushPayload => ({
    title: "It's a match! 🎉",
    body: `You matched with ${partnerName}. Start a conversation.`,
    entityType: "match" as EntityType,
    entityId: chatId,
    data: { entity_type: "match", entity_id: chatId },
  }),

  groupInvite: (groupName: string, groupId: string): PushPayload => ({
    title: "Group Invitation",
    body: `You've been invited to join ${groupName}!`,
    entityType: "group" as EntityType,
    entityId: groupId,
    data: { entity_type: "group", entity_id: groupId },
  }),

  matchRequest: (): PushPayload => ({
    title: "New connection request",
    body: "Someone wants to connect with you on Kovari.",
    entityType: "request" as EntityType,
    entityId: null,
    data: { entity_type: "request", entity_id: "" },
  }),
};

export function getChannelId(entityType: EntityType | null): string {
  switch (entityType) {
    case "chat":
      return "kovari_messages";
    case "group":
      return "kovari_groups";
    case "match":
      return "kovari_matches";
    default:
      return "kovari_messages";
  }
}
