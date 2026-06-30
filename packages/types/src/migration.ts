export const MESSAGE_MIGRATION_VERSION = {
  LEGACY_E2EE: 1,
  DUAL_PERSISTENCE: 2,
  PLAINTEXT_ONLY: 3,
} as const;

export type MessageMigrationVersion = typeof MESSAGE_MIGRATION_VERSION[keyof typeof MESSAGE_MIGRATION_VERSION];

/** Phase 8B: E2EE fully decommissioned. Only plaintext mode is supported. */
export type MessageWriteMode = 'plaintext';

/**
 * The migration_version stamped on every new message.
 * Phase 8B: Advanced to PLAINTEXT_ONLY (3) — full backfill complete.
 */
export const CURRENT_MESSAGE_WRITE_VERSION =
  MESSAGE_MIGRATION_VERSION.PLAINTEXT_ONLY;
