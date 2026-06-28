import { cn } from "@kovari/utils";
import { 
  Eye, 
  MousePointer2, 
  UserPlus 
} from "lucide-react";

interface FunnelProps {
  data: {
    views: number;
    clicks: number;
    submissions: number;
  };
}

export function Funnel({ data }: FunnelProps) {
  const steps = [
    { 
      label: "Views", 
      value: data.views, 
      color: "bg-primary", 
      icon: Eye,
    },
    { 
      label: "Clicks", 
      value: data.clicks, 
      color: "bg-primary", 
      icon: MousePointer2,
    },
    { 
      label: "Signups", 
      value: data.submissions, 
      color: "bg-primary", 
      icon: UserPlus,
    },
  ];

  const total = steps[0].value || 1;

  return (
    <div className="flex flex-col gap-6 py-2 w-full max-w-[90%] mx-auto">
      {steps.map((step) => {
        const percentageOfTotal = Math.round((step.value / total) * 100);
        const Icon = step.icon;

        return (
          <div key={step.label} className="relative w-full">
            <div className="space-y-2 mb-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2.5">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground/70" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground leading-none">
                    {step.label}
                  </span>
                </div>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest leading-none">
                  Retention
                </span>
              </div>
              <div className="flex justify-between items-baseline pl-6">
                <span className="text-sm font-semibold tracking-tight text-foreground font-sans tabular-nums leading-none">
                  {step.value.toLocaleString()}
                </span>
                <span className="text-sm font-semibold tabular-nums text-foreground leading-none">
                  {percentageOfTotal}%
                </span>
              </div>
            </div>
            
            <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
              <div 
                className={cn(
                  "h-full rounded-full transition-all duration-700 ease-out",
                  step.color
                )} 
                style={{ width: `${percentageOfTotal}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

