import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/features/requests/models/request_model.dart';
import 'package:mobile/features/requests/services/request_service.dart';

final interestsProvider =
    AsyncNotifierProvider<InterestsNotifier, List<InterestModel>>(
      InterestsNotifier.new,
    );

class InterestsNotifier extends AsyncNotifier<List<InterestModel>> {
  @override
  FutureOr<List<InterestModel>> build() async => _fetchInterests();

  Future<List<InterestModel>> _fetchInterests() async {
    final service = ref.read(requestServiceProvider);
    return service.getInterests();
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(_fetchInterests);
  }

  Future<void> silentRefresh() async {
    final nextState = await AsyncValue.guard(_fetchInterests);
    if (nextState.hasValue) {
      state = nextState;
    }
  }

  Future<bool> respond(String interestId, String action) async {
    final service = ref.read(requestServiceProvider);
    final previousState = state.value ?? [];

    final success = await service.respondToInterest(interestId, action);
    if (success) {
      if (action == 'accept') {
        // Wait 3 seconds before removing to match web UX feedback
        Future.delayed(const Duration(seconds: 3), () {
          if (state.hasValue) {
            state = AsyncData(
              state.value!.where((i) => i.id != interestId).toList(),
            );
          }
        });
      } else {
        // Decline/Delete is immediate
        state = AsyncData(
          previousState.where((i) => i.id != interestId).toList(),
        );
      }
    }
    return success;
  }
}

final invitationsProvider =
    AsyncNotifierProvider<InvitationsNotifier, List<InvitationModel>>(
      InvitationsNotifier.new,
    );

class InvitationsNotifier extends AsyncNotifier<List<InvitationModel>> {
  @override
  FutureOr<List<InvitationModel>> build() async => _fetchInvitations();

  Future<List<InvitationModel>> _fetchInvitations() async {
    final service = ref.read(requestServiceProvider);
    return service.getPendingInvitations();
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(_fetchInvitations);
  }

  Future<void> silentRefresh() async {
    final nextState = await AsyncValue.guard(_fetchInvitations);
    if (nextState.hasValue) {
      state = nextState;
    }
  }

  Future<bool> respond(String groupId, String action) async {
    final service = ref.read(requestServiceProvider);
    final previousState = state.value ?? [];

    final success = await service.respondToInvitation(groupId, action);
    if (success) {
      if (action == 'accept') {
        // Wait 3 seconds before removing to match web UX feedback
        Future.delayed(const Duration(seconds: 3), () {
          if (state.hasValue) {
            state = AsyncData(
              state.value!.where((i) => i.id != groupId).toList(),
            );
          }
        });
      } else {
        // Decline/Decline is immediate
        state = AsyncData(previousState.where((i) => i.id != groupId).toList());
      }
    }
    return success;
  }
}
