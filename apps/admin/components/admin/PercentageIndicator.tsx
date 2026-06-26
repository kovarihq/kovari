"use client";

import * as React from "react";
import { cn } from "@kovari/utils";

import { HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";

export interface PercentageIndicatorProps {
  value: number; // 0 to 100
  label?: React.ReactNode;
  showValue?: boolean;
  variant?: "default" | "success" | "warning" | "destructive" | "indigo";
  size?: "sm" | "md" | "lg";
  className?: string;
  animate?: boolean;
  tooltipText?: string;
}

export function PercentageIndicator({
  value,
  label,
  showValue = true,
  variant = "default",
  size = "md",
  className,
  animate = true,
  tooltipText,
}: PercentageIndicatorProps) {
  const normalizedValue = Math.min(Math.max(value, 0), 100);
  const [percent, setPercent] = React.useState(animate ? 0 : normalizedValue);

  React.useEffect(() => {
    if (animate) {
      const timer = setTimeout(() => setPercent(normalizedValue), 100);
      return () => clearTimeout(timer);
    } else {
      setPercent(normalizedValue);
    }
  }, [normalizedValue, animate]);

  const barColors = {
    default: "bg-primary",
    success: "bg-green-500",
    warning: "bg-amber-500",
    destructive: "bg-destructive",
    indigo: "bg-indigo-500",
  };

  const textColors = {
    default: "text-primary",
    success: "text-green-600",
    warning: "text-amber-600",
    destructive: "text-destructive",
    indigo: "text-indigo-600",
  };

  const heightStyles = {
    sm: "h-1.5",
    md: "h-2.5",
    lg: "h-4",
  };

  return (
    <div
      className={cn("w-full space-y-2", className)}
      role="progressbar"
      aria-valuenow={normalizedValue}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {(label || showValue) && (
        <div className="flex justify-between items-baseline text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label ? (
            <div className="flex items-center gap-1.5">
              <span>{label}</span>
              {tooltipText && (
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button className="text-muted-foreground/50 hover:text-muted-foreground cursor-pointer focus:outline-none">
                        <HelpCircle className="h-3 w-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[200px]" side="top" align="start">
                      {tooltipText}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          ) : (
            <span />
          )}
          {showValue && (
            <span className={cn("font-mono font-bold leading-none tabular-nums", textColors[variant])}>
              {normalizedValue}%
            </span>
          )}
        </div>
      )}
      <div className={cn("w-full bg-secondary rounded-full overflow-hidden", heightStyles[size])}>
        <div
          className={cn(
            "h-full rounded-full transition-all duration-700 ease-out",
            barColors[variant]
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
