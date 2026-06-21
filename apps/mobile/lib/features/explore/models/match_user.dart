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

    // Helper to resolve value from either root json or userMap
    dynamic val(String key) => json[key] ?? userMap[key];

    return MatchUser(
      id: (val('userId') ?? val('id') ?? 'unknown').toString(),
      name: (val('name') ?? val('username') ?? 'Traveler').toString(),
      image:
          (val('avatar') ?? val('profilePhoto') ?? val('profile_photo') ?? '')
              .toString(),
      location:
          (val('locationDisplay') ?? val('location') ?? 'Unknown location')
              .toString(),
      destination:
          (val('destination') ?? val('destination_id') ?? 'Unknown destination')
              .toString(),
      age: _asInt(val('age')),
      score: _asDouble(
        val('score') ?? val('compatibility_score') ?? val('compatibility'),
      ),
      bio: _asStringOrNull(val('bio')),
      gender: _asStringOrNull(val('gender')),
      nationality: _asStringOrNull(val('nationality')),
      personality: _asStringOrNull(val('personality')),
      religion: _asStringOrNull(val('religion')),
      smoking: _asStringOrNull(val('smoking')),
      drinking: _asStringOrNull(val('drinking')),
      foodPreference: _asStringOrNull(
        val('foodPreference') ?? val('food_preference'),
      ),
      profession: _asStringOrNull(val('profession') ?? val('job')),
      interests: _asStringList(val('interests')),
      languages: _asStringList(val('languages')),
      startDate: _asDateTime(val('startDate') ?? val('start_date')),
      endDate: _asDateTime(val('endDate') ?? val('end_date')),
      budget: _asDouble(val('budget')),
      travelIntentions: List<dynamic>.from(
        (val('travel_intentions') ?? val('travelIntentions') ?? const [])
            as Iterable<dynamic>,
      ),
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
