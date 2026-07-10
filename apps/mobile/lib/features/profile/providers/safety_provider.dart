import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/auth/session_manager.dart';
import 'package:mobile/features/profile/models/safety_report.dart';
import 'package:mobile/features/profile/services/safety_service.dart';

class SafetyState {
  SafetyState({
    this.reports = const [],
    this.isLoadingReports = false,
    this.reportsError,
    this.searchResults = const [],
    this.isSearchLoading = false,
    this.searchError,
    this.isSubmitting = false,
    this.submissionError,
    this.isSubmissionSuccess = false,
    this.isBlockStatusLoading = false,
    this.isBlocking = false,
    this.blockError,
    this.iBlockedThem,
    this.theyBlockedMe,
    this.hasActiveReport = false,
  });
  final List<SafetyReport> reports;
  final bool isLoadingReports;
  final String? reportsError;
  final List<SafetyTarget> searchResults;
  final bool isSearchLoading;
  final String? searchError;
  final bool isSubmitting;
  final String? submissionError;
  final bool isSubmissionSuccess;
  final bool isBlockStatusLoading;
  final bool isBlocking;
  final String? blockError;
  final bool? iBlockedThem;
  final bool? theyBlockedMe;
  final bool hasActiveReport;

  SafetyState copyWith({
    List<SafetyReport>? reports,
    bool? isLoadingReports,
    String? reportsError,
    List<SafetyTarget>? searchResults,
    bool? isSearchLoading,
    String? searchError,
    bool? isSubmitting,
    String? submissionError,
    bool? isSubmissionSuccess,
    bool? isBlockStatusLoading,
    bool? isBlocking,
    String? blockError,
    bool? iBlockedThem,
    bool? theyBlockedMe,
    bool? hasActiveReport,
  }) => SafetyState(
    reports: reports ?? this.reports,
    isLoadingReports: isLoadingReports ?? this.isLoadingReports,
    reportsError: reportsError ?? this.reportsError,
    searchResults: searchResults ?? this.searchResults,
    isSearchLoading: isSearchLoading ?? this.isSearchLoading,
    searchError: searchError ?? this.searchError,
    isSubmitting: isSubmitting ?? this.isSubmitting,
    submissionError: submissionError ?? this.submissionError,
    isSubmissionSuccess: isSubmissionSuccess ?? this.isSubmissionSuccess,
    isBlockStatusLoading: isBlockStatusLoading ?? this.isBlockStatusLoading,
    isBlocking: isBlocking ?? this.isBlocking,
    blockError: blockError ?? this.blockError,
    iBlockedThem: iBlockedThem ?? this.iBlockedThem,
    theyBlockedMe: theyBlockedMe ?? this.theyBlockedMe,
    hasActiveReport: hasActiveReport ?? this.hasActiveReport,
  );
}

class SafetyNotifier extends Notifier<SafetyState> {
  @override
  SafetyState build() => SafetyState();

  SafetyService get _service => ref.read(safetyServiceProvider);

  Future<void> fetchMyReports() async {
    state = state.copyWith(isLoadingReports: true);
    try {
      final reports = await _service.fetchMyReports();
      state = state.copyWith(reports: reports, isLoadingReports: false);
    } catch (e) {
      state = state.copyWith(
        isLoadingReports: false,
        reportsError: 'Failed to load reports: $e',
      );
    }
  }

  Future<void> searchTargets(String type, String query) async {
    state = state.copyWith(isSearchLoading: true);
    try {
      final targets = await _service.searchTargets(type, query);
      state = state.copyWith(searchResults: targets, isSearchLoading: false);
    } catch (e) {
      state = state.copyWith(
        isSearchLoading: false,
        searchError: 'Search failed: $e',
      );
    }
  }

  Future<void> submitReport({
    required String targetType,
    required String targetId,
    required String reason,
    String? evidenceUrl,
    String? evidencePublicId,
  }) async {
    state = state.copyWith(isSubmitting: true, isSubmissionSuccess: false);
    try {
      await _service.submitReport(
        targetType: targetType,
        targetId: targetId,
        reason: reason,
        evidenceUrl: evidenceUrl,
        evidencePublicId: evidencePublicId,
      );
      state = state.copyWith(isSubmitting: false, isSubmissionSuccess: true);
      // Refresh reports after submission
      await fetchMyReports();
    } on TooManyRequestsException catch (e) {
      // 429: duplicate report or daily limit — surface backend message directly
      state = state.copyWith(isSubmitting: false, submissionError: e.message);
    } catch (e) {
      state = state.copyWith(
        isSubmitting: false,
        submissionError: 'Submission failed: $e',
      );
    }
  }

  void resetSubmissionState() {
    state = state.copyWith(isSubmitting: false, isSubmissionSuccess: false);
  }

  Future<void> checkBlockStatus(String targetId) async {
    state = state.copyWith(isBlockStatusLoading: true);
    try {
      final statusFuture = _service.checkBlockStatus(targetId: targetId);
      final reportFuture = _service.checkReportStatus(
        targetType: 'user',
        targetId: targetId,
      );

      final results = await Future.wait([statusFuture, reportFuture]);
      final status = results[0] as ({bool iBlockedThem, bool theyBlockedMe});
      final hasActiveReport = results[1] as bool;

      state = state.copyWith(
        isBlockStatusLoading: false,
        iBlockedThem: status.iBlockedThem,
        theyBlockedMe: status.theyBlockedMe,
        hasActiveReport: hasActiveReport,
      );
    } catch (e) {
      state = state.copyWith(
        isBlockStatusLoading: false,
        blockError: 'Failed to check block status: $e',
      );
    }
  }

  Future<void> blockUser(String targetId) async {
    state = state.copyWith(isBlocking: true, blockError: null);
    try {
      await _service.blockUser(targetId: targetId);
      state = state.copyWith(isBlocking: false);
      await checkBlockStatus(targetId);
    } catch (e) {
      state = state.copyWith(
        isBlocking: false,
        blockError: 'Failed to block user: $e',
      );
    }
  }

  Future<void> unblockUser(String targetId) async {
    state = state.copyWith(isBlocking: true, blockError: null);
    try {
      await _service.unblockUser(targetId: targetId);
      state = state.copyWith(isBlocking: false);
      await checkBlockStatus(targetId);
    } catch (e) {
      state = state.copyWith(
        isBlocking: false,
        blockError: 'Failed to unblock user: $e',
      );
    }
  }

  void clearBlockError() {
    state = state.copyWith(blockError: null);
  }
}

final safetyProvider = NotifierProvider<SafetyNotifier, SafetyState>(
  SafetyNotifier.new,
);
