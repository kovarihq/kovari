"use client";

import * as React from "react";
import { cn } from "@kovari/utils";
import { HelpCircle } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";

export interface AnalyticsSubStat {
  key: string;
  label: string;
  value: string | number;
  trend?: {
    value: number;
    isPositive: boolean;
  };
}

export interface AnalyticsMetricCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  description?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  loading?: boolean;
  tooltipText?: string;
  subStats?: AnalyticsSubStat[];
  className?: string;
}

export function AnalyticsMetricCard({
  title,
  value,
  icon,
  description,
  trend,
  loading = false,
  tooltipText,
  subStats,
  className,
}: AnalyticsMetricCardProps) {
  if (loading) {
    return (
      <Card className={cn("overflow-hidden w-full", className)}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-4 rounded-full" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-3.5 w-32" />
          {subStats && subStats.length > 0 && (
            <div className="pt-3 border-t border-border space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("overflow-hidden w-full transition-all duration-200 hover:shadow-sm", className)}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-1.5">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </CardTitle>
          {tooltipText && (
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button 
                    type="button"
                    aria-label={`Info about ${title}`}
                    className="text-muted-foreground/50 hover:text-muted-foreground cursor-pointer rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none focus:outline-none transition-shadow"
                  >
                    <HelpCircle className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-[200px]" side="top" align="center">
                  {tooltipText}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        {icon}
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="text-2xl font-bold font-mono tracking-tight leading-tight text-foreground">
          {value}
        </div>
        {(description || trend) && (
          <p className="text-xs text-muted-foreground leading-normal flex items-center gap-1 flex-wrap">
            {trend && (
              <span
                className={cn(
                  "font-bold font-mono",
                  trend.isPositive ? "text-emerald-500" : "text-rose-500"
                )}
              >
                {trend.isPositive ? "+" : "-"}{Math.abs(trend.value)}%
              </span>
            )}
            {description && <span>{description}</span>}
          </p>
        )}

        {/* Sub-statistics section if supplied */}
        {subStats && subStats.length > 0 && (
          <div className="pt-3 mt-3 border-t border-border/60 space-y-1.5">
            {subStats.map((sub) => (
              <div key={sub.key} className="flex justify-between items-center text-[11px]">
                <span className="text-muted-foreground font-medium">{sub.label}</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-foreground font-mono">{sub.value}</span>
                  {sub.trend && (
                    <span
                      className={cn(
                        "font-bold font-mono text-[9px]",
                        sub.trend.isPositive ? "text-emerald-500" : "text-rose-500"
                      )}
                    >
                      {sub.trend.isPositive ? "↑" : "↓"}{Math.abs(sub.trend.value)}%
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
