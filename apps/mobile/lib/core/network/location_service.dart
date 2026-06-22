import 'package:dio/dio.dart';
import 'package:mobile/core/config/env.dart';

class GeoapifyResult {
  GeoapifyResult({
    required this.placeId,
    required this.formatted,
    required this.city,
    required this.state,
    required this.country,
    required this.lat,
    required this.lon,
    required this.name,
    required this.addressLine1,
  });

  factory GeoapifyResult.fromJson(Map<String, dynamic> json) {
    final properties = json['properties'] as Map<String, dynamic>;
    return GeoapifyResult(
      placeId: (properties['place_id'] ?? '') as String,
      formatted: (properties['formatted'] ?? '') as String,
      city: (properties['city'] ??
          properties['town'] ??
          properties['village'] ??
          properties['hamlet'] ??
          properties['suburb'] ??
          properties['county'] ??
          properties['state_district'] ??
          properties['name'] ??
          '') as String,
      state: (properties['state'] ?? properties['county'] ?? '') as String,
      country: (properties['country'] ?? '') as String,
      lat: (properties['lat'] as num?)?.toDouble() ?? 0.0,
      lon: (properties['lon'] as num?)?.toDouble() ?? 0.0,
      name: (properties['name'] ?? '') as String,
      addressLine1: (properties['address_line1'] ?? '') as String,
    );
  }

  final String placeId;
  final String formatted;
  final String city;
  final String state;
  final String country;
  final double lat;
  final double lon;
  final String name;
  final String addressLine1;
}

class CuratedDestination {
  final String name;
  final String state;
  final String? country;
  final double lat;
  final double lon;

  CuratedDestination({
    required this.name,
    required this.state,
    this.country,
    required this.lat,
    required this.lon,
  });
}

final List<CuratedDestination> _curatedDestinations = [
  CuratedDestination(name: "Hampta Pass", state: "Himachal Pradesh", lat: 32.2667, lon: 77.3167),
  CuratedDestination(name: "Rohtang Pass", state: "Himachal Pradesh", lat: 32.3714, lon: 77.2500),
  CuratedDestination(name: "Baralacha La", state: "Himachal Pradesh", lat: 32.7333, lon: 77.4333),
  CuratedDestination(name: "Kunzum Pass", state: "Himachal Pradesh", lat: 32.4500, lon: 77.7667),
  CuratedDestination(name: "Chang La", state: "Ladakh", lat: 34.0500, lon: 77.6000),
  CuratedDestination(name: "Khardung La", state: "Ladakh", lat: 34.2783, lon: 77.6033),
  CuratedDestination(name: "Kedarkantha Trek", state: "Uttarakhand", lat: 31.0314, lon: 78.2292),
  CuratedDestination(name: "Roopkund Trek", state: "Uttarakhand", lat: 30.2438, lon: 79.7258),
  CuratedDestination(name: "Valley of Flowers", state: "Uttarakhand", lat: 30.7280, lon: 79.6059),
  CuratedDestination(name: "Har Ki Dun", state: "Uttarakhand", lat: 31.1714, lon: 78.4175),
  CuratedDestination(name: "Brahmatal Trek", state: "Uttarakhand", lat: 30.1500, lon: 79.5000),
  CuratedDestination(name: "Kuari Pass", state: "Uttarakhand", lat: 30.5167, lon: 79.6167),
  CuratedDestination(name: "Sandakphu Trek", state: "West Bengal", lat: 27.1054, lon: 88.0054),
  CuratedDestination(name: "Goechala Trek", state: "Sikkim", lat: 27.5833, lon: 88.1167),
  CuratedDestination(name: "Tarsar Marsar", state: "Kashmir", lat: 34.0667, lon: 75.2833),
  CuratedDestination(name: "Great Lakes Kashmir", state: "Kashmir", lat: 34.2000, lon: 75.4000),
  CuratedDestination(name: "Kheerganga Trek", state: "Himachal Pradesh", lat: 32.0702, lon: 77.3572),
  CuratedDestination(name: "Triund Trek", state: "Himachal Pradesh", lat: 32.2833, lon: 76.3667),
  CuratedDestination(name: "Buran Ghati", state: "Himachal Pradesh", lat: 31.4667, lon: 77.7500),
  CuratedDestination(name: "Pin Parvati Pass", state: "Himachal Pradesh", lat: 31.9833, lon: 77.8000),
  CuratedDestination(name: "Spiti Valley", state: "Himachal Pradesh", lat: 32.2461, lon: 78.0338),
  CuratedDestination(name: "Dzukou Valley", state: "Nagaland", lat: 25.5220, lon: 94.0920),
  CuratedDestination(name: "Tirthan Valley", state: "Himachal Pradesh", lat: 31.6341, lon: 77.3487),
  CuratedDestination(name: "Sangla Valley", state: "Himachal Pradesh", lat: 31.4175, lon: 78.2382),
  CuratedDestination(name: "Parvati Valley", state: "Himachal Pradesh", lat: 31.9000, lon: 77.2000),
  CuratedDestination(name: "Bali", state: "Bali", country: "Indonesia", lat: -8.3405, lon: 115.092),
  CuratedDestination(name: "Maldives", state: "Maldives", country: "Maldives", lat: 3.2028, lon: 73.2207),
  CuratedDestination(name: "Phuket", state: "Phuket", country: "Thailand", lat: 7.8804, lon: 98.3923),
  CuratedDestination(name: "Bangkok", state: "Bangkok", country: "Thailand", lat: 13.7563, lon: 100.5018),
  CuratedDestination(name: "Singapore", state: "Singapore", country: "Singapore", lat: 1.3521, lon: 103.8198),
  CuratedDestination(name: "Dubai", state: "Dubai", country: "United Arab Emirates", lat: 25.2048, lon: 55.2708),
  CuratedDestination(name: "Landour", state: "Uttarakhand", lat: 30.4586, lon: 78.0936),
  CuratedDestination(name: "Landour Cantonment", state: "Uttarakhand", lat: 30.4586, lon: 78.0936),
];

GeoapifyResult _destinationToResult(CuratedDestination dest) {
  final nameLower = dest.name.toLowerCase().replaceAll(RegExp(r'\s+'), '_');
  return GeoapifyResult(
    placeId: 'local_$nameLower',
    formatted: '${dest.name}, ${dest.state}, ${dest.country ?? "India"}',
    name: dest.name,
    city: dest.name,
    state: dest.state,
    country: dest.country ?? "India",
    lat: dest.lat,
    lon: dest.lon,
    addressLine1: dest.name,
  );
}

List<GeoapifyResult> _searchLocalDestinations(String query) {
  final q = query.toLowerCase().trim();
  return _curatedDestinations
      .where((d) =>
          d.name.toLowerCase().contains(q) ||
          d.state.toLowerCase().contains(q) ||
          (d.country != null && d.country!.toLowerCase().contains(q)))
      .take(3)
      .map(_destinationToResult)
      .toList();
}

// Global/static cache to keep autocomplete instances persistent
final Map<String, List<GeoapifyResult>> _queryCache = {};

class LocationService {
  final Dio _dio = Dio();

  Future<List<GeoapifyResult>> searchLocation(String query) async {
    final normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery.length < 3) return [];

    if (_queryCache.containsKey(normalizedQuery)) {
      return _queryCache[normalizedQuery]!;
    }

    final localResults = _searchLocalDestinations(query);

    try {
      final response = await _dio.get(
        'https://api.geoapify.com/v1/geocode/autocomplete',
        queryParameters: {
          'text': query,
          'apiKey': Env.geoapifyKey,
          'limit': 5,
        },
      );

      final features = response.data['features'] as List;
      final apiResults = features
          .map((f) => GeoapifyResult.fromJson(f as Map<String, dynamic>))
          .toList();

      // Deduplicate: avoid including API results that match local results by city name
      final localNames = localResults.map((r) => r.city.toLowerCase()).toSet();
      final dedupedApi = apiResults
          .where((r) => !localNames.contains(r.city.toLowerCase()))
          .toList();

      // Sort: India first, then international (consistent with matchTransformer/geocoding-client.ts)
      dedupedApi.sort((a, b) {
        if (a.country == "India" && b.country != "India") return -1;
        if (a.country != "India" && b.country == "India") return 1;
        return 0;
      });

      final finalResults = [...localResults, ...dedupedApi].take(7).toList();
      _queryCache[normalizedQuery] = finalResults;
      return finalResults;
    } catch (e) {
      return localResults;
    }
  }

  Future<GeoapifyResult?> getLocationDetails(String placeId) async {
    try {
      final response = await _dio.get(
        'https://api.geoapify.com/v1/geocode/search',
        queryParameters: {
          'id': placeId,
          'apiKey': Env.geoapifyKey,
        },
      );

      final features = response.data['features'] as List;
      if (features.isEmpty) return null;
      return GeoapifyResult.fromJson(features.first as Map<String, dynamic>);
    } catch (e) {
      return null;
    }
  }
}
