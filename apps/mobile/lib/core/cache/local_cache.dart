import 'dart:convert';
import 'package:hive/hive.dart';
import 'package:mobile/core/utils/app_logger.dart';

class CacheEntry {
  CacheEntry({
    required this.data,
    required this.timestamp,
    required this.ttl,
    required this.version,
  });

  factory CacheEntry.fromJson(Map<String, dynamic> json) => CacheEntry(
    data: json['data'],
    timestamp: DateTime.parse(json['timestamp'] as String),
    ttl: Duration(seconds: json['ttl'] as int),
    version: json['version'] as int? ?? 0,
  );
  final dynamic data;
  final DateTime timestamp;
  final Duration ttl;
  final int version;

  bool get isExpired => DateTime.now().isAfter(timestamp.add(ttl));

  Map<String, dynamic> toJson() => {
    'data': data,
    'timestamp': timestamp.toIso8601String(),
    'ttl': ttl.inSeconds,
    'version': version,
  };
}

class LocalCache {
  static const String _boxName = 'api_cache_v1';
  static const int _currentVersion = 1;
  static const int _maxEntries = 100; // LRU limit

  static Box<String>? _box;
  static Box<String>? _profileBox;
  static Box<String>? _entityBox;
  // Persistent seen-users set: survives app restarts, drives discovery feed
  // deduplication exactly like Hinge/Bumble's local interaction ledger.
  static Box<String>? _seenUsersBox;
  final Map<String, CacheEntry> _memoryCache = {};

  Future<void> init() async {
    try {
      _box = await Hive.openBox<String>(_boxName);
      _profileBox = await Hive.openBox<String>('profile_cache');
      _entityBox = await Hive.openBox<String>('entity_cache');
      _seenUsersBox = await Hive.openBox<String>('seen_users_v1');
      AppLogger.i(
        'LocalCache initialized (API: ${_box?.length}, Profile: ${_profileBox?.length}, Entity: ${_entityBox?.length}, SeenUsers: ${_seenUsersBox?.length})',
      );
      _checkVersion();
    } catch (e) {
      AppLogger.e('Failed to initialize Hive boxes: $e');
    }
  }

  void _checkVersion() {
    final storedVersion = _box?.get('__cache_version_key__');
    if (storedVersion == null ||
        int.tryParse(storedVersion) != _currentVersion) {
      AppLogger.w('Cache version mismatch. Clearing cache...');
      clearAll();
      _box?.put('__cache_version_key__', _currentVersion.toString());
    }
  }

  String _generateKey(String endpoint, Map<String, dynamic>? params) {
    if (params == null || params.isEmpty) return endpoint;
    final sortedParams = Map.fromEntries(
      params.entries.toList()..sort((a, b) => a.key.compareTo(b.key)),
    );
    return '$endpoint:${jsonEncode(sortedParams)}';
  }

  Future<void> set(
    String endpoint,
    dynamic data, {
    Map<String, dynamic>? params,
    Duration ttl = const Duration(hours: 1),
  }) async {
    final key = _generateKey(endpoint, params);
    final entry = CacheEntry(
      data: data,
      timestamp: DateTime.now(),
      ttl: ttl,
      version: _currentVersion,
    );

    _memoryCache[key] = entry;

    try {
      if (_box != null) {
        // LRU Eviction
        if (_box!.length >= _maxEntries && !_box!.containsKey(key)) {
          final oldestKey = _box!.keys.firstWhere(
            (k) => k != '__cache_version_key__',
          );
          await _box!.delete(oldestKey);
        }
        await _box!.put(key, jsonEncode(entry.toJson()));
      }
    } catch (e) {
      AppLogger.e('Failed to save to Hive: $e');
    }
  }

  CacheEntry? get(String endpoint, {Map<String, dynamic>? params, bool allowExpired = false}) {
    final key = _generateKey(endpoint, params);

    // 1. Memory Cache
    if (_memoryCache.containsKey(key)) {
      final entry = _memoryCache[key]!;
      if (allowExpired || !entry.isExpired) return entry;
      _memoryCache.remove(key);
    }

    // 2. Disk Cache
    try {
      final stored = _box?.get(key);
      if (stored != null) {
        final entry = CacheEntry.fromJson(
          jsonDecode(stored) as Map<String, dynamic>,
        );
        if (entry.version == _currentVersion) {
          if (allowExpired || !entry.isExpired) {
            _memoryCache[key] = entry;
            return entry;
          } else {
            _box?.delete(key);
          }
        } else {
          _box?.delete(key);
        }
      }
    } catch (e) {
      AppLogger.e('Failed to read from Hive: $e');
      _box?.delete(key);
    }

    return null;
  }

  Future<void> invalidate(
    String endpoint, {
    Map<String, dynamic>? params,
  }) async {
    final key = _generateKey(endpoint, params);
    _memoryCache.remove(key);
    await _box?.delete(key);
  }

  Future<void> cleanupExpired() async {
    if (_box == null) return;
    final keysToDelete = <dynamic>[];
    for (final key in _box!.keys) {
      if (key == '__cache_version_key__') continue;
      try {
        final stored = _box!.get(key);
        if (stored != null) {
          final entry = CacheEntry.fromJson(
            jsonDecode(stored) as Map<String, dynamic>,
          );
          if (entry.isExpired) {
            keysToDelete.add(key);
          }
        }
      } catch (_) {
        keysToDelete.add(key);
      }
    }
    if (keysToDelete.isNotEmpty) {
      await _box!.deleteAll(keysToDelete);
      AppLogger.i(
        '🧹 Cache cleanup: Removed ${keysToDelete.length} expired entries',
      );
    }
  }

  Future<void> clearAll() async {
    _memoryCache.clear();
    await _box?.clear();
    await _profileBox?.clear();
    await _entityBox?.clear();
    await _seenUsersBox?.clear();
    await _box?.put('__cache_version_key__', _currentVersion.toString());
  }

  // --- Collection Specific Helpers ---

  Future<void> setProfile(Map<String, dynamic> data) async {
    await _profileBox?.put('current', jsonEncode(data));
  }

  Map<String, dynamic>? getProfile() {
    final data = _profileBox?.get('current');
    return data != null ? jsonDecode(data) as Map<String, dynamic> : null;
  }

  Future<void> setEntities(String key, List<dynamic> data) async {
    await _entityBox?.put(key, jsonEncode(data));
  }

  List<dynamic>? getEntities(String key) {
    final data = _entityBox?.get(key);
    return data != null ? jsonDecode(data) as List<dynamic> : null;
  }

  // ── Seen-Users Ledger ────────────────────────────────────────────────────
  // Mirrors how Hinge/Bumble track locally which profiles have been acted on.
  // The ledger is keyed by userId so lookups are O(1).

  /// Persist a batch of user IDs that have been swiped (in any direction).
  Future<void> addSeenUsers(Iterable<String> ids) async {
    if (_seenUsersBox == null || ids.isEmpty) return;
    final entries = {for (final id in ids) id: '1'};
    await _seenUsersBox!.putAll(entries);
  }

  /// Return the full set of seen user IDs.
  Set<String> getSeenUsers() {
    return _seenUsersBox?.keys.cast<String>().toSet() ?? {};
  }

  /// Remove all seen-user records (call on logout or manual reset).
  Future<void> clearSeenUsers() async {
    await _seenUsersBox?.clear();
  }
}
