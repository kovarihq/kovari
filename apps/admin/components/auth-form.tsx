"use client";

import Image from "next/image";

import type React from "react";
import { useState } from "react";
import { useSignIn } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import Link from "next/link";

export default function AuthForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [loadingState, setLoadingState] = useState<string | null>(null);
  const [error, setError] = useState("");

  const { isLoaded, signIn, setActive } = useSignIn();
  const router = useRouter();

  const isLoading = loadingState !== null || !isLoaded;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signIn) return;
    setLoadingState("email");
    setError("");

    try {
      const result = await signIn.create({
        identifier: email,
        password,
        strategy: "password",
      });

      if (result?.status === "complete" && setActive) {
        if (typeof window !== 'undefined') {
          sessionStorage.setItem("admin_login_pending", "true");
        }

        await setActive({
          session: result.createdSessionId,
        });
        window.location.href = "/";
      }
    } catch (err: any) {
      setError(err.errors?.[0]?.message || "An error occurred");
    } finally {
      setLoadingState(null);
    }
  };

  const handleSocialAuth = async (
    provider: "oauth_google" | "oauth_facebook" | "oauth_apple"
  ) => {
    if (!isLoaded || !signIn) {
      setError("Sign in service is not ready. Please try again.");
      return;
    }
    setLoadingState(provider);
    setError("");

    try {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem("admin_login_pending", "true");
      }
      
      await signIn.authenticateWithRedirect({
        strategy: provider,
        redirectUrl: "/sso-callback",
        redirectUrlComplete: "/",
      });

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
      {/* Branding Header */}
      <div className="px-5 sm:px-7 pb-6 flex justify-center">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/logo.webp"
            alt="Kovari"
            width={400}
            height={160}
            className="h-5 w-auto object-contain block"
            priority
          />
        </Link>
      </div>

      <div className="w-full px-5 space-y-4 py-6 sm:py-8 sm:px-7 custom-autofill border-1 border-border rounded-2xl bg-card">
        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-sm sm:text-md font-semibold text-foreground font-sans">
            Welcome back
          </h1>
          <p className="text-sm sm:text-md font-medium text-muted-foreground">
            Log in to your admin account
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="p-2.5 text-sm font-medium text-red-600 bg-red-500/10 border border-red-500/20 rounded-xl">
            {error}
          </div>
        )}

        {/* Social Auth Buttons */}
        <div className="space-y-2">
          <Button
            variant="outline"
            className="w-full h-11 text-foreground hover:text-foreground rounded-xl border-border font-semibold"
            onClick={() => handleSocialAuth("oauth_google")}
            disabled={isLoading}
          >
            {loadingState === "oauth_google" ? (
              <Loader2 className="mr-3 h-4 w-4 animate-spin text-current" />
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
            <span className="font-semibold">Continue with Google</span>
          </Button>
        </div>

        {/* Divider */}
        <div className="relative my-2">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-[10px] uppercase tracking-widest font-semibold">
            <span className="px-3 bg-card text-muted-foreground/50">or</span>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label
                htmlFor="email"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 ml-1"
              >
                Email Address
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@kovari.in"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 border-border rounded-xl bg-muted/30 placeholder:text-muted-foreground font-medium"
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-1">
                <Label
                  htmlFor="password"
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70"
                >
                  Password
                </Label>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 border-border rounded-xl bg-muted/30 placeholder:text-muted-foreground font-medium"
                required
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="flex items-center space-x-2 ml-1">
            <Checkbox
              id="remember"
              checked={rememberMe}
              onCheckedChange={(checked) => setRememberMe(checked as boolean)}
              disabled={isLoading}
              className="border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary"
            />
            <Label htmlFor="remember" className="text-xs font-semibold text-muted-foreground">
              Remember this device
            </Label>
          </div>

          <Button
            type="submit"
            className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl mt-2"
            disabled={isLoading}
          >
            {loadingState === "email" ? (
              <>
                <Loader2 className="mr-3 h-4 w-4 animate-spin text-current" />
                Signing in...
              </>
            ) : (
              <>Sign In</>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
