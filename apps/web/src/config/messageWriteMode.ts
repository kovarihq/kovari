import type { MessageWriteMode } from '@kovari/types';

const VALID_MODES: MessageWriteMode[] = ['legacy', 'dual', 'plaintext'];

/**
 * Runtime write mode from environment, validated against known values.
 * Falls back to the compile-time default if absent or invalid.
 *
 * Set NEXT_PUBLIC_MESSAGE_WRITE_MODE=dual in .env.local to revert
 * without a code change. Safe to leave unset — defaults to 'plaintext'.
 */
const envMode = process.env.NEXT_PUBLIC_MESSAGE_WRITE_MODE as MessageWriteMode | undefined;

export const CLIENT_WRITE_MODE: MessageWriteMode =
  envMode && VALID_MODES.includes(envMode) ? envMode : 'plaintext';
