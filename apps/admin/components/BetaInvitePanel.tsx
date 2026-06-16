"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, Hash, Users, Mail, Compass, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { GroupContainer } from "@/components/ui/ios/GroupContainer";
import { ListRow } from "@/components/ui/ios/ListRow";

type InviteMode = "batch" | "specific";

interface InviteResult {
  sent: number;
  failed: string[];
  already_invited: string[];
  total_processed: number;
}

export function BetaInvitePanel() {
  const [mode, setMode] = useState<InviteMode>("batch");
  const [batchSize, setBatchSize] = useState<number | "">(10);
  const [specificEmails, setSpecificEmails] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InviteResult | null>(null);

  async function handleSendInvites() {
    setLoading(true);
    setResult(null);

    try {
      const body =
        mode === "batch"
          ? { batch_size: Number(batchSize) || 1 }
          : {
              emails: specificEmails
                .split("\n")
                .map((e) => e.trim())
                .filter(Boolean),
            };

      const res = await fetch("/api/admin/send-beta-invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Something went wrong");
        return;
      }

      setResult(data);
      if (data.sent > 0) {
        toast.success(`${data.sent} invite${data.sent !== 1 ? "s" : ""} sent successfully`);
      } else {
        toast.info("No invites sent. Maybe no waitlist users matched the criteria.");
      }
    } catch {
      toast.error("Failed to send invites");
    } finally {
      setLoading(false);
    }
  }

  return (
    <GroupContainer className="w-full shadow-none">
      {/* Row 1: Mode Selector */}
      <ListRow
        icon={<Compass className="text-primary h-4 w-4" />}
        label="Invite Mode"
        secondary="Select method of targeting beta invitees"
        showChevron={false}
        trailing={
          <div className="flex items-center p-0.5 bg-secondary/85 border border-border/40 rounded-lg shrink-0">
            <button
              onClick={() => setMode("batch")}
              className={cn(
                "px-3 py-1 text-sm font-medium rounded-md transition-colors",
                mode === "batch"
                  ? "bg-background text-foreground shadow-sm ring-1 ring-border/20"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Batch
            </button>
            <button
              onClick={() => setMode("specific")}
              className={cn(
                "px-3 py-1 text-sm font-medium rounded-md transition-colors",
                mode === "specific"
                  ? "bg-background text-foreground shadow-sm ring-1 ring-border/20"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Specific
            </button>
          </div>
        }
      />

      {/* Row 2: Configuration */}
      {mode === "batch" ? (
        <>
          <ListRow
            icon={<Hash className="text-primary h-4 w-4" />}
            label="Batch Size"
            secondary="Selects oldest waitlist signups first"
            showChevron={false}
            trailing={
              <Input
                type="number"
                min={1}
                max={500}
                value={batchSize}
                onChange={(e) => setBatchSize(e.target.value ? Number(e.target.value) : "")}
                className="w-20 h-9 text-right text-sm font-medium border-border/80 focus-visible:ring-primary/30 focus-visible:border-primary pr-2.5 rounded-lg"
              />
            }
          />

          <ListRow
            icon={<Users className="text-primary h-4 w-4" />}
            label="Target Status"
            secondary="Targeting only new unregistered leads"
            showChevron={false}
            trailing={
              <span className="text-sm text-primary font-semibold">
                New Signups
              </span>
            }
          />
        </>
      ) : (
        <div className="flex w-full flex-col px-4 py-3 gap-3 bg-card">
          <div className="flex items-center gap-3">
            <Mail className="text-primary h-4 w-4 shrink-0" />
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-sm font-medium leading-tight text-foreground">Email Addresses</span>
              <span className="text-sm text-muted-foreground leading-tight mt-0.5">Enter one email per line</span>
            </div>
          </div>
          <Textarea
            rows={4}
            value={specificEmails}
            onChange={(e) => setSpecificEmails(e.target.value)}
            placeholder="alice@example.com"
            className="w-full text-sm font-medium resize-none h-auto bg-background/50 border-border/80 focus-visible:ring-primary/30 focus-visible:border-primary p-3 rounded-lg leading-relaxed"
          />
        </div>
      )}

      {/* Row 3: Action */}
      <div className="flex w-full min-h-[52px] items-center px-4 py-3 gap-3 bg-card">
        <div className="flex flex-col flex-1 min-w-0">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Action Summary
          </span>
          <span className="text-sm font-medium leading-tight text-foreground mt-0.5">
            {mode === "batch"
              ? `Send up to ${batchSize || 0} invitation emails`
              : `Send to list of target emails`}
          </span>
        </div>
        <Button
          onClick={handleSendInvites}
          disabled={
            loading ||
            (mode === "specific" && !specificEmails.trim()) ||
            (mode === "batch" && !batchSize)
          }
          className="h-9 px-4 text-sm font-semibold rounded-lg shadow-none gap-2 transition-all duration-150 shrink-0 bg-primary hover:bg-primary/95 text-primary-foreground"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
          Send Invites
        </Button>
      </div>

      {/* Row 4: Results (Conditional) */}
      {result && (
        <>
          <ListRow
            icon={<Check className="text-green-500 h-4 w-4" />}
            label="Successfully Sent"
            secondary="Beta invitations delivered"
            showChevron={false}
            trailing={<span className="text-green-600 font-semibold text-sm">{result.sent}</span>}
          />
          {result.already_invited.length > 0 && (
            <ListRow
              icon={<X className="text-muted-foreground h-4 w-4" />}
              label="Already Active / Invited"
              secondary="Users who already have access"
              showChevron={false}
              trailing={<span className="text-muted-foreground font-semibold text-sm">{result.already_invited.length}</span>}
            />
          )}
          {result.failed.length > 0 && (
            <>
              <ListRow
                icon={<X className="text-red-500 h-4 w-4" />}
                label="Failed Deliveries"
                secondary="Could not process invitation"
                showChevron={false}
                trailing={<span className="text-red-500 font-semibold text-sm">{result.failed.length}</span>}
              />
              {result.failed.map((email, i) => (
                <ListRow
                  key={i}
                  icon={<span className="w-1.5 h-1.5 rounded-full bg-red-500/80 ml-1.5" />}
                  label={email}
                  secondary="Delivery rejected"
                  showChevron={false}
                  className="bg-red-500/[0.015]"
                />
              ))}
            </>
          )}
        </>
      )}
    </GroupContainer>
  );
}
