export const MESSAGE_MIGRATION_VERSION = {
  LEGACY_E2EE: 1,
  DUAL_PERSISTENCE: 2,
  PLAINTEXT_ONLY: 3,
} as const;

export type MessageMigrationVersion = typeof MESSAGE_MIGRATION_VERSION[keyof typeof MESSAGE_MIGRATION_VERSION];
