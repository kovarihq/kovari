import '../services/message_hydrator.dart';


class HydratedMessage {
  final String id;
  final String text;
  final String senderId;
  final DateTime createdAt;
  final String? mediaUrl;
  final String? mediaType;
  final String status;
  final MessageOrigin origin;
  final int migrationVersion;

  HydratedMessage({
    required this.id,
    required this.text,
    required this.senderId,
    required this.createdAt,
    this.mediaUrl,
    this.mediaType,
    required this.status,
    required this.origin,
    required this.migrationVersion,
  });
}

class DisplayMessage {
  final String id;
  final String displayText;
  final String senderId;
  final DateTime createdAt;
  final String? mediaUrl;
  final String? mediaType;
  final String status;
  final bool isFromMe;

  DisplayMessage({
    required this.id,
    required this.displayText,
    required this.senderId,
    required this.createdAt,
    this.mediaUrl,
    this.mediaType,
    required this.status,
    required this.isFromMe,
  });
}
