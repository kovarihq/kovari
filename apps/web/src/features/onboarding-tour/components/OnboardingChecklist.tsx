"use client";

import { useRouter } from "next/navigation";
import { Camera, Compass, Users, MessageCircle, Check, ArrowRight, Sparkles } from "lucide-react";
import { cn } from "@kovari/utils";
import type { TourState } from "../hooks/useOnboardingTour";
import { Button } from "@/shared/components/ui/button";

const STEPS = [
  {
    key: "profile_photo" as const,
    icon: Camera,
    title: "Add a profile photo",
    description: "Travelers with photos get 3× more matches",
    cta: "Add photo",
    href: "/profile/edit",
  },
  {
    key: "explored_match" as const,
    icon: Compass,
    title: "Explore travel companions",
    description: "Browse travelers with similar destinations and travel style",
    cta: "Browse travelers",
    href: "/explore",
  },
  {
    key: "joined_group" as const,
    icon: Users,
    title: "Create a travel group",
    description: "Plan a trip together with people you vibe with",
    cta: "Create group",
    href: "/create-group",
  },
  {
    key: "sent_message" as const,
    icon: MessageCircle,
    title: "Send your first message",
    description: "Start a conversation — great trips begin here",
    cta: "Go to chats",
    href: "/chat",
  },
];

interface Props {
  tourState: TourState;
}

export function OnboardingChecklist({ tourState }: Props) {
  const router = useRouter();
  const { loading, completed, steps, allDone } = tourState;

  if (loading || completed) return null;
  if (!steps) return null;

  const doneCount = Object.values(steps).filter(Boolean).length;
  const progress = (doneCount / STEPS.length) * 100;

  // Find the first incomplete step to feature
  const nextStepIndex = STEPS.findIndex((s) => !steps[s.key]);
  const activeStep = nextStepIndex === -1 ? STEPS[STEPS.length - 1] : STEPS[nextStepIndex];
  const ActiveIcon = activeStep.icon;

  return (
    <div className="flex-1 w-full sm:px-6">
      <div className="flex flex-col lg:flex-row gap-4 w-full max-w-7xl">
        {/* Left: Featured Active Step */}
        <div className="flex-1 w-full">
          <div className="relative overflow-hidden rounded-3xl border bg-card p-8 sm:p-12 h-full flex flex-col justify-center min-h-[360px] shadow-sm">

            <div className="relative z-10 flex flex-col items-start">
              {allDone ? (
                <>
                  <h3 className="text-xl font-bold mb-1 text-foreground">You're all set!</h3>
                  <p className="text-lg text-muted-foreground mb-8 max-w-md">
                    You've completed the onboarding checklist. You can now use all features of the app.
                  </p>
                  <Button size="lg" onClick={() => router.push("/explore")} className="rounded-full px-8">
                    Start Exploring
                  </Button>
                </>
              ) : (
                <>
                  <div className="inline-flex items-center gap-2 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-bold uppercase tracking-widest mb-6">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                    </span>
                    Next Up
                  </div>
                  
                  {/* <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary flex items-center justify-center mb-6 border border-primary/10 shadow-inner">
                    <ActiveIcon className="w-7 h-7" />
                  </div>
                   */}
                  <h3 className="text-xl font-bold text-foreground tracking-tight mb-1">
                    {activeStep.title}
                  </h3>
                  <p className="text-lg text-muted-foreground mb-8 max-w-md leading-relaxed">
                    {activeStep.description}
                  </p>
                  
                  <Button 
                    size="lg" 
                    onClick={() => router.push(activeStep.href)}
                    className="rounded-full px-8 font-medium shadow-md hover:shadow-lg transition-all group"
                  >
                    {activeStep.cta}
                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right: Timeline Checklist */}
        <div className="lg:w-[400px] xl:w-[480px] shrink-0">
          <div className="rounded-3xl border bg-card p-6 sm:p-8 h-full">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-md font-semibold text-foreground">Your Progress</h3>
              <span className="text-sm font-medium text-muted-foreground bg-secondary px-3 py-1 rounded-full">
                {progress.toFixed(0)}%
              </span>
            </div>

            {/* Minimal Progress Bar */}
            <div className="h-2 w-full bg-secondary rounded-full overflow-hidden mb-6">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-1000 ease-out",
                  allDone ? "bg-primary" : "bg-primary"
                )}
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="space-y-0 relative">
              {/* Connecting line behind steps */}
              <div className="absolute left-[31px] top-8 bottom-8 w-[2px] bg-border/50" />
              
              {STEPS.map((step, index) => {
                const done = steps[step.key];
                const isCurrent = index === nextStepIndex;
                const Icon = step.icon;

                return (
                  <div 
                    key={step.key} 
                    className={cn(
                      "relative flex items-center gap-5 p-4 rounded-2xl transition-all duration-300",
                      isCurrent && "bg-background shadow-sm border border-border/50",
                      !isCurrent && !done && "opacity-50"
                    )}
                  >
                    {/* Status Circle */}
                    <div className="relative z-10 shrink-0">
                      <div
                        className={cn(
                          "w-7 h-7 rounded-full flex items-center justify-center border transition-all duration-500",
                          done
                            ? "bg-primary border-primary text-primary-foreground"
                            : isCurrent
                            ? "bg-background border-border text-primary"
                            : "bg-background border-muted-foreground/30 text-muted-foreground/50"
                        )}
                      >
                        {done ? <Check className="w-4 h-4" /> : <span className="text-md font-semibold">{index + 1}</span>}
                      </div>
                    </div>

                    <div className="flex flex-col justify-center">
                      <h4
                        className={cn(
                          "text-md font-semibold transition-colors",
                          done ? "text-foreground" : isCurrent ? "text-primary" : "text-muted-foreground"
                        )}
                      >
                        {step.title}
                      </h4>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
