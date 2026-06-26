"use client";

import * as React from "react";
import { cn } from "@kovari/utils";

export interface MetricGridProps {
  children: React.ReactNode;
  cols?: 2 | 3 | 4 | 5;
  className?: string;
  gap?: "sm" | "md" | "lg";
}

export function MetricGrid({
  children,
  cols = 4,
  className,
  gap = "md",
}: MetricGridProps) {
  const colStyles = {
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3",
    4: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4",
    5: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
  };

  const gapStyles = {
    sm: "gap-3",
    md: "gap-4",
    lg: "gap-6",
  };

  return (
    <div
      className={cn(
        "grid w-full",
        colStyles[cols],
        gapStyles[gap],
        className
      )}
    >
      {children}
    </div>
  );
}
