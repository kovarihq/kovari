"use client";

import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SectionRetryButton() {
  const router = useRouter();

  return (
    <Button
      onClick={() => router.refresh()}
      variant="outline"
      size="sm"
      className="bg-card border-border h-8 px-3 rounded-lg gap-2 cursor-pointer transition-all active:scale-[0.98]"
    >
      <RefreshCw className="h-3.5 w-3.5 text-primary" />
      <span className="font-semibold text-[11px]">Retry</span>
    </Button>
  );
}
