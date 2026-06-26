"use client";

import * as React from "react";
import { cn } from "@kovari/utils";
import { SectionHeader } from "@/components/ui/ios/SectionHeader";

export interface AnalyticsSectionProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  spacing?: "sm" | "md" | "lg";
}

export function AnalyticsSection({
  title,
  description,
  action,
  children,
  className,
  spacing = "md",
}: AnalyticsSectionProps) {
  const marginStyles = {
    sm: "space-y-2",
    md: "space-y-3",
    lg: "space-y-4",
  };

  return (
    <section className={cn("w-full", marginStyles[spacing], className)}>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3 px-1 mb-1">
        <div className="space-y-0.5">
          <SectionHeader className="pb-0 px-0">{title}</SectionHeader>
          {description && (
            <p className="text-xs text-muted-foreground leading-normal">
              {description}
            </p>
          )}
        </div>
        {action && (
          <div className="flex items-center self-stretch sm:self-auto shrink-0 mt-1 sm:mt-0">
            {action}
          </div>
        )}
      </div>
      <div className="w-full">
        {children}
      </div>
    </section>
  );
}
