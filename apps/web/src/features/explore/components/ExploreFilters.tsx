"use client";

import React from "react";
import { useState, useEffect, useRef, useMemo } from "react";
import {
  Slider,
  Input,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  Button as HeroButton,
  ButtonGroup,
  Checkbox,
  Listbox,
  ListboxSection,
  ListboxItem,
} from "@heroui/react";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/shared/components/ui/dropdown-menu";
import { CalendarDate, type DateValue } from "@internationalized/date";
import { RangeCalendar } from "@heroui/react";
import { today, getLocalTimeZone } from "@internationalized/date";
import { ChevronDown, Check, Filter, X } from "lucide-react";
import { cn } from "@kovari/utils";
import { z } from "zod";

const GENDER_OPTIONS = ["Any", "Male", "Female", "Other"];
const INTEREST_OPTIONS = [
  "Solo Backpacking",
  "Weekend Getaways",
  "Long-Term Travel",
  "Workations",
  "Road Trips",
  "Train Journeys",
  "Himalayan Treks",
  "Camping & Stargazing",
  "River Rafting",
  "Skiing & Snow",
  "Wildlife & Safaris",
  "Beach Bumming",
  "Scuba & Snorkeling",
  "Island Hopping",
  "Street Food Crawls",
  "Local Markets",
  "Chai & Conversations",
  "Heritage & History",
  "Art & Galleries",
  "Music & Festivals",
  "Spiritual Travel",
  "Photography",
  "Aesthetic Spots",
  "Nightlife & Clubs"
];

const PERSONALITY_OPTIONS = ["Any", "Extrovert", "Introvert", "Ambivert"];

const SMOKING_OPTIONS = ["Any", "Yes", "No"];

const DRINKING_OPTIONS = ["Any", "Yes", "No", "Socially"];

const BUDGET_RANGE_OPTIONS = [
  "Any",
  "Budget (₹0-₹50,000)",
  "Mid-range (₹50,000-₹1,00,000)",
  "Luxury (₹1,00,000+)",
];

const NATIONALITY_OPTIONS = [
  "Any",
  "Indian",
  "American",
  "British",
  "Canadian",
  "Australian",
  "German",
  "French",
  "Japanese",
  "Chinese",
  "Korean",
  "Singaporean",
  "Thai",
  "Vietnamese",
  "Indonesian",
  "Malaysian",
  "Filipino",
  "Other",
];

const LANGUAGE_OPTIONS = [
  "English",
  "Hindi",
  "Bengali",
  "Telugu",
  "Marathi",
  "Tamil",
  "Gujarati",
  "Urdu",
  "Kannada",
  "Malayalam",
  "Punjabi",
];
const DESTINATION_OPTIONS = [
  "Any",
  "Paris",
  "London",
  "New York",
  "Tokyo",
  "Sydney",
  "Rome",
  "Barcelona",
  "Bangkok",
  "Dubai",
  "Singapore",
];

interface ExploreFiltersProps {
  filters: FiltersState;
  onFilterChange: (filters: FiltersState) => void;
  mode: "group" | "traveler";
  onDropdownOpenChange?: (isOpen: boolean) => void;
}

interface FiltersState {
  destination: string;
  dateStart: Date | undefined;
  dateEnd: Date | undefined;
  ageMin: number;
  ageMax: number;
  gender: string;
  interests: string[];
  personality: string;
  smoking: string;
  drinking: string;
  budgetRange: string;
  nationality: string;
  languages: string[];
}

const DEFAULT_FILTERS: FiltersState = {
  destination: "",
  dateStart: undefined,
  dateEnd: undefined,
  ageMin: 18,
  ageMax: 99,
  gender: "Any",
  interests: [],
  personality: "Any",
  smoking: "Any",
  drinking: "Any",
  budgetRange: "Any",
  nationality: "Any",
  languages: [],
};

const DEBOUNCE_MS = 300;
const DESKTOP_AGE_DEBOUNCE_MS = 600;

// Helper to convert CalendarDate to JS Date (UTC)
function calendarDateToDate(
  cd: CalendarDate | null | undefined,
): Date | undefined {
  if (!cd) return undefined;
  return new Date(Date.UTC(cd.year, cd.month - 1, cd.day));
}

// Helper to convert JS Date to CalendarDate
function dateToCalendarDate(date?: Date): CalendarDate | undefined {
  if (!date) return undefined;
  return new CalendarDate(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
}

export const ListboxWrapper: React.FC<React.PropsWithChildren> = ({
  children,
}) => (
  <div className="w-full border-small px-1 py-2 rounded-small border-default-200 dark:border-default-100">
    {children}
  </div>
);

// Zod schema for filter validation
const filtersSchema = z
  .object({
    destination: z.string(),
    dateStart: z.date().optional().or(z.undefined()),
    dateEnd: z.date().optional().or(z.undefined()),
    ageMin: z.number().min(18, "Min age is 18").max(100, "Max age is 100"),
    ageMax: z.number().min(18, "Min age is 18").max(100, "Max age is 100"),
    gender: z.string(),
    interests: z.array(z.string()),
    personality: z.string(),
    smoking: z.string(),
    drinking: z.string(),
    budgetRange: z.string(),
    nationality: z.string(),
    languages: z.array(z.string()),
  })
  .refine((data) => data.ageMin <= data.ageMax, {
    message: "Minimum age must be less than or equal to maximum age.",
    path: ["ageMin"],
  })
  .refine(
    (data) => {
      if (data.dateStart && data.dateEnd) {
        return data.dateStart <= data.dateEnd;
      }
      return true;
    },
    {
      message: "Start date must be before end date.",
      path: ["dateStart"],
    },
  );

const ExploreFilters: React.FC<ExploreFiltersProps> = ({
  filters,
  onFilterChange,
  mode,
  onDropdownOpenChange,
}) => {
  console.log("ExploreFilters mounted");
  const safeFilters = filters ?? DEFAULT_FILTERS;
  const [isDesktop, setIsDesktop] = useState(false);
  const [isSmallMobile, setIsSmallMobile] = useState(false);
  const { isOpen, onOpen, onClose } = useDisclosure();

  // Track which dropdown is open
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  // Local state for age range slider (desktop only)
  const [ageRange, setAgeRange] = useState<[number, number]>([
    safeFilters.ageMin,
    safeFilters.ageMax,
  ]);
  const isDragging = useRef(false);
  const dragTimeout = useRef<NodeJS.Timeout | null>(null);
  const prevOpenDropdown = useRef<string | null>(null);
  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);
  const desktopAgeDebounceTimeout = useRef<NodeJS.Timeout | null>(null);
  const [destinationInput, setDestinationInput] = useState(
    safeFilters.destination || "",
  );
  const [filteredDestinations, setFilteredDestinations] =
    useState<string[]>(DESTINATION_OPTIONS);
  const destinationDebounceTimeout = useRef<NodeJS.Timeout | null>(null);

  const ANY_DESTINATION = "Any";
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    new Set([
      safeFilters.destination && safeFilters.destination !== ANY_DESTINATION
        ? safeFilters.destination
        : ANY_DESTINATION,
    ]),
  );

  const selectedValue = useMemo(
    () => Array.from(selectedKeys).join(", "),
    [selectedKeys],
  );

  // Add local state for mobile filters
  const [mobileFilters, setMobileFilters] = useState<FiltersState>(safeFilters);

  // Sync mobileFilters with parent filters only when modal is opened (not on every prop change)
  const prevIsOpen = useRef(isOpen);
  useEffect(() => {
    if (!prevIsOpen.current && isOpen) {
      setMobileFilters(safeFilters);
      setAgeRange([safeFilters.ageMin, safeFilters.ageMax]);
      setDestinationInput(safeFilters.destination || "");
      setSelectedKeys(
        new Set([
          safeFilters.destination && safeFilters.destination !== ANY_DESTINATION
            ? safeFilters.destination
            : ANY_DESTINATION,
        ]),
      );
    }
    prevIsOpen.current = isOpen;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Check screen size
  useEffect(() => {
    const checkScreenSize = () => {
      setIsDesktop(window.innerWidth >= 1024); // true if width >= 1024px (show DesktopFilters)
      setIsSmallMobile(window.innerWidth <= 425);
    };

    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);

    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  // Sync local ageRange with filter when filter changes (for external updates)
  // useEffect(() => {
  //   if (!isDragging.current) {
  //     if (
  //       ageRange[0] !== safeFilters.ageMin ||
  //       ageRange[1] !== safeFilters.ageMax
  //     ) {
  //       setAgeRange([safeFilters.ageMin, safeFilters.ageMax]);
  //     }
  //   }
  // }, [safeFilters.ageMin, safeFilters.ageMax]);

  // Debounced filter update for age range (DESKTOP FILTERS ONLY)
  useEffect(() => {
    if (isDesktop) {
      if (
        ageRange[0] !== safeFilters.ageMin ||
        ageRange[1] !== safeFilters.ageMax
      ) {
        if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
        debounceTimeout.current = setTimeout(() => {
          onFilterChange({
            ...safeFilters,
            ageMin: ageRange[0],
            ageMax: ageRange[1],
          });
        }, DEBOUNCE_MS);
      }
      return () => {
        if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ageRange, isDesktop]);

  // Sync local input with parent filter
  useEffect(() => {
    setDestinationInput(safeFilters.destination || "");
  }, [safeFilters.destination]);

  // Filter options as user types
  useEffect(() => {
    const input = destinationInput.trim().toLowerCase();
    if (!input) {
      setFilteredDestinations(DESTINATION_OPTIONS);
    } else {
      setFilteredDestinations(
        DESTINATION_OPTIONS.filter((opt) => opt.toLowerCase().includes(input)),
      );
    }
  }, [destinationInput]);

  // Debounce custom value
  useEffect(() => {
    if (isDesktop) {
      if (
        destinationInput !== safeFilters.destination &&
        !DESTINATION_OPTIONS.some(
          (opt) => opt.toLowerCase() === destinationInput.trim().toLowerCase(),
        )
      ) {
        if (destinationDebounceTimeout.current)
          clearTimeout(destinationDebounceTimeout.current);
        destinationDebounceTimeout.current = setTimeout(() => {
          onFilterChange({ ...safeFilters, destination: destinationInput });
        }, DEBOUNCE_MS);
      }
      return () => {
        if (destinationDebounceTimeout.current)
          clearTimeout(destinationDebounceTimeout.current);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destinationInput, isDesktop]);

  // Notify parent when desktop dropdown open state changes
  useEffect(() => {
    if (isDesktop && onDropdownOpenChange) {
      onDropdownOpenChange(openDropdown !== null);
    }
    // Only run when openDropdown or isDesktop changes
  }, [openDropdown, isDesktop, onDropdownOpenChange]);

  // Handlers
  const handleDestinationSelect = (destination: string) => {
    onFilterChange({ ...safeFilters, destination });
  };

  // Date Range Handler
  const handleDateRangeChange = ({
    start,
    end,
  }: {
    start: CalendarDate | null;
    end: CalendarDate | null;
  }) => {
    onFilterChange({
      ...safeFilters,
      dateStart: calendarDateToDate(start),
      dateEnd: calendarDateToDate(end),
    });
  };

  // Age Range Handler (no longer calls onFilterChange directly)
  const handleAgeRangeChange = ([min, max]: [number, number]) => {
    setAgeRange([min, max]);
  };

  const handleGenderChange = (value: string) => {
    onFilterChange({ ...safeFilters, gender: value });
  };

  const handleInterestToggle = (interest: string) => {
    onFilterChange(
      safeFilters.interests.includes(interest)
        ? {
            ...safeFilters,
            interests: safeFilters.interests.filter((i) => i !== interest),
          }
        : { ...safeFilters, interests: [...safeFilters.interests, interest] },
    );
  };

  // Filter summary helpers
  const getAgeRangeLabel = () => {
    if (safeFilters.ageMin === 18 && safeFilters.ageMax === 99)
      return "Age Range";
    return `${safeFilters.ageMin} - ${safeFilters.ageMax}`;
  };

  const getGenderLabel = () =>
    !safeFilters.gender || safeFilters.gender === "Any"
      ? "Gender"
      : safeFilters.gender;

  const getInterestsLabel = () =>
    safeFilters.interests.length === 0
      ? "Interests"
      : safeFilters.interests.join(", ");

  const getDestinationLabel = () =>
    !safeFilters.destination || safeFilters.destination === "Any"
      ? "Destination"
      : safeFilters.destination;

  const getPersonalityLabel = () =>
    !safeFilters.personality || safeFilters.personality === "Any"
      ? "Personality"
      : safeFilters.personality;

  const getSmokingLabel = () =>
    !safeFilters.smoking || safeFilters.smoking === "Any"
      ? "Smoking"
      : safeFilters.smoking;

  const getDrinkingLabel = () =>
    !safeFilters.drinking || safeFilters.drinking === "Any"
      ? "Drinking"
      : safeFilters.drinking;

  const getBudgetRangeLabel = () =>
    !safeFilters.budgetRange || safeFilters.budgetRange === "Any"
      ? "Budget"
      : safeFilters.budgetRange;

  const getNationalityLabel = () =>
    !safeFilters.nationality || safeFilters.nationality === "Any"
      ? "Nationality"
      : safeFilters.nationality;

  const getLanguagesLabel = () =>
    safeFilters.languages.length === 0
      ? "Languages"
      : safeFilters.languages.join(", ");

  // Build RangeCalendar value object conditionally
  const startCal = dateToCalendarDate(safeFilters.dateStart);
  const endCal = dateToCalendarDate(safeFilters.dateEnd);
  let calendarValue: { start?: CalendarDate; end?: CalendarDate } | null = null;
  if (startCal && endCal) {
    calendarValue = { start: startCal, end: endCal };
  } else if (startCal) {
    calendarValue = { start: startCal };
  } else if (endCal) {
    calendarValue = { end: endCal };
  } else {
    calendarValue = null;
  }

  // Count active filters for mobile button
  const getActiveFiltersCount = () => {
    let count = 0;
    if (safeFilters.destination && safeFilters.destination !== "Any") count++;
    if (safeFilters.dateStart || safeFilters.dateEnd) count++;
    if (safeFilters.ageMin !== 18 || safeFilters.ageMax !== 99) count++;
    if (safeFilters.gender && safeFilters.gender !== "Any") count++;
    if (safeFilters.interests.length > 0) count++;
    if (safeFilters.personality && safeFilters.personality !== "Any") count++;
    if (safeFilters.smoking && safeFilters.smoking !== "Any") count++;
    if (safeFilters.drinking && safeFilters.drinking !== "Any") count++;
    if (safeFilters.budgetRange && safeFilters.budgetRange !== "Any") count++;
    if (safeFilters.nationality && safeFilters.nationality !== "Any") count++;
    if (safeFilters.languages.length > 0) count++;
    return count;
  };

  const [validationErrors, setValidationErrors] = useState<
    Partial<Record<keyof FiltersState, string>>
  >({});

  // Helper to validate filters
  const validateFilters = (filters: FiltersState): boolean => {
    const result = filtersSchema.safeParse(filters);
    if (!result.success) {
      const errors: Partial<Record<keyof FiltersState, string>> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof FiltersState;
        errors[key] = issue.message;
      }
      setValidationErrors(errors);
      return false;
    }
    setValidationErrors({});
    return true;
  };

  // Replace all onFilterChange calls with validation
  const handleValidatedFilterChange = (filters: FiltersState) => {
    if (validateFilters(filters)) {
      onFilterChange(filters);
    }
  };

  // Mobile Modal Content
  const MobileFiltersModal = () => (
    <Modal
      backdrop="blur"
      isOpen={isOpen}
      onClose={onClose}
      placement="bottom"
      className="m-0"
      classNames={{
        base: "max-h-[90vh]",
        wrapper: "items-end",
        backdrop: "bg-black/50",
      }}
    >
      <ModalContent
        className={`rounded-t-3xl${isSmallMobile ? " rounded-b-none" : ""}`}
      >
        {/* Hide absolutely positioned close button with aria-label="Close" */}
        <style>{`
          button[aria-label="Close"].absolute { display: none !important; }
        `}</style>
        <ModalHeader className="flex flex-col gap-1 px-6 pt-4 pb-4">
          <div className="flex items-center w-full relative">
            <h2 className="text-lg font-semibold text-foreground">Filters</h2>
            <HeroButton
              isIconOnly
              variant="light"
              onPress={onClose}
              className="text-muted-foreground ml-auto"
            >
              <X className="h-5 w-5" />
            </HeroButton>
          </div>
        </ModalHeader>
        <ModalBody className="px-6 py-2 overflow-y-auto">
          <div className="space-y-6 w-full">
            {/* Destination */}
            <ListboxWrapper>
              <style>
                {`
              [data-slot="input-wrapper"] {
                border: none !important;
              }
              [data-slot="input-wrapper"]::after {
                display: none !important;
              }
            `}
              </style>
              <div
                style={
                  {
                    outline: "none",
                    boxShadow: "none",
                    "--tw-ring-shadow": "none",
                    "--tw-ring-color": "transparent",
                    "--tw-ring-offset-shadow": "none",
                  } as React.CSSProperties
                }
              >
                <Input
                  variant="underlined"
                  id="destination-input"
                  type="text"
                  placeholder="Type city or country..."
                  value={destinationInput}
                  onChange={(e) => {
                    setDestinationInput(e.target.value);
                    setMobileFilters((prev) => ({
                      ...prev,
                      destination: e.target.value,
                    }));
                  }}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !filteredDestinations.some(
                        (opt) =>
                          opt.toLowerCase() ===
                          destinationInput.trim().toLowerCase(),
                      )
                    ) {
                      setMobileFilters((prev) => ({
                        ...prev,
                        destination: destinationInput,
                      }));
                    }
                  }}
                  style={
                    {
                      outline: "none",
                      boxShadow: "none",
                      "--tw-ring-shadow": "none",
                      "--tw-ring-color": "transparent",
                      "--tw-ring-offset-shadow": "none",
                      background: "transparent",
                      backgroundColor: "transparent",
                      height: "32px",
                      paddingTop: "4px",
                      paddingBottom: "4px",
                    } as React.CSSProperties
                  }
                  className="mb-2"
                  aria-label="Destination filter"
                  autoFocus
                />
              </div>
              <Listbox
                disallowEmptySelection
                aria-label="Single selection example"
                selectedKeys={selectedKeys}
                selectionMode="single"
                variant="flat"
                onSelectionChange={(keys) => {
                  setSelectedKeys(keys as Set<string>);
                  const selected = Array.from(keys)[0];
                  if (typeof selected === "string") {
                    if (selected === ANY_DESTINATION) {
                      setMobileFilters((prev) => ({
                        ...prev,
                        destination: ANY_DESTINATION,
                      }));
                      setDestinationInput("");
                    } else {
                      setMobileFilters((prev) => ({
                        ...prev,
                        destination: selected,
                      }));
                      setDestinationInput(selected);
                    }
                  }
                }}
              >
                {filteredDestinations
                  .filter((destination) => destination !== ANY_DESTINATION)
                  .map((destination) => (
                    <ListboxItem key={destination}>{destination}</ListboxItem>
                  ))}
              </Listbox>
            </ListboxWrapper>

            {/* Date Range */}
            <div className="space-y-3">
              <h3 className="text-lg font-medium text-foreground">
                Date Range
              </h3>
              <div className="flex justify-center w-full">
                <RangeCalendar
                  calendarWidth={"full"}
                  value={
                    (() => {
                      const start = dateToCalendarDate(mobileFilters.dateStart);
                      const end = dateToCalendarDate(mobileFilters.dateEnd);
                      if (start && end) return { start, end };
                      if (start) return { start };
                      if (end) return { end };
                      return null;
                    })() as any
                  }
                  onChange={(range: { start?: DateValue; end?: DateValue }) => {
                    const start =
                      range.start instanceof CalendarDate
                        ? range.start
                        : undefined;
                    const end =
                      range.end instanceof CalendarDate ? range.end : undefined;
                    setMobileFilters((prev) => ({
                      ...prev,
                      dateStart: start ? calendarDateToDate(start) : undefined,
                      dateEnd: end ? calendarDateToDate(end) : undefined,
                    }));
                  }}
                  minValue={today(getLocalTimeZone())}
                  classNames={{
                    base: "bg-transparent w-full",
                    headerWrapper: "bg-transparent",
                    gridHeader: "bg-transparent",
                  }}
                />
              </div>
            </div>

            {/* Traveler-specific filters */}
            {mode === "traveler" && (
              <>
                {/* Age Range */}
                <div className="space-y-3">
                  <h3 className="text-lg font-medium text-foreground">
                    Age Range
                  </h3>
                  <div className="px-2">
                    <Slider
                      value={[mobileFilters.ageMin, mobileFilters.ageMax]}
                      onChange={(value) => {
                        if (Array.isArray(value) && value.length === 2) {
                          setMobileFilters((prev) => ({
                            ...prev,
                            ageMin: value[0],
                            ageMax: value[1],
                          }));
                          setAgeRange(value as [number, number]);
                        }
                      }}
                      minValue={18}
                      maxValue={100}
                      step={1}
                      size="sm"
                      label="Age Range"
                    />
                  </div>
                </div>

                {/* Gender */}
                <div className="space-y-3">
                  <h3 className="text-lg font-medium text-foreground">
                    Gender
                  </h3>
                  <ButtonGroup className="w-full">
                    {GENDER_OPTIONS.filter((option) => option !== "Any").map(
                      (option) => (
                        <HeroButton
                          key={option}
                          variant={
                            mobileFilters.gender === option
                              ? "solid"
                              : "bordered"
                          }
                          color={
                            mobileFilters.gender === option
                              ? "primary"
                              : "default"
                          }
                          onPress={() =>
                            setMobileFilters((prev) => ({
                              ...prev,
                              gender: option,
                            }))
                          }
                          className="flex-1"
                        >
                          {option}
                        </HeroButton>
                      ),
                    )}
                  </ButtonGroup>
                </div>

                {/* Interests */}
                <div className="space-y-3">
                  <h3 className="text-lg font-medium text-foreground">
                    Interests
                  </h3>
                  <ListboxWrapper>
                    <Listbox
                      disallowEmptySelection
                      aria-label="Single selection example"
                      selectedKeys={new Set(mobileFilters.interests)}
                      selectionMode="multiple"
                      variant="flat"
                      onSelectionChange={(keys) => {
                        setMobileFilters((prev) => ({
                          ...prev,
                          interests: Array.from(keys) as string[],
                        }));
                      }}
                    >
                      {INTEREST_OPTIONS.map((interest) => (
                        <ListboxItem key={interest}>{interest}</ListboxItem>
                      ))}
                    </Listbox>
                  </ListboxWrapper>
                </div>

                {/* Personality */}
                <div className="space-y-3">
                  <h3 className="text-lg font-medium text-foreground">
                    Personality
                  </h3>
                  <ButtonGroup className="w-full">
                    {PERSONALITY_OPTIONS.filter(
                      (option) => option !== "Any",
                    ).map((option) => (
                      <HeroButton
                        key={option}
                        variant={
                          mobileFilters.personality === option
                            ? "solid"
                            : "bordered"
                        }
                        color={
                          mobileFilters.personality === option
                            ? "primary"
                            : "default"
                        }
                        onPress={() =>
                          setMobileFilters((prev) => ({
                            ...prev,
                            personality: option,
                          }))
                        }
                        className="flex-1"
                      >
                        {option}
                      </HeroButton>
                    ))}
                  </ButtonGroup>
                </div>

                {/* Smoking */}
                <div className="space-y-3">
                  <h3 className="text-lg font-medium text-foreground">
                    Smoking
                  </h3>
                  <ButtonGroup className="w-full">
                    {SMOKING_OPTIONS.filter((option) => option !== "Any").map(
                      (option) => (
                        <HeroButton
                          key={option}
                          variant={
                            mobileFilters.smoking === option
                              ? "solid"
                              : "bordered"
                          }
                          color={
                            mobileFilters.smoking === option
                              ? "primary"
                              : "default"
                          }
                          onPress={() =>
                            setMobileFilters((prev) => ({
                              ...prev,
                              smoking: option,
                            }))
                          }
                          className="flex-1"
                        >
                          {option}
                        </HeroButton>
                      ),
                    )}
                  </ButtonGroup>
                </div>

                {/* Drinking */}
                <div className="space-y-3">
                  <h3 className="text-lg font-medium text-foreground">
                    Drinking
                  </h3>
                  <ButtonGroup className="w-full">
                    {DRINKING_OPTIONS.filter((option) => option !== "Any").map(
                      (option) => (
                        <HeroButton
                          key={option}
                          variant={
                            mobileFilters.drinking === option
                              ? "solid"
                              : "bordered"
                          }
                          color={
                            mobileFilters.drinking === option
                              ? "primary"
                              : "default"
                          }
                          onPress={() =>
                            setMobileFilters((prev) => ({
                              ...prev,
                              drinking: option,
                            }))
                          }
                          className="flex-1"
                        >
                          {option}
                        </HeroButton>
                      ),
                    )}
                  </ButtonGroup>
                </div>

                {/* Budget Range */}
                <div className="space-y-3">
                  <h3 className="text-lg font-medium text-foreground">
                    Budget Range
                  </h3>
                  <ButtonGroup className="w-full">
                    {BUDGET_RANGE_OPTIONS.filter(
                      (option) => option !== "Any",
                    ).map((option) => (
                      <HeroButton
                        key={option}
                        variant={
                          mobileFilters.budgetRange === option
                            ? "solid"
                            : "bordered"
                        }
                        color={
                          mobileFilters.budgetRange === option
                            ? "primary"
                            : "default"
                        }
                        onPress={() =>
                          setMobileFilters((prev) => ({
                            ...prev,
                            budgetRange: option,
                          }))
                        }
                        className="flex-1"
                      >
                        {option}
                      </HeroButton>
                    ))}
                  </ButtonGroup>
                </div>

                {/* Nationality */}
                <div className="space-y-3">
                  <h3 className="text-lg font-medium text-foreground">
                    Nationality
                  </h3>
                  <ButtonGroup className="w-full">
                    {NATIONALITY_OPTIONS.filter(
                      (option) => option !== "Any",
                    ).map((option) => (
                      <HeroButton
                        key={option}
                        variant={
                          mobileFilters.nationality === option
                            ? "solid"
                            : "bordered"
                        }
                        color={
                          mobileFilters.nationality === option
                            ? "primary"
                            : "default"
                        }
                        onPress={() =>
                          setMobileFilters((prev) => ({
                            ...prev,
                            nationality: option,
                          }))
                        }
                        className="flex-1"
                      >
                        {option}
                      </HeroButton>
                    ))}
                  </ButtonGroup>
                </div>

                {/* Languages */}
                <div className="space-y-3">
                  <h3 className="text-lg font-medium text-foreground">
                    Languages
                  </h3>
                  <ListboxWrapper>
                    <Listbox
                      disallowEmptySelection
                      aria-label="Languages selection"
                      selectedKeys={new Set(mobileFilters.languages)}
                      selectionMode="multiple"
                      variant="flat"
                      onSelectionChange={(keys) => {
                        setMobileFilters((prev) => ({
                          ...prev,
                          languages: Array.from(keys) as string[],
                        }));
                      }}
                    >
                      {LANGUAGE_OPTIONS.map((language) => (
                        <ListboxItem key={language}>{language}</ListboxItem>
                      ))}
                    </Listbox>
                  </ListboxWrapper>
                </div>
              </>
            )}
          </div>
        </ModalBody>
        <ModalFooter className="px-6 py-6">
          <div className="flex gap-3 w-full">
            <HeroButton
              variant="bordered"
              onPress={() => {
                setMobileFilters(DEFAULT_FILTERS);
                setAgeRange([18, 99]);
                setDestinationInput("");
                setSelectedKeys(new Set([ANY_DESTINATION]));
                onFilterChange(DEFAULT_FILTERS);
                onClose();
              }}
              className="flex-1"
            >
              Clear All
            </HeroButton>
            <HeroButton
              color="primary"
              onPress={() => {
                handleValidatedFilterChange(mobileFilters);
                onClose();
              }}
              className="flex-1"
            >
              Apply Filters
            </HeroButton>
          </div>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );

  // Desktop Filters (Original Code)
  const DesktopFilters = () => (
    <section className="flex flex-wrap gap-2 items-center min-w-0">
      {/* Destination Dropdown */}
      <DropdownMenu
        open={openDropdown === "destination"}
        onOpenChange={(open) => setOpenDropdown(open ? "destination" : null)}
      >
        <DropdownMenuTrigger asChild className="">
          <Button
            variant={"outline"}
            className={`bg-card rounded-full px-4 py-2 text-muted-foreground hover:text-primary ${
              openDropdown === "destination" ? "text-primary" : ""
            } font-medium flex items-center justify-between focus:outline-none focus:ring-0 focus:ring-transparent"
            aria-label="Destination filter`}
          >
            {safeFilters.destination && safeFilters.destination !== "Any"
              ? safeFilters.destination
              : "Destination"}
            <ChevronDown className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="p-3 min-w-[220px] backdrop-blur-2xl bg-white/50 rounded-2xl shadow-md transition-all duration-300 ease-in-out border-none">
          <style>
            {`
              [data-slot="input-wrapper"] {
                border: none !important;
              }
              [data-slot="input-wrapper"]::after {
                display: none !important;
              }
            `}
          </style>
          <div
            style={
              {
                outline: "none",
                boxShadow: "none",
                "--tw-ring-shadow": "none",
                "--tw-ring-color": "transparent",
                "--tw-ring-offset-shadow": "none",
              } as React.CSSProperties
            }
          >
            <Input
              variant="underlined"
              id="destination-input"
              type="text"
              placeholder="Type city or country..."
              value={destinationInput}
              onChange={(e) => setDestinationInput(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !filteredDestinations.some(
                    (opt) =>
                      opt.toLowerCase() ===
                      destinationInput.trim().toLowerCase(),
                  )
                ) {
                  handleValidatedFilterChange({
                    ...safeFilters,
                    destination: destinationInput,
                  });
                  setOpenDropdown(null);
                }
              }}
              style={
                {
                  outline: "none",
                  boxShadow: "none",
                  "--tw-ring-shadow": "none",
                  "--tw-ring-color": "transparent",
                  "--tw-ring-offset-shadow": "none",
                  background: "transparent",
                  backgroundColor: "transparent",
                  height: "32px",
                  paddingTop: "4px",
                  paddingBottom: "4px",
                } as React.CSSProperties
              }
              className="mb-2"
              aria-label="Destination filter"
              autoFocus
            />
          </div>
          <div className="max-h-[500px] overflow-y-auto">
            {filteredDestinations.filter((dest) => dest !== "Any").length >
            0 ? (
              filteredDestinations
                .filter((destination) => destination !== "Any")
                .map((destination) => (
                  <DropdownMenuItem
                    key={destination}
                    className={
                      "w-full rounded-md px-4 py-1 text-sm border-none cursor-pointer flex items-center hover:!bg-transparent hover:!border-none hover:!outline-none focus-within:!bg-transparent focus-within:!border-none focus-within:!outline-none bg-transparent text-foreground focus-within:!text-foreground"
                    }
                    aria-pressed={safeFilters.destination === destination}
                    tabIndex={0}
                    aria-label={destination}
                    onClick={() => {
                      setDestinationInput(destination);
                      handleValidatedFilterChange({
                        ...safeFilters,
                        destination,
                      });
                      setOpenDropdown(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        setDestinationInput(destination);
                        handleValidatedFilterChange({
                          ...safeFilters,
                          destination,
                        });
                        setOpenDropdown(null);
                      }
                    }}
                  >
                    {destination}
                    {safeFilters.destination === destination && (
                      <Check
                        className="w-4 h-4 ml-auto text-primary"
                        aria-hidden="true"
                      />
                    )}
                  </DropdownMenuItem>
                ))
            ) : (
              <div className="px-4 py-2 text-sm text-muted-foreground">
                No matches
              </div>
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Date Range Dropdown */}
      <DropdownMenu
        open={openDropdown === "date"}
        onOpenChange={(open) => setOpenDropdown(open ? "date" : null)}
      >
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className={`rounded-full border-primary/30 bg-card  px-4 py-2 text-muted-foreground hover:text-primary ${
              openDropdown === "date" ? "text-primary" : ""
            }  font-medium flex items-center justify-between focus:outline-none focus:ring-0 focus:ring-transparent"
            aria-label="Date range filter`}
          >
            Date Range
            <ChevronDown className="ml-2 w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-[250px] backdrop-blur-2xl bg-white/50 rounded-2xl shadow-md transition-all duration-300 ease-in-out border-none">
          <div>
            <RangeCalendar
              value={calendarValue as any}
              onChange={(range: { start?: DateValue; end?: DateValue }) => {
                const start =
                  range.start instanceof CalendarDate ? range.start : undefined;
                const end =
                  range.end instanceof CalendarDate ? range.end : undefined;
                handleValidatedFilterChange({
                  ...safeFilters,
                  dateStart: start ? calendarDateToDate(start) : undefined,
                  dateEnd: end ? calendarDateToDate(end) : undefined,
                });
              }}
              minValue={today(getLocalTimeZone())}
              classNames={{
                base: cn("bg-transparent"),
                headerWrapper: cn("bg-transparent"),
                gridHeader: cn("bg-transparent"),
              }}
            />
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Only show these filters in traveler mode */}
      {mode === "traveler" && (
        <>
          {/* Age Range Dropdown */}
          <DropdownMenu
            open={openDropdown === "age"}
            onOpenChange={(open) => setOpenDropdown(open ? "age" : null)}
          >
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className={`rounded-full border-primary/30 bg-card min-w-[140px] px-4 py-2 text-muted-foreground hover:text-primary  ${
                  openDropdown === "age" ? "text-primary" : ""
                }  font-medium flex items-center justify-between focus:outline-none focus:ring-0 focus:ring-transparent"
                aria-label="Age range filter`}
              >
                Age Range
                <ChevronDown className="ml-2 w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="p-4 min-w-[350px] backdrop-blur-2xl bg-white/50 rounded-2xl shadow-md transition-all duration-300 ease-in-out border-none">
              <Slider
                value={ageRange}
                onChange={(value) => {
                  if (Array.isArray(value) && value.length === 2)
                    setAgeRange(value as [number, number]);
                }}
                onChangeEnd={(value) => {
                  if (
                    Array.isArray(value) &&
                    value.length === 2 &&
                    (value[0] !== safeFilters.ageMin ||
                      value[1] !== safeFilters.ageMax)
                  ) {
                    handleValidatedFilterChange({
                      ...safeFilters,
                      ageMin: value[0],
                      ageMax: value[1],
                    });
                  }
                }}
                minValue={18}
                maxValue={100}
                step={1}
                size="sm"
                label="Age Range"
              />
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Gender */}
          <DropdownMenu
            open={openDropdown === "gender"}
            onOpenChange={(open) => setOpenDropdown(open ? "gender" : null)}
          >
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className={`rounded-full border-primary/30 bg-card px-4 py-2 text-muted-foreground hover:text-primary  ${openDropdown === "gender" ? "text-primary" : ""} font-medium flex items-center justify-between focus:outline-none focus:ring-0 focus:ring-transparent`}
                aria-label="Gender filter"
              >
                {getGenderLabel()}
                <ChevronDown className="ml-2 w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="p-3 min-w-[140px] backdrop-blur-2xl bg-white/50 rounded-2xl shadow-md transition-all duration-300 ease-in-out border-none">
              {GENDER_OPTIONS.filter((option) => option !== "Any").map(
                (option) => (
                  <DropdownMenuItem
                    key={option}
                    className={
                      "w-full rounded-md px-4 py-1 text-sm border-none cursor-pointer flex items-center hover:!bg-transparent hover:!border-none hover:!outline-none focus-within:!bg-transparent focus-within:!border-none focus-within:!outline-none bg-transparent text-foreground focus-within:!text-foreground"
                    }
                    aria-pressed={safeFilters.gender === option}
                    tabIndex={0}
                    aria-label={option}
                    onClick={() =>
                      handleValidatedFilterChange({
                        ...safeFilters,
                        gender: option,
                      })
                    }
                  >
                    {option}
                    {safeFilters.gender === option && (
                      <Check
                        className="w-4 h-4 ml-auto text-primary"
                        aria-hidden="true"
                      />
                    )}
                  </DropdownMenuItem>
                ),
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Interests */}
          <DropdownMenu
            open={openDropdown === "interests"}
            onOpenChange={(open) => setOpenDropdown(open ? "interests" : null)}
          >
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className={`rounded-full border-primary/30 bg-card px-4 py-2 text-muted-foreground hover:text-primary  ${
                  openDropdown === "interests" ? "text-primary" : ""
                } font-medium flex items-center justify-between focus:outline-none focus:ring-0 focus:ring-transparent"
                aria-label="Interests filter`}
              >
                Interests
                <ChevronDown className="ml-2 w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="p-3 min-w-[220px] backdrop-blur-2xl bg-white/50 rounded-2xl shadow-md transition-all duration-300 ease-in-out border-none ">
              {INTEREST_OPTIONS.map((interest) => (
                <DropdownMenuItem
                  key={interest}
                  className={
                    "w-full rounded-md px-4 py-1 text-sm border-none cursor-pointer flex items-center hover:!bg-transparent hover:!border-none hover:!outline-none focus-within:!bg-transparent focus-within:!border-none focus-within:!outline-none bg-transparent text-foreground focus-within:!text-foreground"
                  }
                  aria-pressed={safeFilters.interests.includes(interest)}
                  tabIndex={0}
                  aria-label={interest}
                  onClick={(e) => {
                    e.preventDefault();
                    const interests = safeFilters.interests.includes(interest)
                      ? safeFilters.interests.filter((i) => i !== interest)
                      : [...safeFilters.interests, interest];
                    handleValidatedFilterChange({ ...safeFilters, interests });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      const interests = safeFilters.interests.includes(interest)
                        ? safeFilters.interests.filter((i) => i !== interest)
                        : [...safeFilters.interests, interest];
                      handleValidatedFilterChange({
                        ...safeFilters,
                        interests,
                      });
                    }
                  }}
                >
                  {interest}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Personality */}
          <DropdownMenu
            open={openDropdown === "personality"}
            onOpenChange={(open) =>
              setOpenDropdown(open ? "personality" : null)
            }
          >
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className={`rounded-full border-primary/30 bg-card px-4 py-2 text-muted-foreground hover:text-primary  ${
                  openDropdown === "personality" ? "text-primary" : ""
                } font-medium flex items-center justify-between focus:outline-none focus:ring-0 focus:ring-transparent`}
                aria-label="Personality filter"
              >
                {getPersonalityLabel()}
                <ChevronDown className="ml-2 w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="p-3 min-w-[140px] backdrop-blur-2xl bg-white/50 rounded-2xl shadow-md transition-all duration-300 ease-in-out border-none">
              {PERSONALITY_OPTIONS.map((option) => (
                <DropdownMenuItem
                  key={option}
                  className={
                    "w-full rounded-md px-4 py-1 text-sm border-none cursor-pointer flex items-center hover:!bg-transparent hover:!border-none hover:!outline-none focus-within:!bg-transparent focus-within:!border-none focus-within:!outline-none bg-transparent text-foreground focus-within:!text-foreground"
                  }
                  aria-pressed={safeFilters.personality === option}
                  tabIndex={0}
                  aria-label={option}
                  onClick={() =>
                    handleValidatedFilterChange({
                      ...safeFilters,
                      personality: option,
                    })
                  }
                >
                  {option}
                  {safeFilters.personality === option && (
                    <Check
                      className="w-4 h-4 ml-auto text-primary"
                      aria-hidden="true"
                    />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Smoking */}
          <DropdownMenu
            open={openDropdown === "smoking"}
            onOpenChange={(open) => setOpenDropdown(open ? "smoking" : null)}
          >
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className={`rounded-full border-primary/30 bg-card px-4 py-2 text-muted-foreground hover:text-primary  ${
                  openDropdown === "smoking" ? "text-primary" : ""
                } font-medium flex items-center justify-between focus:outline-none focus:ring-0 focus:ring-transparent`}
                aria-label="Smoking filter"
              >
                {getSmokingLabel()}
                <ChevronDown className="ml-2 w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="p-3 min-w-[140px] backdrop-blur-2xl bg-white/50 rounded-2xl shadow-md transition-all duration-300 ease-in-out border-none">
              {SMOKING_OPTIONS.map((option) => (
                <DropdownMenuItem
                  key={option}
                  className={
                    "w-full rounded-md px-4 py-1 text-sm border-none cursor-pointer flex items-center hover:!bg-transparent hover:!border-none hover:!outline-none focus-within:!bg-transparent focus-within:!border-none focus-within:!outline-none bg-transparent text-foreground focus-within:!text-foreground"
                  }
                  aria-pressed={safeFilters.smoking === option}
                  tabIndex={0}
                  aria-label={option}
                  onClick={() =>
                    handleValidatedFilterChange({
                      ...safeFilters,
                      smoking: option,
                    })
                  }
                >
                  {option}
                  {safeFilters.smoking === option && (
                    <Check
                      className="w-4 h-4 ml-auto text-primary"
                      aria-hidden="true"
                    />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Drinking */}
          <DropdownMenu
            open={openDropdown === "drinking"}
            onOpenChange={(open) => setOpenDropdown(open ? "drinking" : null)}
          >
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className={`rounded-full border-primary/30 bg-card px-4 py-2 text-muted-foreground hover:text-primary  ${
                  openDropdown === "drinking" ? "text-primary" : ""
                } font-medium flex items-center justify-between focus:outline-none focus:ring-0 focus:ring-transparent`}
                aria-label="Drinking filter"
              >
                {getDrinkingLabel()}
                <ChevronDown className="ml-2 w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="p-3 min-w-[140px] backdrop-blur-2xl bg-white/50 rounded-2xl shadow-md transition-all duration-300 ease-in-out border-none">
              {DRINKING_OPTIONS.map((option) => (
                <DropdownMenuItem
                  key={option}
                  className={
                    "w-full rounded-md px-4 py-1 text-sm border-none cursor-pointer flex items-center hover:!bg-transparent hover:!border-none hover:!outline-none focus-within:!bg-transparent focus-within:!border-none focus-within:!outline-none bg-transparent text-foreground focus-within:!text-foreground"
                  }
                  aria-pressed={safeFilters.drinking === option}
                  tabIndex={0}
                  aria-label={option}
                  onClick={() =>
                    handleValidatedFilterChange({
                      ...safeFilters,
                      drinking: option,
                    })
                  }
                >
                  {option}
                  {safeFilters.drinking === option && (
                    <Check
                      className="w-4 h-4 ml-auto text-primary"
                      aria-hidden="true"
                    />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Budget Range */}
          <DropdownMenu
            open={openDropdown === "budgetRange"}
            onOpenChange={(open) =>
              setOpenDropdown(open ? "budgetRange" : null)
            }
          >
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className={`rounded-full border-primary/30 bg-card px-4 py-2 text-muted-foreground hover:text-primary  ${
                  openDropdown === "budgetRange" ? "text-primary" : ""
                } font-medium flex items-center justify-between focus:outline-none focus:ring-0 focus:ring-transparent`}
                aria-label="Budget range filter"
              >
                {getBudgetRangeLabel()}
                <ChevronDown className="ml-2 w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="p-3 min-w-[200px] backdrop-blur-2xl bg-white/50 rounded-2xl shadow-md transition-all duration-300 ease-in-out border-none">
              {BUDGET_RANGE_OPTIONS.map((option) => (
                <DropdownMenuItem
                  key={option}
                  className={
                    "w-full rounded-md px-4 py-1 text-sm border-none cursor-pointer flex items-center hover:!bg-transparent hover:!border-none hover:!outline-none focus-within:!bg-transparent focus-within:!border-none focus-within:!outline-none bg-transparent text-foreground focus-within:!text-foreground"
                  }
                  aria-pressed={safeFilters.budgetRange === option}
                  tabIndex={0}
                  aria-label={option}
                  onClick={() =>
                    handleValidatedFilterChange({
                      ...safeFilters,
                      budgetRange: option,
                    })
                  }
                >
                  {option}
                  {safeFilters.budgetRange === option && (
                    <Check
                      className="w-4 h-4 ml-auto text-primary"
                      aria-hidden="true"
                    />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Nationality */}
          <DropdownMenu
            open={openDropdown === "nationality"}
            onOpenChange={(open) =>
              setOpenDropdown(open ? "nationality" : null)
            }
          >
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className={`rounded-full border-primary/30 bg-card px-4 py-2 text-muted-foreground hover:text-primary  ${
                  openDropdown === "nationality" ? "text-primary" : ""
                } font-medium flex items-center justify-between focus:outline-none focus:ring-0 focus:ring-transparent`}
                aria-label="Nationality filter"
              >
                {getNationalityLabel()}
                <ChevronDown className="ml-2 w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="p-3 min-w-[160px] backdrop-blur-2xl bg-white/50 rounded-2xl shadow-md transition-all duration-300 ease-in-out border-none">
              {NATIONALITY_OPTIONS.map((option) => (
                <DropdownMenuItem
                  key={option}
                  className={
                    "w-full rounded-md px-4 py-1 text-sm border-none cursor-pointer flex items-center hover:!bg-transparent hover:!border-none hover:!outline-none focus-within:!bg-transparent focus-within:!border-none focus-within:!outline-none bg-transparent text-foreground focus-within:!text-foreground"
                  }
                  aria-pressed={safeFilters.nationality === option}
                  tabIndex={0}
                  aria-label={option}
                  onClick={() =>
                    handleValidatedFilterChange({
                      ...safeFilters,
                      nationality: option,
                    })
                  }
                >
                  {option}
                  {safeFilters.nationality === option && (
                    <Check
                      className="w-4 h-4 ml-auto text-primary"
                      aria-hidden="true"
                    />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Languages */}
          <DropdownMenu
            open={openDropdown === "languages"}
            onOpenChange={(open) => setOpenDropdown(open ? "languages" : null)}
          >
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className={`rounded-full border-primary/30 bg-card px-4 py-2 text-muted-foreground hover:text-primary  ${
                  openDropdown === "languages" ? "text-primary" : ""
                } font-medium flex items-center justify-between focus:outline-none focus:ring-0 focus:ring-transparent`}
                aria-label="Languages filter"
              >
                {getLanguagesLabel()}
                <ChevronDown className="ml-2 w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="p-3 min-w-[220px] backdrop-blur-2xl bg-white/50 rounded-2xl shadow-md transition-all duration-300 ease-in-out border-none">
              {LANGUAGE_OPTIONS.map((language) => (
                <DropdownMenuItem
                  key={language}
                  className={
                    "w-full rounded-md px-4 py-1 text-sm border-none cursor-pointer flex items-center hover:!bg-transparent hover:!border-none hover:!outline-none focus-within:!bg-transparent focus-within:!border-none focus-within:!outline-none bg-transparent text-foreground focus-within:!text-foreground"
                  }
                  aria-pressed={safeFilters.languages.includes(language)}
                  tabIndex={0}
                  aria-label={language}
                  onClick={(e) => {
                    e.preventDefault();
                    const languages = safeFilters.languages.includes(language)
                      ? safeFilters.languages.filter((l) => l !== language)
                      : [...safeFilters.languages, language];
                    handleValidatedFilterChange({ ...safeFilters, languages });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      const languages = safeFilters.languages.includes(language)
                        ? safeFilters.languages.filter((l) => l !== language)
                        : [...safeFilters.languages, language];
                      handleValidatedFilterChange({
                        ...safeFilters,
                        languages,
                      });
                    }
                  }}
                >
                  {language}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </section>
  );

  return (
    <>
      {isDesktop ? (
        // Desktop: Show original horizontal filters for screens >=1024px
        <DesktopFilters />
      ) : (
        // Mobile: Show filter button that opens modal for screens <1024px
        <div className="flex items-center gap-2">
          <Button
            variant={"outline"}
            onClick={onOpen}
            className="rounded-2xl !px-4 border-primary/30 bg-card text-muted-foreground font-medium"
          >
            <Filter className="w-4 h-4" />
            Filters
            {getActiveFiltersCount() > 0 && (
              <Badge className="ml-2 bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full">
                {getActiveFiltersCount()}
              </Badge>
            )}
          </Button>
          <MobileFiltersModal />
        </div>
      )}
    </>
  );
};

export default React.memo(ExploreFilters);

