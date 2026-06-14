"use client";

import { useState, useEffect } from "react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Slider, DateRangePicker } from "@heroui/react";
import { CalendarDays } from "lucide-react";
import { CalendarDate, today, getLocalTimeZone } from "@internationalized/date";

import { SearchData } from "../types";

// Helper to convert CalendarDate to JS Date
function calendarDateToDate(
  cd: CalendarDate | null | undefined,
): Date | undefined {
  if (!cd) return undefined;
  return new Date(cd.year, cd.month - 1, cd.day);
}

// Helper to convert JS Date to CalendarDate
function dateToCalendarDate(date?: Date): CalendarDate | undefined {
  if (!date) return undefined;
  return new CalendarDate(
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
  );
}

import { LocationAutocomplete } from "@/shared/components/ui/location-autocomplete";

interface SearchFormProps {
  searchData: SearchData;
  onSearchDataChange: (data: SearchData) => void;
  onSearch: () => void;
  isLoading: boolean;
  /** When set (e.g. mobile sheet), the date picker popover portals here so it stays clickable. */
  datePickerPortalContainer?: HTMLElement | null;
}

export const SearchForm = ({
  searchData,
  onSearchDataChange,
  onSearch,
  isLoading,
  datePickerPortalContainer,
}: SearchFormProps) => {
  const handleSearchDataChange = (updates: Partial<SearchData>) => {
    onSearchDataChange({ ...searchData, ...updates });
  };

  return (
    <div className="space-y-6 pb-6 border-b border-border">
      {/* Destination */}
      <div className="space-y-2">
        <Label
          htmlFor="destination"
          className="text-sm font-medium text-foreground flex items-center gap-2"
        >
          {/* <MapPin className="w-4 h-4" /> */}
          Destination
          <span className="text-xs text-muted-foreground font-normal">
            (optional)
          </span>
        </Label>
        <LocationAutocomplete
          value={searchData.destination}
          onChange={(val) => handleSearchDataChange({ destination: val })}
          onSelect={(details) => {
            // We want to store the city name as the primary destination string
            // and the full details for the backend
            handleSearchDataChange({
              destination: details.city || details.formatted.split(",")[0],
              destinationDetails: {
                city: details.city,
                state: details.state,
                country: details.country,
                lat: details.lat,
                lon: details.lon,
                formatted: details.formatted,
                place_id: details.place_id,
              },
            });
          }}
          placeholder="Enter your destination"
          className="w-full text-sm"
        />
      </div>

      {/* Dates */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-foreground flex items-center gap-2">
          {/* <CalendarDays className="w-4 h-4" /> */}
          Travel Dates
        </Label>
        <DateRangePicker
          variant="flat"
          value={
            {
              start: dateToCalendarDate(searchData.startDate),
              end: dateToCalendarDate(searchData.endDate),
            } as any
          }
          onChange={(range: any) => {
            if (range?.start && range?.end) {
              const startDate = calendarDateToDate(range.start);
              const endDate = calendarDateToDate(range.end);
              if (startDate && endDate) {
                handleSearchDataChange({
                  startDate,
                  endDate,
                });
              }
            }
          }}
          minValue={today(getLocalTimeZone())}
          className="w-full"
          size="sm"
          popoverProps={{
            shouldCloseOnInteractOutside: () => false,
            ...(datePickerPortalContainer && {
              portalContainer: datePickerPortalContainer,
            }),
            classNames: {
              base: "z-[100]",
              content: "z-[101]",
              backdrop: "z-[100]",
            },
          }}
        />
      </div>

      {/* Budget Range */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-foreground">
          Budget Range
        </Label>
        <div className="px-2">
          <Slider
            size="sm"
            step={1000}
            minValue={5000}
            maxValue={50000}
            value={[searchData.budget]}
            onChange={(value) =>
              handleSearchDataChange({
                budget: Array.isArray(value) ? value[0] : value,
              })
            }
            className="w-full"
            color="primary"
          />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>₹5,000</span>
          <span>₹{searchData.budget.toLocaleString()}</span>
          <span>₹50,000+</span>
        </div>
      </div>

      {/* Quick Budget Buttons */}
      <div className="space-y-2">
        <Label className="text-sm text-muted-foreground">Quick Select</Label>
        <div className="flex min-[930px]:grid min-[930px]:grid-cols-2 min-[1100px]:flex gap-2 w-full">
          {[10000, 20000, 35000, 50000].map((budget) => (
            <Button
              key={budget}
              variant={searchData.budget === budget ? "default" : "secondary"}
              size="sm"
              onClick={() => handleSearchDataChange({ budget })}
              className="text-xs flex-1 rounded-full"
            >
              {budget === 50000 ? "₹50k+" : `₹${budget.toLocaleString()}`}
            </Button>
          ))}
        </div>
      </div>

      {/* Search Button */}
      <Button
        onClick={onSearch}
        disabled={isLoading}
        className="w-full bg-primary text-primary-foreground py-3 rounded-full"
      >
        {isLoading ? "Searching..." : searchData.destination ? "Search" : "Browse all travelers"}
      </Button>
    </div>
  );
};

