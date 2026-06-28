import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AlertTriangle, Clock } from "lucide-react";
import { cn } from "@kovari/utils";

interface EmailHealthProps {
  sent: number;
  pending: number;
  avgDelayMinutes: number;
}

export function EmailHealth({ sent, pending, avgDelayMinutes }: EmailHealthProps) {
  const isHealthy = pending < 10;
  
  return (
    <Card className="h-full border-none shadow-none bg-transparent flex flex-col justify-between !gap-0">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="mb-1">Email Pipeline Health</CardTitle>
            <CardDescription>Status of confirmation email delivery</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!isHealthy && (
          <div className="mb-4 text-xs flex items-center">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Warning: High volume of pending emails ({pending}). Check CRON job logs.</span>
          </div>
        )}
        
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium">Delivered</p>
            <p className="text-xl font-semibold">{sent.toLocaleString()}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium">Queued</p>
            <p className={cn("text-xl font-semibold", !isHealthy && "text-amber-600")}>
              {pending.toLocaleString()}
            </p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <p className="text-xs text-muted-foreground font-medium">Avg Delay</p>
              <Clock className="h-3 w-3 text-muted-foreground" />
            </div>
            <p className="text-xl font-semibold">{avgDelayMinutes}m</p>
          </div>
        </div>

        <div className="mt-4 h-1.5 w-full bg-muted rounded-full overflow-hidden flex">
          <div 
            className="h-full bg-primary" 
            style={{ width: `${(sent / (sent + pending || 1)) * 100}%` }} 
          />
          <div 
            className="h-full bg-amber-500" 
            style={{ width: `${(pending / (sent + pending || 1)) * 100}%` }} 
          />
        </div>
        <div className="mt-4 flex justify-between text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">
           <span>{Math.round((sent / (sent + pending || 1)) * 100)}% Success Rate</span>
           <span>Reliability Threshold: 98%</span>
        </div>
      </CardContent>
    </Card>
  );
}

