"use client";

import * as React from "react";
import { cn } from "@kovari/utils";
import { LucideIcon } from "lucide-react";
import { GroupContainer } from "@/components/ui/ios/GroupContainer";
import { ListRow } from "@/components/ui/ios/ListRow";

export interface StatItem {
  key: string;
  label: React.ReactNode;
  value: React.ReactNode;
  icon?: React.ReactNode;
  secondary?: React.ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  destructive?: boolean;
  onClick?: () => void;
}

export interface AnalyticsStatGroupProps {
  items: StatItem[];
  layout?: "grid" | "list";
  className?: string;
}

export function AnalyticsStatGroup({
  items,
  layout = "list",
  className,
}: AnalyticsStatGroupProps) {
  if (layout === "grid") {
    return (
      <div className={cn("grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 w-full", className)}>
        {items.map((item) => {
          return (
            <div
              key={item.key}
              onClick={item.onClick}
              className={cn(
                "rounded-xl border bg-card p-4 space-y-2 transition-all duration-150 select-none",
                item.onClick && "cursor-pointer hover:bg-secondary active:scale-[0.99]"
              )}
            >
              <div className="flex justify-between items-start">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate max-w-full">
                  {item.label}
                </span>
                {item.icon}
              </div>
              <div className="flex items-baseline justify-between gap-1 flex-wrap">
                <span className={cn(
                  "text-lg font-bold tracking-tight text-foreground font-mono leading-none",
                  item.destructive && "text-red-500"
                )}>
                  {item.value}
                </span>
                {item.trend && (
                  <span
                    className={cn(
                      "text-[10px] font-bold font-mono tracking-tight",
                      item.trend.isPositive ? "text-emerald-500" : "text-rose-500"
                    )}
                  >
                    {item.trend.isPositive ? "+" : "-"}{Math.abs(item.trend.value)}%
                  </span>
                )}
              </div>
              {item.secondary && (
                <p className="text-[11px] text-muted-foreground truncate leading-normal">
                  {item.secondary}
                </p>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Render as iOS group container list by default
  return (
    <GroupContainer className={className}>
      {items.map((item) => {
        const Icon = item.icon;
        
        // Construct the trend element if provided
        const trendEl = item.trend ? (
          <span
            className={cn(
              "text-[11px] font-bold font-mono ml-2 shrink-0 leading-none",
              item.trend.isPositive ? "text-emerald-500" : "text-rose-500"
            )}
          >
            {item.trend.isPositive ? "↑" : "↓"}{Math.abs(item.trend.value)}%
          </span>
        ) : null;

        // Combine raw secondary text with trend tag
        const secondaryCombined = (item.secondary || item.trend) ? (
          <div className="flex items-center gap-1 flex-wrap">
            {item.secondary && <span>{item.secondary}</span>}
            {trendEl}
          </div>
        ) : undefined;

        return (
          <ListRow
            key={item.key}
            icon={item.icon}
            label={item.label}
            secondary={secondaryCombined}
            trailing={
              <span className={cn("font-semibold font-mono text-foreground text-sm leading-none", item.destructive && "text-red-500")}>
                {item.value}
              </span>
            }
            destructive={item.destructive}
            showChevron={!!item.onClick}
            onClick={item.onClick}
          />
        );
      })}
    </GroupContainer>
  );
}
