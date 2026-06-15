"use client";

import * as React from "react";
import { Loader2, MapPin, X } from "lucide-react";
import { Input } from "@/shared/components/ui/input";
import { cn } from "@kovari/utils";
import { searchLocation, getLocationDetails, type GeoapifyResult, type LocationData } from "@kovari/utils";

interface LocationAutocompleteProps {
  value?: string;
  onChange?: (value: string) => void;
  onSelect: (data: LocationData) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function LocationAutocomplete({
  value = "",
  onChange,
  onSelect,
  placeholder = "Search city...",
  className,
  disabled = false,
}: LocationAutocompleteProps) {
  const [inputValue, setInputValue] = React.useState(value);
  const [suggestions, setSuggestions] = React.useState<GeoapifyResult[]>([]);
  const [isOpen, setIsOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [selectedIndex, setSelectedIndex] = React.useState(-1);
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const debounceTimer = React.useRef<NodeJS.Timeout | null>(null);

  const abortControllerRef = React.useRef<AbortController | null>(null);

  // Sync internal state if prop changes from outside (e.g. reset)
  React.useEffect(() => {
    setInputValue(value);
  }, [value]);

  const fetchSuggestions = async (query: string) => {
    if (!query || query.length < 3) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setIsLoading(true);
    try {
      const results = await searchLocation(query, signal);
      if (signal.aborted) return;
      
      setSuggestions(results);
      setIsOpen(results.length > 0);
      setSelectedIndex(-1);
    } catch (error: any) {
      if (signal.aborted || error.name === 'AbortError') return;
      console.error("Location search failed", error);
      setSuggestions([]);
      setIsOpen(false);
    } finally {
      if (!signal.aborted) {
        setIsLoading(false);
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    onChange?.(val);

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    if (val.trim().length < 3) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    debounceTimer.current = setTimeout(() => {
      fetchSuggestions(val);
    }, 200); // 200ms debounce for faster feel
  };

  const handleSelect = async (result: GeoapifyResult) => {
    // 1. Update UI immediately with formatted address
    setInputValue(result.formatted);
    setSuggestions([]);
    setIsOpen(false);
    onChange?.(result.formatted);

    // 2. Fetch full details
    setIsLoading(true);
    try {
      // Resolve final location using Geoapify Geocoding / Place Details API as requested
      const details = await getLocationDetails(result.place_id);
      
      // If details found, use them. Otherwise fallback to the result we have.
      if (details) {
        onSelect(details);
      } else {
        // Fallback: construct LocationData from the autocomplete result
         const fallbackData: LocationData = {
          city: result.city || "",
          state: result.state || "",
          country: result.country || "",
          lat: result.lat,
          lon: result.lon,
          formatted: result.formatted,
          place_id: result.place_id,
          display_name: result.formatted
        };
        onSelect(fallbackData);
      }
    } catch (error) {
      console.error("Failed to fetch location details", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!isOpen) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : prev));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (selectedIndex >= 0 && suggestions[selectedIndex]) {
          handleSelect(suggestions[selectedIndex]);
        }
      } else if (e.key === "Escape") {
        setIsOpen(false);
      } else if (e.key === "Tab") {
          // Allow tab to close or select if needed? usually tab moves focus.
          setIsOpen(false);
      }
  };

  // Close on click outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div ref={wrapperRef} className={cn("relative w-full", className)}>
      <div className="relative">
        <Input
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="pr-10 bg-transparent border-border text-foreground" 
          autoComplete="off"
        />
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
             <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
         {!isLoading && inputValue && (
            <button
              onClick={() => {
                  setInputValue("");
                  onChange?.("");
                  setSuggestions([]);
                  setIsOpen(false);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              type="button"
            >
             {/* Only show clear button if not loading? Or maybe usually X */}
             {/* <X className="h-4 w-4" /> */}
            </button>
         )}
      </div>

      {isOpen && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto hide-scrollbar rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95">
             {suggestions.map((suggestion, index) => (
            <div
              key={suggestion.place_id}
              className={cn(
                "relative flex cursor-pointer select-none items-center rounded-md px-3 py-1.5 text-sm outline-none",
                index === selectedIndex ? "bg-secondary text-foreground font-medium" : "hover:bg-secondary hover:text-foreground"
              )}
              onClick={() => handleSelect(suggestion)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              {/* <MapPin className="mr-2 h-4 w-4 shrink-0 opacity-50" /> */}
              <div className="flex flex-col overflow-hidden">
                  <span className="truncate font-medium">
                      {suggestion.city || suggestion.formatted.split(",")[0]}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                      {suggestion.formatted}
                  </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

