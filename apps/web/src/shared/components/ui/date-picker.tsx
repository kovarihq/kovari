"use client";

import {
  eachMonthOfInterval,
  eachYearOfInterval,
  endOfYear,
  format,
  getMonth,
  setMonth,
  setYear,
  startOfYear,
} from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import * as React from "react";
import { DateInterval } from "react-day-picker";

import { Button } from "@/shared/components/ui/button";
import { Calendar } from "@/shared/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { cn } from "@kovari/utils";

interface DatePickerProps {
  startYear?: number;
  endYear?: number;
  date?: Date;
  onDateChange?: (date: Date | undefined) => void;
  disabled?: DateInterval;
  placeholder?: string;
}

export function DatePicker({
  startYear = new Date().getFullYear() - 5,
  endYear = new Date().getFullYear(),
  date: controlledDate,
  onDateChange,
  disabled,
  placeholder = "Pick a date",
}: DatePickerProps) {
  const [date, setDate] = React.useState<Date | undefined>(controlledDate);
  const [month, setMonthInCalendar] = React.useState<Date>(
    controlledDate || new Date()
  );

  React.useEffect(() => {
    setDate(controlledDate);
    if (controlledDate && !isNaN(controlledDate.getTime())) {
      setMonthInCalendar(controlledDate);
    }
  }, [controlledDate]);

  const handleDateChange = (newDate: Date | undefined) => {
    setDate(newDate);
    if (newDate) {
      setMonthInCalendar(newDate);
    }
    onDateChange?.(newDate);
  };

  const handleMonthChange = (monthName: string) => {
    const monthIndex = months.indexOf(monthName);
    const newDate = setMonth(date || new Date(), monthIndex);
    setDate(newDate);
    setMonthInCalendar(newDate);
    onDateChange?.(newDate);
  };

  const handleYearChange = (year: string) => {
    const newDate = setYear(date || new Date(), parseInt(year));
    setDate(newDate);
    setMonthInCalendar(newDate);
    onDateChange?.(newDate);
  };

  // List Months
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  // List Years
  const years = Array.from(
    { length: endYear - startYear + 1 },
    (_, i) => startYear + i
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={"outline"}
          className={cn(
            "w-full pl-3 text-left font-normal h-9 border-border rounded-lg focus:ring-1 focus:ring-transparent bg-transparent hover:bg-transparent",
            !date ? "text-muted-foreground" : "text-foreground"
          )}
        >
          {/* <CalendarIcon className="mr-2 h-4 w-4" /> */}
          {date && !isNaN(date.getTime()) ? (
            format(date, "PPP")
          ) : (
            <span>{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto max-w-[calc(100vw-2rem)] p-0"
        align="center"
        avoidCollisions
        sideOffset={4}
      >
        <div className="flex items-center justify-between p-4 pb-0 gap-2">
          <Select
            onValueChange={handleMonthChange}
            value={months[getMonth(month)]}
          >
            <SelectTrigger className="w-full h-8 text-sm">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {months.map((m) => (
                  <SelectItem key={m} value={m} className="text-sm">
                    {m}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select
            onValueChange={handleYearChange}
            value={String(month.getFullYear())}
          >
            <SelectTrigger className="w-full h-8 text-sm">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent className="max-h-[280px] overflow-y-auto">
              <SelectGroup>
                {years.map((yearValue) => (
                  <SelectItem
                    key={yearValue}
                    value={String(yearValue)}
                    className="text-sm"
                  >
                    {yearValue}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="overflow-auto">
          <Calendar
            mode="single"
            selected={date}
            onSelect={handleDateChange}
            initialFocus
            month={month}
            onMonthChange={setMonthInCalendar}
            fromYear={startYear}
            toYear={endYear}
            disabled={disabled}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

