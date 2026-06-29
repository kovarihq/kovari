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

    const rawAvatar = data.avatar || data.profile_photo || "";
    const avatarUrl = typeof rawAvatar === "string" ? rawAvatar.trim() : "";
    const hasProfilePicture = Boolean(
      avatarUrl.length > 0 &&
      !["undefined", "null", "[object object]", "none"].includes(avatarUrl.toLowerCase())
    );

    let intents = data.travel_intentions;
    if (typeof intents === "string") {
      try {
        intents = JSON.parse(intents);
      } catch {
        intents = [];
      }
    }

    const validIntents = Array.isArray(intents)
      ? intents.filter((intent) => {
          if (!intent) return false;
          if (typeof intent === "string") return intent.trim().length > 0;
          if (typeof intent === "object") {
            const dest = intent.destination || intent.city || intent.name;
            return typeof dest === "string" && dest.trim().length > 0;
          }
          return false;
        })
      : [];

    const hasTravelIntentions = validIntents.length > 0;

    const isOnboardingCompletedFlag = Boolean(
      data.onboardingCompleted ?? data.onboarding_completed ?? false
    );

    // Session is activated ONLY if profile picture exists AND at least one valid travel intention exists
    const isActivated = hasProfilePicture && hasTravelIntentions;

    return {
      isActivated,
      hasProfilePicture,
      hasTravelIntentions,
      isOnboardingCompletedFlag,
    };
  },
};
