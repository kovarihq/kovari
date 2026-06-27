export enum NotificationType {
  MATCH_INTEREST_RECEIVED = "MATCH_INTEREST_RECEIVED",
  MATCH_ACCEPTED = "MATCH_ACCEPTED",
  GROUP_INVITE_RECEIVED = "GROUP_INVITE_RECEIVED",
  GROUP_JOIN_REQUEST_RECEIVED = "GROUP_JOIN_REQUEST_RECEIVED",
  GROUP_JOIN_APPROVED = "GROUP_JOIN_APPROVED",
  NEW_MESSAGE = "NEW_MESSAGE",
  REPORT_SUBMITTED = "REPORT_SUBMITTED",
}

export type EntityType = "match" | "group" | "chat" | "report" | null;

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  entity_type: EntityType;
  entity_id: string | null;
  is_read: boolean;
  created_at: string;
  image_url?: string;
}

export enum NotificationPriority {
  HIGH = "high",
  MEDIUM = "medium",
  LOW = "low",
}

export const NotificationPriorityMap: Record<NotificationType, NotificationPriority> = {
  [NotificationType.MATCH_INTEREST_RECEIVED]: NotificationPriority.HIGH,
  [NotificationType.MATCH_ACCEPTED]: NotificationPriority.HIGH,
  [NotificationType.GROUP_INVITE_RECEIVED]: NotificationPriority.HIGH,
  [NotificationType.GROUP_JOIN_APPROVED]: NotificationPriority.HIGH,
  [NotificationType.GROUP_JOIN_REQUEST_RECEIVED]: NotificationPriority.MEDIUM,
  [NotificationType.NEW_MESSAGE]: NotificationPriority.HIGH,
  [NotificationType.REPORT_SUBMITTED]: NotificationPriority.LOW,
};

export interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: EntityType;
  entityId?: string;
  imageUrl?: string;
  priority?: NotificationPriority; // Optional override
  data?: Record<string, string>; // Custom metadata dictionary
}

