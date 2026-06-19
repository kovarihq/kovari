import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/network/api_client.dart';
import 'package:mobile/core/security/encryption_service.dart';
import 'package:mobile/core/utils/app_logger.dart';

// ---------------------------------------------------------------------------
// GroupKeyData
// ---------------------------------------------------------------------------

/// Response model for GET /groups/:groupId/encryption-key
class GroupKeyData {
  const GroupKeyData({
    required this.groupId,
    required this.key,
    required this.fingerprint,
    required this.createdAt,
  });

  factory GroupKeyData.fromJson(Map<String, dynamic> json) => GroupKeyData(
        groupId: json['groupId'] as String,
        key: json['key'] as String,
        fingerprint: json['fingerprint'] as String? ?? '',
        createdAt: json['createdAt'] as String? ?? '',
      );

  final String groupId;

  /// The raw shared AES key string — used as the PBKDF2 password.
  final String key;

  /// SHA-256 fingerprint of the key (for rotation audits).
  final String fingerprint;
  final String createdAt;
}

// ---------------------------------------------------------------------------
// GroupEncryptionService
// ---------------------------------------------------------------------------

/// Mobile parity for the web `useGroupEncryption` hook.
///
/// Responsibilities:
/// - Fetch the group shared key from `GET /groups/:groupId/encryption-key`.
/// - Cache the key per group in memory for the session lifetime.
/// - Provide `encryptMessage` / `decryptMessage` wrappers that delegate to
///   [EncryptionService] with the fetched group key.
///
/// Architecture note: Uses the same AES-CBC / PBKDF2 algorithm as the web
/// client (implemented in [EncryptionService]) so cross-platform
/// encrypt/decrypt is guaranteed to be byte-compatible.
///
/// Usage:
/// ```dart
/// final svc = ref.read(groupEncryptionServiceProvider);
/// await svc.ensureKeyLoaded(groupId);
/// final encrypted = await svc.encryptMessage(groupId, plainText);
/// final plain = await svc.decryptMessage(groupId, encryptedContent, iv, salt);
/// ```
class GroupEncryptionService {
  GroupEncryptionService(this._ref);

  final Ref _ref;
  final _encryption = EncryptionService();

  /// In-memory key cache: groupId → key string.
  final Map<String, String> _keyCache = {};

  /// In-flight fetch deduplication: groupId → future.
  final Map<String, Future<String?>> _inflight = {};

  // ---------------------------------------------------------------------------
  // Key Management
  // ---------------------------------------------------------------------------

  /// Returns the cached key for [groupId], or fetches it from the server.
  Future<String?> ensureKeyLoaded(String groupId) async {
    if (_keyCache.containsKey(groupId)) return _keyCache[groupId];
    if (_inflight.containsKey(groupId)) return _inflight[groupId];

    final future = _fetchGroupKey(groupId);
    _inflight[groupId] = future;

    try {
      final key = await future;
      return key;
    } finally {
      _inflight.remove(groupId);
    }
  }

  Future<String?> _fetchGroupKey(String groupId) async {
    try {
      AppLogger.d('[GroupEncryptionService] Fetching key for $groupId');
      final apiClient = _ref.read(apiClientProvider);
      final response = await apiClient.get<Map<String, dynamic>>(
        'groups/$groupId/encryption-key',
        parser: (data) => data as Map<String, dynamic>,
        ignoreCache: false,
      );

      if (response.data == null) {
        AppLogger.w('[GroupEncryptionService] Null response for $groupId');
        return null;
      }

      final keyData = GroupKeyData.fromJson(response.data!);
      _keyCache[groupId] = keyData.key;
      AppLogger.d(
        '[GroupEncryptionService] Key loaded for $groupId '
        '(fingerprint: ${keyData.fingerprint})',
      );
      return keyData.key;
    } catch (e) {
      AppLogger.e(
        '[GroupEncryptionService] Failed to fetch key for $groupId',
        error: e,
      );
      return null;
    }
  }

  /// Evict the cached key for [groupId] — call after a key rotation event.
  void evictKey(String groupId) {
    _keyCache.remove(groupId);
    AppLogger.d('[GroupEncryptionService] Evicted key for $groupId');
  }

  /// Whether a key is currently cached for [groupId].
  bool isKeyAvailable(String groupId) => _keyCache.containsKey(groupId);

  // ---------------------------------------------------------------------------
  // Encrypt / Decrypt
  // ---------------------------------------------------------------------------

  /// Encrypts [plainText] with the group key for [groupId].
  ///
  /// Returns the encrypted payload map:
  ///   `{ encryptedContent, encryption_iv, encryption_salt }`
  ///
  /// Returns `null` if the key cannot be loaded or encryption fails.
  Future<Map<String, String>?> encryptMessage(
    String groupId,
    String plainText,
  ) async {
    final key = await ensureKeyLoaded(groupId);
    if (key == null) {
      AppLogger.e('[GroupEncryptionService] Cannot encrypt: no key for $groupId');
      return null;
    }

    try {
      final result = await _encryption.encryptMessage(plainText, key);
      return result;
    } catch (e) {
      AppLogger.e(
        '[GroupEncryptionService] Encryption failed for $groupId',
        error: e,
      );
      return null;
    }
  }

  /// Decrypts an encrypted group message.
  ///
  /// Returns the plain text, or `'[Encrypted message]'` on failure.
  Future<String> decryptMessage({
    required String groupId,
    required String encryptedContent,
    required String iv,
    required String salt,
  }) async {
    final key = await ensureKeyLoaded(groupId);
    if (key == null) {
      AppLogger.w('[GroupEncryptionService] Cannot decrypt: no key for $groupId');
      return '[Encrypted message]';
    }

    return _encryption.decryptMessage(
      encryptedContent: encryptedContent,
      iv: iv,
      salt: salt,
      key: key,
    );
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

final groupEncryptionServiceProvider = Provider<GroupEncryptionService>(
  (ref) => GroupEncryptionService(ref),
);
