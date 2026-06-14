"use client";

import * as React from "react";
import { 
  Mail, 
  Laptop, 
  Smartphone, 
  Search, 
  Users, 
  Loader2, 
  Send, 
  Check, 
  X, 
  AlertCircle,
  FileText,
  HelpCircle
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Checkbox } from "./ui/checkbox";
import { GroupContainer } from "./ui/ios/GroupContainer";
import { ListRow } from "./ui/ios/ListRow";
import { SectionHeader } from "./ui/ios/SectionHeader";
import { SearchInput } from "./ui/ios/SearchInput";
import { toast } from "sonner";
import { useUser } from "@clerk/nextjs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

interface ProfileUser {
  id: string;
  name: string | null;
  username: string | null;
  email: string;
  profile_photo?: string;
}

interface WaitlistEntry {
  id: string;
  email: string;
  status: string;
  source: string | null;
  created_at: string;
}

interface EmailCampaignComposerProps {
  profiles: ProfileUser[];
  waitlist: WaitlistEntry[];
}

type TargetMethod = "registered" | "waitlist_all" | "waitlist_new" | "waitlist_beta" | "manual";

export function EmailCampaignComposer({ profiles = [], waitlist = [] }: EmailCampaignComposerProps) {
  const { user } = useUser();

  // Composer states
  const [fromName, setFromName] = React.useState("Kovari");
  const [subject, setSubject] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [subtitle, setSubtitle] = React.useState("");
  const [emailBody, setEmailBody] = React.useState("");
  const [senderType, setSenderType] = React.useState<"system" | "product" | "personal">("product");
  const [replyToEmail, setReplyToEmail] = React.useState<"support@kovari.in" | "hello@kovari.in" | "navneet@kovari.in">("support@kovari.in");

  React.useEffect(() => {
    if (user?.firstName) {
      setFromName(`${user.firstName} from Kovari`);
    } else {
      setFromName("Kovari");
    }
  }, [user]);
  
  // Targeting states
  const [targetMethod, setTargetMethod] = React.useState<TargetMethod>("registered");
  const [manualEmails, setManualEmails] = React.useState("");
  const [selectedEmails, setSelectedEmails] = React.useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = React.useState("");
  
  // UI states
  const [previewDevice, setPreviewDevice] = React.useState<"desktop" | "mobile">("desktop");
  const [isConfirmOpen, setIsConfirmOpen] = React.useState(false);
  const [isSending, setIsSending] = React.useState(false);
  const [sendingResults, setSendingResults] = React.useState<{
    success: boolean;
    sentCount: number;
    failedCount: number;
    failedRecipients: { email: string; error: string }[];
  } | null>(null);

  // Parse manual input to unique emails
  const parsedManualEmails = React.useMemo(() => {
    if (targetMethod !== "manual" || !manualEmails.trim()) return [];
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    return Array.from(new Set(manualEmails.match(emailRegex) || [])).map(e => e.toLowerCase().trim());
  }, [manualEmails, targetMethod]);

  // Determine selectable pool based on target method
  const selectablePool = React.useMemo(() => {
    if (targetMethod === "registered") {
      return profiles.map(p => ({
        id: p.id,
        email: p.email,
        name: p.name || p.username || "Registered User",
        secondary: p.username ? `@${p.username}` : "No username",
        badge: "Registered",
        badgeColor: "bg-blue-500/10 text-blue-600 border border-blue-200"
      }));
    }
    
    if (targetMethod.startsWith("waitlist")) {
      let list = waitlist;
      if (targetMethod === "waitlist_new") {
        list = waitlist.filter(w => w.status === "new");
      } else if (targetMethod === "waitlist_beta") {
        list = waitlist.filter(w => w.status === "beta_invited" || w.status === "beta_active");
      }
      
      return list.map(w => {
        let statusColor = "bg-amber-500/10 text-amber-600 border border-amber-200";
        if (w.status === "beta_invited") {
          statusColor = "bg-purple-500/10 text-purple-600 border border-purple-200";
        } else if (w.status === "beta_active") {
          statusColor = "bg-green-500/10 text-green-600 border border-green-200";
        }
        
        return {
          id: w.id,
          email: w.email,
          name: w.email,
          secondary: `Joined ${new Date(w.created_at).toLocaleDateString()} via ${w.source || "direct"}`,
          badge: w.status.replace("_", " "),
          badgeColor: statusColor
        };
      });
    }

    return [];
  }, [targetMethod, profiles, waitlist]);

  // Filter pool based on search query
  const filteredPool = React.useMemo(() => {
    if (!searchQuery.trim()) return selectablePool;
    const q = searchQuery.toLowerCase().trim();
    return selectablePool.filter(
      item => item.email.toLowerCase().includes(q) || item.name.toLowerCase().includes(q) || item.secondary.toLowerCase().includes(q)
    );
  }, [selectablePool, searchQuery]);

  // Automatically select all in pool when target method changes
  React.useEffect(() => {
    const emails = selectablePool.map(item => item.email);
    setSelectedEmails(new Set(emails));
    setSearchQuery("");
  }, [targetMethod, selectablePool]);

  const handleToggleEmail = (email: string) => {
    setSelectedEmails(prev => {
      const next = new Set(prev);
      if (next.has(email)) {
        next.delete(email);
      } else {
        next.add(email);
      }
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    setSelectedEmails(prev => {
      const next = new Set(prev);
      filteredPool.forEach(item => next.add(item.email));
      return next;
    });
  };

  const handleDeselectAllFiltered = () => {
    setSelectedEmails(prev => {
      const next = new Set(prev);
      filteredPool.forEach(item => next.delete(item.email));
      return next;
    });
  };

  // Compute final recipients array to submit
  const finalRecipients = React.useMemo(() => {
    if (targetMethod === "manual") {
      return parsedManualEmails;
    }
    // Filter selected emails to make sure they belong to the current pool
    const poolEmails = new Set(selectablePool.map(item => item.email));
    return Array.from(selectedEmails).filter(email => poolEmails.has(email));
  }, [targetMethod, selectedEmails, selectablePool, parsedManualEmails]);

  // Form validations
  const isFormValid = fromName.trim() && subject.trim() && emailBody.trim() && finalRecipients.length > 0;

  // Real-time body text layout converter
  const parsedPreviewBodyHtml = React.useMemo(() => {
    if (!emailBody.trim()) {
      return `<p style="color: #94a3b8; font-style: italic; margin: 0;">Start writing your email body content in the editor to see the live layout preview here...</p>`;
    }
    
    return emailBody
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => {
        // Escape HTML
        let text = p
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");
        
        // Auto convert links
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        text = text.replace(urlRegex, '<a href="$1" style="color: #2563eb; font-weight: 500; text-decoration: underline;" target="_blank">$1</a>');
        
        // Bold formatting **text**
        text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        
        // Replace newlines inside paragraph with <br />
        text = text.replace(/\n/g, '<br />');
        
        return `<p style="margin: 0 0 24px; font-size: 12px; line-height: 22px; color: #374151;">${text}</p>`;
      })
      .join("");
  }, [emailBody]);

  const handleSendEmails = async () => {
    setIsConfirmOpen(false);
    setIsSending(true);
    setSendingResults(null);

    const payload = {
      fromName: fromName.trim(),
      subject: subject.trim(),
      title: title.trim(),
      subtitle: subtitle.trim() || undefined,
      emailBody: emailBody.trim(),
      recipients: finalRecipients,
      senderType,
      replyToEmail,
    };

    try {
      const res = await fetch("/api/admin/send-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to send emails");
      }

      const result = await res.json();
      setSendingResults({
        success: true,
        sentCount: result.sentCount,
        failedCount: result.failedCount,
        failedRecipients: result.failedRecipients || [],
      });
      
      toast.success(`Email blast completed! Sent: ${result.sentCount}, Failed: ${result.failedCount}`);
      
      // Reset composer inputs on complete success
      if (result.failedCount === 0) {
        setSubject("");
        setTitle("");
        setSubtitle("");
        setEmailBody("");
        setSelectedEmails(new Set());
        setManualEmails("");
        setSenderType("product");
        setReplyToEmail("support@kovari.in");
        if (user?.firstName) {
          setFromName(`${user.firstName} from Kovari`);
        } else {
          setFromName("Kovari");
        }
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "An error occurred while launching campaign");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Email Campaigns</h1>
          <p className="text-md text-muted-foreground">Send custom announcements and updates via Brevo</p>
        </div>
      </div>

      {/* Main split-screen panel */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left Side: Composer and Target Picker */}
        <div className="xl:col-span-7 space-y-6">
          <div className="rounded-xl border border-border bg-card p-6 shadow-none space-y-5">
            <div className="flex items-center gap-2 border-b border-border pb-3">
              <Mail className="h-4 w-4 text-primary" />
              <h2 className="font-semibold text-foreground text-sm uppercase tracking-wider">Email Details</h2>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">
                    Sender Address
                  </label>
                  <select
                    value={senderType}
                    onChange={(e) => setSenderType(e.target.value as any)}
                    className="w-full rounded-xl h-10 border border-border bg-background px-3 text-xs font-medium focus-visible:ring-1 focus-visible:ring-primary focus:outline-none shadow-none cursor-pointer"
                  >
                    <option value="product">hello@kovari.in (Product)</option>
                    <option value="personal">navneet@kovari.in (Personal)</option>
                    <option value="system">noreply@kovari.in (System)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">
                    Reply-To Address
                  </label>
                  <select
                    value={replyToEmail}
                    onChange={(e) => setReplyToEmail(e.target.value as any)}
                    className="w-full rounded-xl h-10 border border-border bg-background px-3 text-xs font-medium focus-visible:ring-1 focus-visible:ring-primary focus:outline-none shadow-none cursor-pointer"
                  >
                    <option value="support@kovari.in">support@kovari.in (Support)</option>
                    <option value="hello@kovari.in">hello@kovari.in (Hello)</option>
                    <option value="navneet@kovari.in">navneet@kovari.in (Personal)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">
                    From Name <span className="text-destructive">*</span>
                  </label>
                  <Input
                    placeholder="e.g., Navneet from Kovari"
                    value={fromName}
                    onChange={(e) => setFromName(e.target.value)}
                    className="rounded-xl h-10 border-border bg-background focus-visible:ring-1 focus-visible:ring-primary shadow-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">
                    Subject Line <span className="text-destructive">*</span>
                  </label>
                  <Input
                    placeholder="e.g., Exciting updates about Kovari closed beta!"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="rounded-xl h-10 border-border bg-background focus-visible:ring-1 focus-visible:ring-primary shadow-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">
                    Card Title (Optional)
                  </label>
                  <Input
                    placeholder="e.g., Welcome to the Kovari Beta (optional)"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="rounded-xl h-10 border-border bg-background focus-visible:ring-1 focus-visible:ring-primary shadow-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">
                    Card Subtitle (Optional)
                  </label>
                  <Input
                    placeholder="e.g., A new way to explore solo travel"
                    value={subtitle}
                    onChange={(e) => setSubtitle(e.target.value)}
                    className="rounded-xl h-10 border-border bg-background focus-visible:ring-1 focus-visible:ring-primary shadow-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">
                    Email Body Content <span className="text-destructive">*</span>
                  </label>
                  <span className="text-[10px] font-medium text-muted-foreground">
                    Use **text** for bold, URLs are auto-linked
                  </span>
                </div>
                <Textarea
                  placeholder="Write your email body here. Use double returns (press Enter twice) to create paragraphs..."
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  rows={8}
                  className="rounded-xl border-border bg-background focus-visible:ring-1 focus-visible:ring-primary shadow-none resize-y min-h-[160px] leading-relaxed"
                />
              </div>
            </div>
          </div>

          {/* Target Audience Card */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-none space-y-5">
            <div className="flex items-center gap-2 border-b border-border pb-3">
              <Users className="h-4 w-4 text-primary" />
              <h2 className="font-semibold text-foreground text-sm uppercase tracking-wider">Target Audience</h2>
            </div>

            {/* Target Method Tab Grid */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {[
                { id: "registered", label: "Registered Users" },
                { id: "waitlist_all", label: "Waitlist (All)" },
                { id: "waitlist_new", label: "Waitlist (New)" },
                { id: "waitlist_beta", label: "Waitlist (Invited)" },
                { id: "manual", label: "Manual Input" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setTargetMethod(tab.id as TargetMethod)}
                  className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                    targetMethod === tab.id
                      ? "bg-background text-primary border-primary shadow-none"
                      : "bg-background text-foreground border-border"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {targetMethod === "manual" ? (
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">
                  Manual Email Addresses
                </label>
                <Textarea
                  placeholder="Paste comma, space, or newline separated email addresses here..."
                  value={manualEmails}
                  onChange={(e) => setManualEmails(e.target.value)}
                  rows={4}
                  className="rounded-xl border-border bg-background focus-visible:ring-1 focus-visible:ring-primary shadow-none leading-relaxed"
                />
                {parsedManualEmails.length > 0 && (
                  <div className="text-xs font-medium text-green-600 flex items-center gap-1 ml-1 animate-fade-in">
                    <Check className="h-3.5 w-3.5" />
                    Parsed {parsedManualEmails.length} unique valid email{parsedManualEmails.length > 1 ? "s" : ""}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {/* Search and Checkbox Quick Actions */}
                <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Filter users..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="rounded-xl pl-9 h-9 border-border bg-background focus-visible:ring-1 focus-visible:ring-primary shadow-none text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={handleSelectAllFiltered}
                      className="rounded-lg h-9 border-border bg-background text-xs font-medium shadow-none cursor-pointer"
                    >
                      Select All Filtered
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={handleDeselectAllFiltered}
                      className="rounded-lg h-9 border-border bg-background text-xs font-medium shadow-none cursor-pointer"
                    >
                      Clear Filtered
                    </Button>
                  </div>
                </div>

                {/* Recipient Count Indicator */}
                <div className="flex justify-between items-center text-xs font-semibold px-1 text-muted-foreground">
                  <span>Showing {filteredPool.length} of {selectablePool.length} candidates</span>
                  <span className="text-primary font-bold">
                    {finalRecipients.length} Selected
                  </span>
                </div>

                {/* Scrollable Checkbox List */}
                <div className="max-h-[260px] overflow-y-auto border border-border rounded-xl bg-background divide-y divide-border/60">
                  {filteredPool.length === 0 ? (
                    <div className="py-12 text-center text-xs text-muted-foreground font-medium">
                      No candidates match your search
                    </div>
                  ) : (
                    filteredPool.map((item) => {
                      const isChecked = selectedEmails.has(item.email);
                      return (
                        <div 
                          key={item.id}
                          onClick={() => handleToggleEmail(item.email)}
                          className="flex items-center justify-between p-3.5 hover:bg-secondary/40 transition-colors cursor-pointer select-none"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={() => handleToggleEmail(item.email)}
                              onClick={(e) => e.stopPropagation()} // Prevent double trigger
                              className="rounded-md border-border h-4 w-4 shrink-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:ring-0 data-[state=checked]:bg-primary"
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-foreground truncate">{item.name}</p>
                              <p className="text-[11px] text-muted-foreground truncate">{item.email} • {item.secondary}</p>
                            </div>
                          </div>
                          <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border shrink-0 ${item.badgeColor}`}>
                            {item.badge}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Action Trigger Row */}
            <div className="flex justify-end items-center gap-3 mt-2">
              <Button
                variant="outline"
                disabled={isSending}
                onClick={() => {
                  setSubject("");
                  setTitle("");
                  setSubtitle("");
                  setEmailBody("");
                  setSelectedEmails(new Set());
                  setManualEmails("");
                  toast.success("Composer inputs cleared");
                }}
                className="rounded-xl h-10 border-border bg-card shadow-none font-medium px-5 cursor-pointer disabled:opacity-50"
              >
                Reset
              </Button>
              <Button
                disabled={!isFormValid || isSending}
                onClick={() => setIsConfirmOpen(true)}
                className="rounded-xl h-10 bg-primary text-white shadow-none font-semibold px-6 gap-2 hover:bg-primary/95 cursor-pointer disabled:opacity-50"
              >
                {isSending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending Blast...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Send Campaign to {finalRecipients.length} User{finalRecipients.length !== 1 ? "s" : ""}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Right Side: Interactive Live Layout Preview */}
        <div className="xl:col-span-5 space-y-4 sticky top-6">

          {/* Preview Viewport Container */}
          <div className="border border-border rounded-xl bg-card shadow-none p-6 flex flex-col gap-6 min-h-[500px] overflow-hidden transition-all duration-300">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <h2 className="font-semibold text-foreground text-sm uppercase tracking-wider">Live Layout Preview</h2>
              </div>

              {/* Responsive Viewport Buttons */}
              <div className="flex items-center bg-card border border-border p-1 rounded-lg shadow-none">
                <button
                  type="button"
                  onClick={() => setPreviewDevice("desktop")}
                  className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                    previewDevice === "desktop" ? "bg-secondary text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                  title="Desktop View"
                >
                  <Laptop className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewDevice("mobile")}
                  className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                    previewDevice === "mobile" ? "bg-secondary text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                  title="Mobile View"
                >
                  <Smartphone className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="flex-1 flex items-center justify-center w-full">
              {previewDevice === "mobile" ? (
                // iPhone Mockup Frame
                <div className="w-[310px] h-[640px] border-[5px] border-slate-950 bg-[#f9fafb] rounded-[48px] shadow-none relative overflow-hidden flex flex-col">
                  {/* Dynamic Island */}
                  <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-23 h-6 bg-black rounded-full z-20 flex items-center justify-center border border-neutral-800/10" />
                  {/* Home Indicator */}
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-28 h-1.5 bg-neutral-500 rounded-full z-20" />
                  {/* Screen content */}
                  <div className="flex-1 overflow-y-auto pt-14 pb-8 px-4 select-none h-full">
                    <PreviewCard title={title} subtitle={subtitle} bodyHtml={parsedPreviewBodyHtml} isMobile={true} />
                  </div>
                </div>
              ) : (
                // Desktop Viewport
                <div className="w-full bg-slate-50 rounded-lg p-6 overflow-y-auto max-h-[660px] flex justify-center border border-border/40">
                  <div className="w-full max-w-[460px]">
                    <PreviewCard title={title} subtitle={subtitle} bodyHtml={parsedPreviewBodyHtml} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <DialogContent className="rounded-2xl border-none p-6 shadow-xl max-w-md sm:max-w-md bg-card">
          <DialogHeader className="gap-2.5">
            <div className="h-10 w-10 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto sm:mx-0 text-amber-600">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div className="space-y-1.5 text-center sm:text-left">
              <DialogTitle className="text-lg font-bold">Confirm Email Dispatch</DialogTitle>
              <DialogDescription className="text-sm">
                You are about to launch an email blast using Brevo. This will send a customized email to <span className="font-semibold text-primary">{finalRecipients.length} recipients</span>.
              </DialogDescription>
            </div>
          </DialogHeader>

          {/* Quick Summary Block */}
          <div className="my-1 rounded-xl bg-secondary/40 border border-border/40 p-4 space-y-2.5 text-xs text-muted-foreground">
            <p><strong className="text-foreground">From Name:</strong> {fromName}</p>
            <p><strong className="text-foreground">Sender Email:</strong> {senderType === "product" ? "hello@kovari.in" : senderType === "personal" ? "navneet@kovari.in" : "noreply@kovari.in"}</p>
            <p><strong className="text-foreground">Reply-To Email:</strong> {replyToEmail}</p>
            <p><strong className="text-foreground">Subject Line:</strong> {subject}</p>
            <p><strong className="text-foreground">Card Title:</strong> {title}</p>
            {subtitle && <p><strong className="text-foreground">Card Subtitle:</strong> {subtitle}</p>}
            <p><strong className="text-foreground">Audience Channel:</strong> {
              targetMethod === "registered" ? "All Registered Users" :
              targetMethod === "waitlist_all" ? "Waitlist (All)" :
              targetMethod === "waitlist_new" ? "Waitlist (New)" :
              targetMethod === "waitlist_beta" ? "Waitlist (Invited/Active)" : "Manual Recipient List"
            }</p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button
              variant="outline"
              type="button"
              onClick={() => setIsConfirmOpen(false)}
              className="rounded-xl h-10 border-border bg-background shadow-none font-medium cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSendEmails}
              className="rounded-xl h-10 bg-primary text-white shadow-none font-semibold px-5 hover:bg-primary/95 cursor-pointer"
            >
              Confirm and Launch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Campaign Results Dialog */}
      {sendingResults && (
        <Dialog open={!!sendingResults} onOpenChange={() => setSendingResults(null)}>
          <DialogContent className="rounded-2xl border-none p-6 shadow-xl max-w-lg bg-card">
            <DialogHeader className="gap-2">
              <div className="h-10 w-10 bg-green-500/10 rounded-full flex items-center justify-center text-green-600">
                <Check className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold">Campaign Status: Completed</DialogTitle>
                <DialogDescription className="text-sm">
                  Bulk email operation completed. See dispatch reports below:
                </DialogDescription>
              </div>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-4 py-2 text-center">
              <div className="p-3 bg-green-500/5 border border-green-500/10 rounded-xl">
                <p className="text-[10px] uppercase font-bold text-green-600 tracking-wider">Emails Delivered</p>
                <p className="text-2xl font-bold text-green-600 mt-1">{sendingResults.sentCount}</p>
              </div>
              <div className={`p-3 border rounded-xl ${
                sendingResults.failedCount > 0 
                  ? "bg-red-500/5 border-red-500/10" 
                  : "bg-secondary/40 border-border/40"
              }`}>
                <p className={`text-[10px] uppercase font-bold tracking-wider ${
                  sendingResults.failedCount > 0 ? "text-red-500" : "text-muted-foreground"
                }`}>Emails Failed</p>
                <p className={`text-2xl font-bold mt-1 ${
                  sendingResults.failedCount > 0 ? "text-red-500" : "text-foreground"
                }`}>{sendingResults.failedCount}</p>
              </div>
            </div>

            {sendingResults.failedCount > 0 && (
              <div className="space-y-2.5">
                <p className="text-xs font-semibold text-foreground">Delivery Exceptions:</p>
                <div className="max-h-[160px] overflow-y-auto border border-red-500/10 rounded-xl bg-red-500/5 p-3 space-y-2 divide-y divide-red-500/10">
                  {sendingResults.failedRecipients.map((err, idx) => (
                    <div key={idx} className="text-[11px] pt-1.5 first:pt-0 flex justify-between gap-4 font-mono">
                      <span className="text-foreground truncate font-semibold">{err.email}</span>
                      <span className="text-red-600 shrink-0">{err.error}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <DialogFooter className="mt-4">
              <Button
                onClick={() => setSendingResults(null)}
                className="rounded-xl h-10 bg-primary text-white shadow-md font-semibold px-6 hover:bg-primary/95 cursor-pointer w-full"
              >
                Close Summary
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// Inner helper component for previewing the email HTML layout
interface PreviewCardProps {
  title: string;
  subtitle?: string;
  bodyHtml: string;
  isMobile?: boolean;
}

function PreviewCard({ title, subtitle, bodyHtml, isMobile = false }: PreviewCardProps) {
  return (
    <div className="w-full text-left font-sans select-none" style={{ backgroundColor: "#f9fafb", padding: isMobile ? "16px 0" : "24px 16px" }}>
      {/* Kovari Brand Header */}
      <div style={{ padding: "0 0 24px", textAlign: "center" }}>
        <img 
          src="/logo.webp" 
          alt="Kovari" 
          style={{ display: "inline-block", width: "80px", maxWidth: "100%", height: "auto", border: "none", outline: "none" }}
        />
      </div>

      {/* Main Email Layout Container Card */}
      <div style={{ backgroundColor: "#ffffff", borderRadius: "12px", overflow: "hidden", padding: isMobile ? "24px 22px" : "40px", boxSizing: "border-box" }}>
        {title && (
          <h1 style={{ margin: "0 0 24px", fontSize: "12px", fontWeight: 500, color: "#111827", letterSpacing: "-0.5px", textAlign: "center", lineHeight: "26px" }}>
            {title}
          </h1>
        )}
        
        {subtitle && (
          <p style={{ margin: "-16px 0 24px", fontSize: "12px", lineHeight: "22px", color: "#6b7280", textAlign: "center" }}>
            {subtitle}
          </p>
        )}

        <div dangerouslySetInnerHTML={{ __html: bodyHtml }} style={{fontSize: "14px", lineHeight: "18px"}} />
      </div>

      {/* Footer Copy */}
      <div style={{ padding: "32px 20px", textAlign: "center", color: "#6b7280", fontSize: "11px", lineHeight: "18px" }}>
        <p style={{ margin: "0 0 8px" }}>&copy; {new Date().getFullYear()} Kovari. All rights reserved.</p>
      </div>
    </div>
  );
}
