/// 🛡️ Defensive MatchUser model
///
/// Design rules:
/// - Required UI fields (id, name, image) have string defaults → no crash
/// - Optional metadata fields (age, score, bio) are nullable → preserve semantics
/// - Lists are always non-null
/// - No raw json field exposed to UI
class MatchUser {

  const MatchUser({
    required this.id,
    required this.name,
    required this.image,
    required this.location,
    required this.destination,
    this.age,
    this.score,
    this.bio,
    this.gender,
    this.nationality,
    this.personality,
    this.religion,
    this.smoking,
    this.drinking,
    this.foodPreference,
    this.profession,
    this.interests = const [],
    this.languages = const [],
    this.startDate,
    this.endDate,
    this.budget,
    this.travelIntentions = const [],
  });

  factory MatchUser.fromJson(Map<String, dynamic> json) {
    // Nested user object (v1 gateway shape: match.user)
    final userMap = json['user'] is Map<String, dynamic>
        ? json['user'] as Map<String, dynamic>
        : json;

    return MatchUser(
      id: (userMap['userId'] ?? userMap['id'] ?? json['userId'] ?? 'unknown')
          .toString(),
      name: (userMap['name'] ?? userMap['username'] ?? 'Traveler').toString(),
      image: (userMap['avatar'] ?? userMap['profilePhoto'] ?? '').toString(),
      location:
          (userMap['locationDisplay'] ??
                  userMap['location'] ??
                  'Unknown location')
              .toString(),
      destination:
          (json['destination'] ??
                  json['destination_id'] ??
                  'Unknown destination')
              .toString(),
      age: _asInt(userMap['age']),
      score: _asDouble(json['score'] ?? json['compatibility_score'] ?? json['compatibility']),
      bio: _asStringOrNull(userMap['bio']),
      gender: _asStringOrNull(userMap['gender']),
      nationality: _asStringOrNull(userMap['nationality']),
      personality: _asStringOrNull(userMap['personality']),
      religion: _asStringOrNull(userMap['religion']),
      smoking: _asStringOrNull(userMap['smoking']),
      drinking: _asStringOrNull(userMap['drinking']),
      foodPreference: _asStringOrNull(userMap['foodPreference']),
      profession: _asStringOrNull(userMap['profession']),
      interests: _asStringList(userMap['interests']),
      languages: _asStringList(userMap['languages']),
      startDate: _asDateTime(
        json['startDate'] ?? json['start_date'] ?? userMap['start_date'],
      ),
      endDate: _asDateTime(
        json['endDate'] ?? json['end_date'] ?? userMap['end_date'],
      ),
      budget: _asDouble(json['budget'] ?? userMap['budget']),
      travelIntentions: (userMap['travel_intentions'] ??
              userMap['travelIntentions'] ??
              json['travel_intentions'] ??
              json['travelIntentions'] ??
              const [])
          as List<dynamic>,
    );
  }
  final String id;
  final String name;
  final String image;
  final String location;
  final String destination;
  // Nullable: meaningful absence (user didn't fill)
  final int? age;
  final double? score;
  final String? bio;
  final String? gender;
  final String? nationality;
  final String? personality;
  final String? religion;
  final String? smoking;
  final String? drinking;
  final String? foodPreference;
  final String? profession;
  // Non-null collections
  final List<String> interests;
  final List<String> languages;
  final DateTime? startDate;
  final DateTime? endDate;
  final double? budget;
  final List<dynamic> travelIntentions;

  Map<String, dynamic> toJson() => {
      'id': id,
      'name': name,
      'image': image,
      'location': location,
      'destination': destination,
      'age': age,
      'score': score,
      'bio': bio,
      'gender': gender,
      'nationality': nationality,
      'personality': personality,
      'religion': religion,
      'smoking': smoking,
      'drinking': drinking,
      'foodPreference': foodPreference,
      'profession': profession,
      'interests': interests,
      'languages': languages,
      'startDate': startDate?.toIso8601String(),
      'endDate': endDate?.toIso8601String(),
      'budget': budget,
      'travelIntentions': travelIntentions,
    };

  // ── Safe coercion helpers ──────────────────

  static int? _asInt(dynamic v) {
    if (v == null) return null;
    if (v is int) return v;
    if (v is num) return v.toInt();
    return int.tryParse(v.toString());
  }

  static double? _asDouble(dynamic v) {
    if (v == null) return null;
    if (v is double) return v;
    if (v is num) return v.toDouble();
    return double.tryParse(v.toString());
  }

  static String? _asStringOrNull(dynamic v) {
    if (v == null || v.toString().isEmpty) return null;
    return v.toString();
  }

  static List<String> _asStringList(dynamic v) {
    if (v is! List) return [];
    return v.whereType<String>().toList();
  }

  static DateTime? _asDateTime(dynamic v) {
    if (v == null) return null;
    if (v is DateTime) return v;
    return DateTime.tryParse(v.toString());
  }
}
