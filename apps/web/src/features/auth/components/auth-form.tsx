"use client";

import type React from "react";
import { useState } from "react";
import { useSignIn, useSignUp, useAuth } from "@clerk/nextjs";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Loader2, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { Spinner } from "@heroui/react";
import Image from "next/image";
import { SITE_URL } from "@/lib/config/site";


interface AuthFormProps {
  mode: "sign-in" | "sign-up";
}

export default function AuthForm({ mode }: AuthFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [loadingState, setLoadingState] = useState<string | null>(null);
  const [error, setError] = useState("");

  const { isLoaded: isSignInLoaded, signIn, setActive } = useSignIn();
  const { isLoaded: isSignUpLoaded, signUp, setActive: setActiveSignUp } = useSignUp();
  const { isSignedIn, signOut, isLoaded: isAuthLoaded } = useAuth();
  const router = useRouter();

  const isSignUp = mode === "sign-up";
  const isClerkLoaded = isSignUp ? (isSignUpLoaded && !!signUp) : (isSignInLoaded && !!signIn);
  const isLoading = loadingState !== null || !isClerkLoaded;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isClerkLoaded) return;
    setLoadingState("email");
    setError("");

    try {
      if (isSignUp) {
        if (!signUp) return;
        // Sign up with email and password
        if (password !== confirmPassword) {
          setError("Passwords don't match");
          return;
        }

        // First, prepare the sign-up
        const result = await signUp.create({
          emailAddress: email,
          password,
        });

        // Handle the sign-up result
        if (result?.status === "complete" && setActiveSignUp) {
          await setActiveSignUp({ session: result.createdSessionId });
          router.push("/onboarding");
        } else if (result?.status === "missing_requirements") {
          // Prepare email verification
          await signUp.prepareEmailAddressVerification();
          router.push("/verify-email");
        } else if (result) {
          console.warn("Unhandled sign-up status:", result.status);
          setError(`Unhandled sign-up status: ${result.status}`);
        } else {
          setError("Sign-up failed to initialize.");
        }
      } else {
        if (!signIn) return;
        // Sign in with email and password
        // If user is already signed in, sign them out first
        if (isSignedIn) {
          await signOut();
          // Wait a moment for sign out to complete
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        const result = await signIn.create({
          identifier: email,
          password,
          strategy: "password",
        });

        if (result?.status === "complete" && setActive) {
          await setActive({
            session: result.createdSessionId,
          });
          router.push("/dashboard");
        } else if (result?.status === "needs_identifier") {
          // Handle MFA or other first factor requirements
          setError("Additional verification required (Identifier)");
        } else if (result?.status === "needs_second_factor") {
          const factors = result.supportedSecondFactors?.map((f: any) => f.strategy).join(", ") || "unknown";
          setError(`Two-factor required by Clerk. Expected strategies: ${factors}`);
        } else if (result?.status === "needs_new_password") {
          setError("Please set a new password");
        } else if (result) {
          console.warn("Unhandled sign-in status:", result.status, result);
          setError(`Unhandled sign-in status: ${result.status}`);
        } else {
          setError("Sign-in failed to initialize. Please wait a moment and try again.");
        }
      }
    } catch (err: any) {
      console.error("Auth error:", err);
      setError(err.errors?.[0]?.message || "An error occurred");
    } finally {
      setLoadingState(null);
    }
  };

  const handleSocialAuth = async (
    provider: "oauth_google" // | "oauth_facebook" | "oauth_apple"
  ) => {
    if (isSignUp && (!isSignUpLoaded || !signUp)) {
      setError("Sign up service is not ready. Please try again.");
      return;
    }
    if (!isSignUp && (!isSignInLoaded || !signIn)) {
      setError("Sign in service is not ready. Please try again.");
      return;
    }

    setLoadingState(provider);
    setError("");

    try {
      if (isSignUp) {
        if (!signUp) return;
        await signUp.authenticateWithRedirect({
          strategy: provider,
          redirectUrl: "/sso-callback",
          redirectUrlComplete: "/onboarding",
        });
      } else {
        if (!signIn) return;
        await signIn.authenticateWithRedirect({
          strategy: provider,
          redirectUrl: "/sso-callback",
          redirectUrlComplete: "/dashboard",
        });
      }

      // Safety timeout to reset loading state if redirection takes too long or fails to navigate
      setTimeout(() => {
        setLoadingState(null);
      }, 5000);
    } catch (err: any) {
      setError(err.errors?.[0]?.message || "An error occurred");
      setLoadingState(null);
    }
  };

  return (
    <div className="w-full mx-auto max-w-md md:max-w-lg lg:max-w-xl flex flex-col">
      {/* Logo container perfectly aligned with the card's padding */}
      <div className="px-5 sm:px-7 pb-6 flex justify-center">
        <Image
          src="/logo.webp"
          alt="Kovari"
          width={400}
          height={160}
          className="h-5 w-auto object-contain block dark:hidden"
          priority
        />
        <Image
          src="/logo_dark.webp"
          alt="Kovari"
          width={400}
          height={160}
          className="h-5 w-auto object-contain hidden dark:block"
          priority
        />
      </div>

      <div className="w-full px-5 space-y-4 py-6 sm:py-8 sm:px-7 custom-autofill border-1 border-border rounded-2xl bg-card shadow-sm">
        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-md sm:text-lg font-semibold text-foreground">
            {isSignUp ? "Join Kovari" : "Welcome back"}
          </h1>
          <p className="text-sm sm:text-md text-muted-foreground">
            {isSignUp
              ? "Create your account to get started"
              : "Log in back to your account"}
          </p>
        </div>

      {/* Error Message */}
      {error && (
        <div className="p-2.5 text-sm text-destructive bg-[#F13260]/15 rounded-md">
          {error}
        </div>
      )}

      {/* Social Auth Buttons */}
      <div className="space-y-1.5">
        <Button
          variant="secondary"
          className="w-full h-10 text-foreground hover:text-foreground"
          onClick={() => handleSocialAuth("oauth_google")}
          disabled={isLoading}
        >
          {loadingState === "oauth_google" ? (
            <Spinner variant="spinner" size="sm" classNames={{spinnerBars:"bg-foreground"}} className="mr-3" />
          ) : (
            <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
          )}
          Continue with Google
        </Button>

{/* 
        <Button
          variant={"outline"}
          className="w-full h-10 text-foreground hover:bg-background"
          onClick={() => handleSocialAuth("oauth_facebook")}
          disabled={isLoading}
        >
          {loadingState === "oauth_facebook" ? (
             <Spinner variant="spinner" size="sm" classNames={{spinnerBars:"bg-foreground"}} className="mr-3" />
          ) : (
            <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24" fill="#1877F2">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
          )}
          Continue with Facebook
        </Button>

        <Button
          variant={"outline"}
          className="w-full h-10 text-foreground hover:bg-background"
          onClick={() => handleSocialAuth("oauth_apple")}
          disabled={isLoading}
        >
          {loadingState === "oauth_apple" ? (
             <Spinner variant="spinner" size="sm" classNames={{spinnerBars:"bg-foreground"}} className="mr-3" />
          ) : (
            <svg
              className="w-5 h-5 mr-3"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
            </svg>
          )}
          Continue with Apple
        </Button> 
        */}
      </div>

      {/* Divider */}
      <div className="relative my-1.5">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-2 bg-card text-muted-foreground">or</span>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-3">
          <div>
            <Label
              htmlFor="email"
              className="text-sm font-medium text-foreground"
            >
              Email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="example@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 h-10 border-border focus:ring-transparent placeholder:text-muted-foreground placeholder:text-sm"
              required
              disabled={isLoading}
            />
          </div>

          <div>
            <Label
              htmlFor="password"
              className="text-sm font-medium text-foreground"
            >
              Password
            </Label>
            <Input
              id="password"
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 h-10 border-border focus:ring-transparent placeholder:text-muted-foreground placeholder:text-sm"
              required
              disabled={isLoading}
            />
          </div>

          {isSignUp && (
            <div>
              <Label
                htmlFor="confirmPassword"
                className="text-sm font-medium text-foreground"
              >
                Confirm Password
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 h-10 border-border focus:ring-transparent placeholder:text-muted-foreground placeholder:text-sm"
                required
                disabled={isLoading}
              />
            </div>
          )}
        </div>

        {!isSignUp && (
          <div className="flex items-center justify-between mt-2 mb-1">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="remember"
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                disabled={isLoading}
                className="border-border"
              />
              <Label htmlFor="remember" className="text-sm text-foreground">
                Remember me
              </Label>
            </div>
            <button
              type="button"
              className="text-sm text-foreground hover:underline font-medium"
              onClick={() => router.push("/forgot-password?from=sign-in")}
              disabled={isLoading}
            >
              Forgot password
            </button>
          </div>
        )}

        <Button
          type="submit"
          className="w-full h-10 bg-primary hover:bg-primary-hover text-primary-foreground font-medium"
          disabled={isLoading}
        >
          {loadingState === "email" ? (
            <>
               <Spinner variant="spinner" size="sm" classNames={{spinnerBars:"bg-primary-foreground"}} className="mr-3" />
              {isSignUp ? "Creating account..." : "Signing in..."}
            </>
          ) : (
            <>{isSignUp ? "Create account" : "Log in"}</>
          )}
        </Button>
        {/* Add CAPTCHA element */}
        <div id="clerk-captcha" className="mb-4" />
      </form>

      {/* Toggle Auth Mode */}
      <div className="text-center text-sm text-muted-foreground pt-2">
        {isSignUp ? "Already have an account? " : "Don't have an account? "}
        <button
          onClick={() => router.push(isSignUp ? "/sign-in" : "/sign-up")}
          className="text-foreground hover:underline font-medium"
          disabled={isLoading}
        >
          {isSignUp ? "Log in" : "Create one for free"}
        </button>
      </div>
    </div>

    {/* Back to home — outside the card, inside outer wrapper */}
    <div className="pt-5 flex justify-center">
      <button
        onClick={() => {
          window.location.href = SITE_URL;
        }}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors duration-200"
        disabled={isLoading}
      >
        <ArrowLeft className="w-3 h-3" />
        Back to kovari.in
      </button>
    </div>
    </div>
  );
}

