import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:mobile/core/utils/app_logger.dart';
import 'package:mobile/features/chat/models/pending_upload.dart';

class PendingUploadStore extends ChangeNotifier {
  PendingUploadStore() {
    _init();
  }

  Box<Map>? _box;
  bool _initialized = false;
  final Map<String, PendingUpload> _uploads = {};

  bool get isInitialized => _initialized;
  List<PendingUpload> get allPending => _uploads.values.toList();

  Future<void> _init() async {
    try {
      _box = await Hive.openBox<Map>('pending_uploads_v1');
      for (var key in _box!.keys) {
        final data = _box!.get(key);
        if (data != null) {
          final upload = PendingUpload.fromJson(Map<String, dynamic>.from(data));
          _uploads[upload.id] = upload;
        }
      }
      _initialized = true;
      notifyListeners();
    } catch (e) {
      AppLogger.e('🛡️ [PendingUploadStore] Init failed', error: e);
    }
  }

  Future<void> save(PendingUpload upload) async {
    _uploads[upload.id] = upload;
    await _box?.put(upload.id, upload.toJson());
    notifyListeners();
  }

  Future<void> delete(String id) async {
    _uploads.remove(id);
    await _box?.delete(id);
    notifyListeners();
  }

  PendingUpload? get(String id) => _uploads[id];
}

final pendingUploadStoreProvider = ChangeNotifierProvider<PendingUploadStore>((ref) {
  return PendingUploadStore();
});
