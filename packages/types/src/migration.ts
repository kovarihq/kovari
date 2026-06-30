export const MESSAGE_MIGRATION_VERSION = {
  LEGACY_E2EE: 1,
  DUAL_PERSISTENCE: 2,
  PLAINTEXT_ONLY: 3,
} as const;

export type MessageMigrationVersion = typeof MESSAGE_MIGRATION_VERSION[keyof typeof MESSAGE_MIGRATION_VERSION];

/** Write mode type used by each client to select its outgoing payload contract. */
export type MessageWriteMode = 'legacy' | 'dual' | 'plaintext';

/**
 * The migration_version stamped on every new message.
 * Kept at DUAL_PERSISTENCE (2) so existing hydrators need no change.
 * Advance to PLAINTEXT_ONLY (3) only after full backfill is complete.
 */
export const CURRENT_MESSAGE_WRITE_VERSION =
  MESSAGE_MIGRATION_VERSION.DUAL_PERSISTENCE;
