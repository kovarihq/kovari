class KovariUser {
  KovariUser({
    required this.id,
    required this.email,
    this.uuid,
    this.name,
    this.banned = false,
    this.banReason,
    this.banExpiresAt,
    this.isInternal = false,
  });

  factory KovariUser.fromAuthResponse(Map<String, dynamic> json) => KovariUser(
    id: json['id'] as String,
    uuid: json['uuid'] as String?,
    email: json['email'] as String,
    name: json['name'] as String?,
    banned: json['banned'] as bool? ?? false,
    banReason: (json['banReason'] ?? json['ban_reason']) as String?,
    banExpiresAt: (json['banExpiresAt'] ?? json['ban_expires_at']) as String?,
    isInternal: (json['is_internal'] as bool?) ?? (json['isInternal'] as bool?) ?? false,
  );

  factory KovariUser.fromJson(Map<String, dynamic> json) => KovariUser(
    id: json['id'] as String,
    uuid: json['uuid'] as String?,
    email: json['email'] as String,
    name: json['name'] as String?,
    banned: json['banned'] as bool? ?? false,
    banReason: (json['banReason'] ?? json['ban_reason']) as String?,
    banExpiresAt: (json['banExpiresAt'] ?? json['ban_expires_at']) as String?,
    isInternal: (json['is_internal'] as bool?) ?? (json['isInternal'] as bool?) ?? false,
  );
  final String id;
  final String? uuid;
  final String email;
  final String? name;
  final bool banned;
  final String? banReason;
  final String? banExpiresAt;
  final bool isInternal;

  /// True when the user has an active ban or non-expired suspension.
  bool get isActivelyBanned {
    if (!banned) return false;
    if (banExpiresAt != null) {
      final expires = DateTime.tryParse(banExpiresAt!);
      if (expires != null && expires.isBefore(DateTime.now())) {
        return false;
      }
    }
    return true;
  }

  /// Resolves the best UUID for encryption/identity.
  /// Falls back to [id] if [uuid] is null and [id] is in UUID format.
  String? get resolvedUuid {
    if (uuid != null) return uuid;
    // Simple heuristic: UUIDs are 36 chars and contain hyphens
    if (id.length == 36 && id.contains('-')) return id;
    return null;
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'uuid': uuid,
    'email': email,
    'name': name,
    'banned': banned,
    'banReason': banReason,
    'banExpiresAt': banExpiresAt,
    'isInternal': isInternal,
  };
}
