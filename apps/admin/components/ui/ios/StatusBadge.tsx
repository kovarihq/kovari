"use client";

import React from "react";
import { cn } from "@kovari/utils";

interface StatusBadgeProps {
  status: string;
  className?: string;
  showDot?: boolean;
}

export function StatusBadge({ status, className, showDot = true }: StatusBadgeProps) {
  const normalizedStatus = status.toLowerCase();
  const isWarning = normalizedStatus.includes("flags") || normalizedStatus.includes("reported");
  
  // Status configuration mapping status to dot and text colors
  const config: Record<string, { dot: string; text: string }> = {
    pending: { dot: "bg-amber-500", text: "text-amber-600" },
    resolved: { dot: "bg-green-500", text: "text-green-600" },
    actioned: { dot: "bg-green-500", text: "text-green-600" },
    dismissed: { dot: "bg-muted-foreground/50", text: "text-muted-foreground" },
    active: { dot: "bg-green-500", text: "text-green-600" },
    invited: { dot: "bg-indigo-500", text: "text-indigo-600" },
    activated: { dot: "bg-green-500", text: "text-green-600" },
    expired: { dot: "bg-muted-foreground/50", text: "text-muted-foreground" },
    suspended: { dot: "bg-red-500", text: "text-red-500" },
    banned: { dot: "bg-red-500", text: "text-red-500" },
    deleted: { dot: "bg-muted-foreground/50", text: "text-muted-foreground" },
    removed: { dot: "bg-red-500", text: "text-red-500" },
  };

  let { dot, text } = config[normalizedStatus] || {
    dot: "bg-muted-foreground/50",
    text: "text-muted-foreground",
  };

  // Special handling for warnings/metrics
  if (isWarning) {
    dot = "bg-orange-500";
    text = "text-orange-600";
  }

  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      {showDot && <div className={cn("h-1.5 w-1.5 rounded-full shrink-0", dot)} />}
      <span className={cn("text-sm font-medium capitalize truncate", text)}>
        {status}
      </span>
    </div>
  );
}

