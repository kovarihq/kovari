"use client";

import React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ListRowProps {
  icon?: React.ReactNode;
  label: React.ReactNode;
  secondary?: React.ReactNode;
  trailing?: React.ReactNode;
  showChevron?: boolean;
  onClick?: () => void;
  className?: string;
  destructive?: boolean;
}

export function ListRow({
  icon,
  label,
  secondary,
  trailing,
  showChevron = true,
  onClick,
  className,
  destructive = false,
}: ListRowProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "flex w-full min-h-[52px] items-center px-4 py-3 gap-3 min-w-0",
        "transition-colors duration-150 ease-in-out",
        onClick && "cursor-pointer hover:bg-secondary active:bg-secondary",
        className
      )}
    >
      {icon && (
        <div className={cn(
          "flex items-center justify-center shrink-0",
          destructive ? "text-red-500" : "text-foreground/80"
        )}>
          {icon}
        </div>
      )}
      
      <div className="flex flex-col flex-1 min-w-0">
        <span className={cn(
          "text-sm font-medium leading-tight truncate",
          destructive ? "text-red-500" : "text-foreground"
        )}>
          {label}
        </span>
        {secondary && (
          <div className="text-sm text-muted-foreground leading-tight min-w-0 w-full overflow-hidden">
            {typeof secondary === "string" ? (
              <div className="truncate">{secondary}</div>
            ) : (
              secondary
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0 h-full">
        {trailing && (
          <div className="flex items-center h-full text-md text-muted-foreground">
            {trailing}
          </div>
        )}
        {showChevron && onClick && (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
    </div>
  );
}
