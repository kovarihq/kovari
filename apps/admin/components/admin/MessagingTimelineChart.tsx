"use client";

import * as React from "react";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "@/components/ui/chart";
import { DailyMessagingItem } from "@/src/types/analytics";
import { MessageSquare } from "lucide-react";

const chartConfig = {
  messages: {
    label: "Messages Sent",
    color: "var(--color-primary)",
  },
  conversations: {
    label: "Conversations Formed",
    color: "hsl(var(--muted-foreground))",
  },
} satisfies ChartConfig;

interface MessagingTimelineChartProps {
  data: DailyMessagingItem[];
}

export function MessagingTimelineChart({ data }: MessagingTimelineChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-[220px] bg-secondary/10 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-1.5 text-center p-4">
          <MessageSquare className="h-6 w-6 text-muted-foreground/40" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            No Daily Activity Logged
          </span>
          <span className="text-[11px] text-muted-foreground/70">
            Activity trends will display here as messaging events occur.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full border-t border-border bg-card/50 p-4 pt-6 rounded-b-2xl">
      <ChartContainer
        config={chartConfig}
        className="aspect-auto h-[220px] w-full"
      >
        <AreaChart
          data={data}
          margin={{
            left: -20,
            right: 12,
            top: 10,
            bottom: 10,
          }}
        >
          <defs>
            <linearGradient id="fillMessages" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor="var(--color-messages)"
                stopOpacity={0.3}
              />
              <stop
                offset="95%"
                stopColor="var(--color-messages)"
                stopOpacity={0}
              />
            </linearGradient>
            <linearGradient id="fillConversations" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor="var(--color-conversations)"
                stopOpacity={0.2}
              />
              <stop
                offset="95%"
                stopColor="var(--color-conversations)"
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
          <CartesianGrid
            vertical={false}
            strokeDasharray="3 3"
            stroke="hsl(var(--border)/0.4)"
          />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            minTickGap={32}
            style={{
              fontSize: "11px",
              fontWeight: 500,
              fill: "hsl(var(--muted-foreground))",
              letterSpacing: "0.02em",
            }}
            tickFormatter={(value) => {
              try {
                const date = new Date(value);
                return date.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                });
              } catch {
                return value;
              }
            }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            allowDecimals={false}
            style={{
              fontSize: "11px",
              fontWeight: 500,
              fill: "hsl(var(--muted-foreground))",
            }}
            tickFormatter={(value) => `${value}`}
          />
          <ChartTooltip
            cursor={{
              stroke: "var(--color-messages)",
              strokeWidth: 1,
              strokeDasharray: "4 4",
            }}
            content={
              <ChartTooltipContent
                className="bg-card shadow-xl rounded-xl p-3 min-w-[160px] border border-border"
                labelFormatter={(value) => {
                  try {
                    return new Date(value).toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    });
                  } catch {
                    return value;
                  }
                }}
                indicator="line"
              />
            }
          />
          <Area
            dataKey="conversations"
            type="monotone"
            fill="url(#fillConversations)"
            stroke="var(--color-conversations)"
            strokeWidth={2}
            animationDuration={1200}
          />
          <Area
            dataKey="messages"
            type="monotone"
            fill="url(#fillMessages)"
            stroke="var(--color-messages)"
            strokeWidth={2.5}
            animationDuration={1500}
            activeDot={{
              r: 5,
              fill: "var(--color-messages)",
              stroke: "hsl(var(--background))",
              strokeWidth: 2,
            }}
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}
