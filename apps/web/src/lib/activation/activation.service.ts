export interface ActivationCheckInput {
  onboarding_completed?: boolean | null;
  onboardingCompleted?: boolean | null;
  avatar?: string | null;
  profile_photo?: string | null;
  travel_intentions?: any[] | null;
}

export interface ActivationResult {
  isActivated: boolean;
  hasProfilePicture: boolean;
  hasTravelIntentions: boolean;
  isOnboardingCompletedFlag: boolean;
}

/**
 * 🔒 Centralized Activation Service
 * The single source of truth for verifying session activation.
 * Checks that every authenticated session has a profile picture and at least 1 travel intention.
 */
export const activationService = {
  /**
   * Evaluates activation criteria for a user profile
   */
  verifyActivation(data: ActivationCheckInput | null | undefined): ActivationResult {
    if (!data) {
      return {
        isActivated: false,
        hasProfilePicture: false,
        hasTravelIntentions: false,
        isOnboardingCompletedFlag: false,
      };
    }

    const avatarUrl = data.avatar || data.profile_photo || "";
    const hasProfilePicture = Boolean(typeof avatarUrl === "string" && avatarUrl.trim().length > 0);

    let intents = data.travel_intentions;
    if (typeof intents === "string") {
      try {
        intents = JSON.parse(intents);
      } catch {
        intents = [];
      }
    }
    const hasTravelIntentions = Boolean(Array.isArray(intents) && intents.length > 0);

    const isOnboardingCompletedFlag = Boolean(
      data.onboardingCompleted ?? data.onboarding_completed ?? false
    );

    // Session is activated ONLY if profile picture exists AND at least one travel intention exists
    const isActivated = hasProfilePicture && hasTravelIntentions;

    return {
      isActivated,
      hasProfilePicture,
      hasTravelIntentions,
      isOnboardingCompletedFlag,
    };
  },
};
