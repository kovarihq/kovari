class DestinationDetails {
  DestinationDetails({
    this.city,
    this.country,
    this.lat,
    this.lon,
  });

  factory DestinationDetails.fromJson(Map<String, dynamic> json) => DestinationDetails(
        city: json['city'] as String?,
        country: json['country'] as String?,
        lat: json['lat'] is num ? (json['lat'] as num).toDouble() : null,
        lon: json['lon'] is num ? (json['lon'] as num).toDouble() : null,
      );
  final String? city;
  final String? country;
  final double? lat;
  final double? lon;

  Map<String, dynamic> toJson() => {
        'city': city,
        'country': country,
        'lat': lat,
        'lon': lon,
      };
}

class TravelIntention {
  TravelIntention({
    required this.destination,
    this.destinationDetails,
  });

  factory TravelIntention.fromJson(Map<String, dynamic> json) => TravelIntention(
        destination: (json['destination'] as String?) ?? '',
        destinationDetails: json['destination_details'] != null
            ? DestinationDetails.fromJson(
                Map<String, dynamic>.from(json['destination_details'] as Map))
            : null,
      );
  final String destination;
  final DestinationDetails? destinationDetails;

  Map<String, dynamic> toJson() => {
        'destination': destination,
        'destination_details': destinationDetails?.toJson(),
      };
}

class UserProfile {

  UserProfile({
    required this.name,
    required this.username,
    required this.age,
    required this.gender,
    required this.nationality,
    required this.profession,
    required this.interests,
    required this.languages,
    required this.bio,
    required this.followers,
    required this.following,
    required this.coverImage,
    required this.profileImage,
    required this.posts,
    this.isFollowing = false,
    this.isFollowingMe = false,
    this.isOwnProfile = false,
    required this.location,
    required this.religion,
    required this.smoking,
    required this.drinking,
    required this.personality,
    required this.foodPreference,
    this.birthday,
    required this.userId,
    required this.email,
    this.isVerified = false,
    this.createdAt = '',
    required this.travelIntentions,
    this.onboardingCompleted = false,
    this.isInternal = false,
  });

  factory UserProfile.fromJson(Map<String, dynamic> json) {
    var rawIntentions = json['travel_intentions'] as List? ?? [];
    List<TravelIntention> intentionsList = rawIntentions
        .map((x) => TravelIntention.fromJson(Map<String, dynamic>.from(x as Map)))
        .toList();

    return UserProfile(
      name: (json['name'] as String?) ?? '',
      username: (json['username'] as String?) ?? '',
      age: json['age']?.toString() ?? '',
      gender: (json['gender'] as String?) ?? '',
      nationality: (json['nationality'] as String?) ?? '',
      profession: (json['profession'] as String?) ?? (json['job'] as String?) ?? '',
      interests: List<String>.from(json['interests'] as List? ?? []),
      languages: List<String>.from(json['languages'] as List? ?? []),
      bio: (json['bio'] as String?) ?? '',
      followers: json['followers']?.toString() ?? '0',
      following: json['following']?.toString() ?? '0',
      coverImage: (json['cover_image'] as String?) ?? '',
      profileImage: (json['profileImage'] as String?) ??
          (json['avatar'] as String?) ??
          (json['profile_photo'] as String?) ??
          (json['profile_image'] as String?) ??
          '',
      posts: (json['posts'] as List? ?? [])
          .map((p) => UserPost.fromJson(p as Map<String, dynamic>))
          .toList(),
      isFollowing: (json['isFollowing'] as bool?) ?? false,
      isFollowingMe: (json['isFollowingMe'] as bool?) ?? false,
      isOwnProfile: (json['isOwnProfile'] as bool?) ?? false,
      location: (json['location'] as String?) ?? '',
      religion: (json['religion'] as String?) ?? '',
      smoking: (json['smoking'] as String?) ?? '',
      drinking: (json['drinking'] as String?) ?? '',
      personality: (json['personality'] as String?) ?? '',
      foodPreference:
          (json['foodPreference'] as String?) ?? (json['food_preference'] as String?) ?? '',
      birthday: json['birthday'] as String?,
      userId: (json['userId'] as String?) ??
          (json['id'] as String?) ??
          (json['user_id'] as String?) ??
          '',
      email: (json['email'] as String?) ?? '',
      isVerified: (json['verified'] as bool?) ?? (json['is_verified'] as bool?) ?? false,
      createdAt: (json['created_at'] as String?) ?? '',
      travelIntentions: intentionsList,
      onboardingCompleted: (json['onboardingCompleted'] as bool?) ?? false,
      isInternal: (json['is_internal'] as bool?) ?? (json['isInternal'] as bool?) ?? false,
    );
  }
  final String name;
  final String username;
  final String age;
  final String gender;
  final String nationality;
  final String profession;
  final List<String> interests;
  final List<String> languages;
  final String bio;
  final String followers;
  final String following;
  final String coverImage;
  final String profileImage;
  final List<UserPost> posts;
  final bool isFollowing;
  final bool isFollowingMe;
  final bool isOwnProfile;
  final String location;
  final String religion;
  final String smoking;
  final String drinking;
  final String personality;
  final String foodPreference;
  final String? birthday;
  final String userId;
  final String email;
  final bool isVerified;
  final String createdAt;
  final List<TravelIntention> travelIntentions;
  final bool onboardingCompleted;
  final bool isInternal;

  Map<String, dynamic> toJson() => {
      'name': name,
      'username': username,
      'age': age,
      'gender': gender,
      'nationality': nationality,
      'profession': profession,
      'interests': interests,
      'languages': languages,
      'bio': bio,
      'followers': followers,
      'following': following,
      'cover_image': coverImage,
      'avatar': profileImage,
      'isFollowing': isFollowing,
      'isFollowingMe': isFollowingMe,
      'isOwnProfile': isOwnProfile,
      'location': location,
      'religion': religion,
      'smoking': smoking,
      'drinking': drinking,
      'personality': personality,
      'foodPreference': foodPreference,
      'birthday': birthday,
      'user_id': userId,
      'email': email,
      'travel_intentions': travelIntentions.map((x) => x.toJson()).toList(),
      'onboardingCompleted': onboardingCompleted,
      'isInternal': isInternal,
    };

  UserProfile copyWith({
    String? name,
    String? username,
    String? age,
    String? gender,
    String? nationality,
    String? profession,
    List<String>? interests,
    List<String>? languages,
    String? bio,
    String? followers,
    String? following,
    String? coverImage,
    String? profileImage,
    List<UserPost>? posts,
    bool? isFollowing,
    bool? isFollowingMe,
    bool? isOwnProfile,
    String? location,
    String? religion,
    String? smoking,
    String? drinking,
    String? personality,
    String? foodPreference,
    String? birthday,
    String? userId,
    String? email,
    bool? isVerified,
    String? createdAt,
    List<TravelIntention>? travelIntentions,
    bool? onboardingCompleted,
    bool? isInternal,
  }) => UserProfile(
      name: name ?? this.name,
      username: username ?? this.username,
      age: age ?? this.age,
      gender: gender ?? this.gender,
      nationality: nationality ?? this.nationality,
      profession: profession ?? this.profession,
      interests: interests ?? this.interests,
      languages: languages ?? this.languages,
      bio: bio ?? this.bio,
      followers: followers ?? this.followers,
      following: following ?? this.following,
      coverImage: coverImage ?? this.coverImage,
      profileImage: profileImage ?? this.profileImage,
      posts: posts ?? this.posts,
      isFollowing: isFollowing ?? this.isFollowing,
      isFollowingMe: isFollowingMe ?? this.isFollowingMe,
      isOwnProfile: isOwnProfile ?? this.isOwnProfile,
      location: location ?? this.location,
      religion: religion ?? this.religion,
      smoking: smoking ?? this.smoking,
      drinking: drinking ?? this.drinking,
      personality: personality ?? this.personality,
      foodPreference: foodPreference ?? this.foodPreference,
      birthday: birthday ?? this.birthday,
      userId: userId ?? this.userId,
      email: email ?? this.email,
      isVerified: isVerified ?? this.isVerified,
      createdAt: createdAt ?? this.createdAt,
      travelIntentions: travelIntentions ?? this.travelIntentions,
      onboardingCompleted: onboardingCompleted ?? this.onboardingCompleted,
      isInternal: isInternal ?? this.isInternal,
    );
}

class UserPost {

  UserPost({required this.id, required this.imageUrl});

  factory UserPost.fromJson(Map<String, dynamic> json) => UserPost(
      id: json['id']?.toString() ?? '',
      imageUrl: (json['image_url'] as String?) ?? '',
    );
  final String id;
  final String imageUrl;
}
