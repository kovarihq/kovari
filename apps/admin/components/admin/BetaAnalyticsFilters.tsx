"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateRange } from "@/src/types/analytics";

interface BetaAnalyticsFiltersProps {
  initialDateRange: DateRange;
}

export function BetaAnalyticsFilters({
  initialDateRange,
}: BetaAnalyticsFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleDateRangeChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("dateRange", value);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
      <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground ml-1">
        Date Range
      </label>
      <Select value={initialDateRange} onValueChange={handleDateRangeChange}>
        <SelectTrigger className="w-[180px] h-9 rounded-xl bg-card border-border shadow-none cursor-pointer font-medium text-xs">
          <SelectValue placeholder="Select date range" />
        </SelectTrigger>
        <SelectContent className="rounded-xl">
          <SelectItem className="text-xs rounded-lg cursor-pointer" value="7d">Last 7 Days</SelectItem>
          <SelectItem className="text-xs rounded-lg cursor-pointer" value="30d">Last 30 Days</SelectItem>
          <SelectItem className="text-xs rounded-lg cursor-pointer" value="60d">Last 60 Days</SelectItem>
          <SelectItem className="text-xs rounded-lg cursor-pointer" value="all">All Time</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
