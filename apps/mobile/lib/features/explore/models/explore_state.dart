enum TravelMode { solo, group }

class SearchData {

  SearchData({
    required this.destination,
    required this.budget,
    required this.startDate,
    required this.endDate,
    required this.travelMode,
    this.destinationDetails,
  });
  final String destination;
  final double budget;
  final DateTime startDate;
  final DateTime endDate;
  final TravelMode travelMode;
  final Map<String, dynamic>? destinationDetails;

  SearchData copyWith({
    String? destination,
    double? budget,
    DateTime? startDate,
    DateTime? endDate,
    TravelMode? travelMode,
    Map<String, dynamic>? destinationDetails,
  }) => SearchData(
      destination: destination ?? this.destination,
      budget: budget ?? this.budget,
      startDate: startDate ?? this.startDate,
      endDate: endDate ?? this.endDate,
      travelMode: travelMode ?? this.travelMode,
      destinationDetails: destinationDetails ?? this.destinationDetails,
    );
}

class ExploreFilters {

  ExploreFilters({
    required this.ageRange,
    required this.gender,
    required this.interests,
    required this.travelStyle,
    required this.budgetRange,
    required this.personality,
    required this.smoking,
    required this.drinking,
    required this.nationality,
    required this.languages,
  });

  factory ExploreFilters.initial() => ExploreFilters(
      ageRange: [18, 65],
      gender: 'Any',
      interests: [],
      travelStyle: 'Any',
      budgetRange: [5000, 50000],
      personality: 'Any',
      smoking: 'No',
      drinking: 'No',
      nationality: 'Any',
      languages: [],
    );
  final List<int> ageRange;
  final String gender;
  final List<String> interests;
  final String travelStyle;
  final List<double> budgetRange;
  final String personality;
  final String smoking;
  final String drinking;
  final String nationality;
  final List<String> languages;

  ExploreFilters copyWith({
    List<int>? ageRange,
    String? gender,
    List<String>? interests,
    String? travelStyle,
    List<double>? budgetRange,
    String? personality,
    String? smoking,
    String? drinking,
    String? nationality,
    List<String>? languages,
  }) => ExploreFilters(
      ageRange: ageRange ?? this.ageRange,
      gender: gender ?? this.gender,
      interests: interests ?? this.interests,
      travelStyle: travelStyle ?? this.travelStyle,
      budgetRange: budgetRange ?? this.budgetRange,
      personality: personality ?? this.personality,
      smoking: smoking ?? this.smoking,
      drinking: drinking ?? this.drinking,
      nationality: nationality ?? this.nationality,
      languages: languages ?? this.languages,
    );
}

class ExploreState {

  ExploreState({
    required this.searchData,
    required this.filters,
    required List<dynamic> matches,
    required int currentIndex,
    required this.isLoading,
    this.error,
    required this.hasSearched,
    this.lastFetchTime,
    required int page,
    required bool hasMore,
    this.isPending = false,
    this.isFetchingNextPage = false,
    List<dynamic>? soloMatches,
    int? soloCurrentIndex,
    int? soloPage,
    bool? soloHasMore,
    List<dynamic>? groupMatches,
    int? groupCurrentIndex,
    int? groupPage,
    bool? groupHasMore,
  })  : soloMatches = soloMatches ?? (searchData.travelMode == TravelMode.solo ? matches : const []),
        soloCurrentIndex = soloCurrentIndex ?? (searchData.travelMode == TravelMode.solo ? currentIndex : 0),
        soloPage = soloPage ?? (searchData.travelMode == TravelMode.solo ? page : 1),
        soloHasMore = soloHasMore ?? (searchData.travelMode == TravelMode.solo ? hasMore : true),
        groupMatches = groupMatches ?? (searchData.travelMode == TravelMode.group ? matches : const []),
        groupCurrentIndex = groupCurrentIndex ?? (searchData.travelMode == TravelMode.group ? currentIndex : 0),
        groupPage = groupPage ?? (searchData.travelMode == TravelMode.group ? page : 1),
        groupHasMore = groupHasMore ?? (searchData.travelMode == TravelMode.group ? hasMore : true);

  factory ExploreState.initial() => ExploreState(
      searchData: SearchData(
        destination: '',
        budget: 20000,
        startDate: DateTime.now(),
        endDate: DateTime.now().add(const Duration(days: 4)),
        travelMode: TravelMode.solo,
      ),
      filters: ExploreFilters.initial(),
      matches: [],
      currentIndex: 0,
      isLoading: false,
      hasSearched: false,
      page: 1,
      hasMore: true,
    );
  final SearchData searchData;
  final ExploreFilters filters;
  
  final List<dynamic> soloMatches;
  final int soloCurrentIndex;
  final int soloPage;
  final bool soloHasMore;

  final List<dynamic> groupMatches;
  final int groupCurrentIndex;
  final int groupPage;
  final bool groupHasMore;

  final bool isLoading;
  final String? error;
  final bool hasSearched;
  final DateTime? lastFetchTime;
  final bool isPending;
  final bool isFetchingNextPage;

  List<dynamic> get matches => searchData.travelMode == TravelMode.solo ? soloMatches : groupMatches;
  int get currentIndex => searchData.travelMode == TravelMode.solo ? soloCurrentIndex : groupCurrentIndex;
  int get page => searchData.travelMode == TravelMode.solo ? soloPage : groupPage;
  bool get hasMore => searchData.travelMode == TravelMode.solo ? soloHasMore : groupHasMore;

  ExploreState copyWith({
    SearchData? searchData,
    ExploreFilters? filters,
    List<dynamic>? matches,
    int? currentIndex,
    bool? isLoading,
    String? error,
    bool? hasSearched,
    DateTime? lastFetchTime,
    int? page,
    bool? hasMore,
    bool? isPending,
    bool? isFetchingNextPage,
    List<dynamic>? soloMatches,
    int? soloCurrentIndex,
    int? soloPage,
    bool? soloHasMore,
    List<dynamic>? groupMatches,
    int? groupCurrentIndex,
    int? groupPage,
    bool? groupHasMore,
  }) {
    final newSearchData = searchData ?? this.searchData;
    final mode = newSearchData.travelMode;

    return ExploreState(
      searchData: newSearchData,
      filters: filters ?? this.filters,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      hasSearched: hasSearched ?? this.hasSearched,
      lastFetchTime: lastFetchTime ?? this.lastFetchTime,
      isPending: isPending ?? this.isPending,
      isFetchingNextPage: isFetchingNextPage ?? this.isFetchingNextPage,
      
      matches: matches ?? this.matches,
      currentIndex: currentIndex ?? this.currentIndex,
      page: page ?? this.page,
      hasMore: hasMore ?? this.hasMore,

      soloMatches: soloMatches ?? (mode == TravelMode.solo && matches != null ? matches : this.soloMatches),
      soloCurrentIndex: soloCurrentIndex ?? (mode == TravelMode.solo && currentIndex != null ? currentIndex : this.soloCurrentIndex),
      soloPage: soloPage ?? (mode == TravelMode.solo && page != null ? page : this.soloPage),
      soloHasMore: soloHasMore ?? (mode == TravelMode.solo && hasMore != null ? hasMore : this.soloHasMore),

      groupMatches: groupMatches ?? (mode == TravelMode.group && matches != null ? matches : this.groupMatches),
      groupCurrentIndex: groupCurrentIndex ?? (mode == TravelMode.group && currentIndex != null ? currentIndex : this.groupCurrentIndex),
      groupPage: groupPage ?? (mode == TravelMode.group && page != null ? page : this.groupPage),
      groupHasMore: groupHasMore ?? (mode == TravelMode.group && hasMore != null ? hasMore : this.groupHasMore),
    );
  }
}
