"use client";

import React, { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import {
  ShieldCheck,
  AlertTriangle,
  FileText,
  PhoneCall,
  CheckCircle2,
  Clock,
  Search,
  MessageSquareWarning,
  Link as LinkIcon,
  Shield,
  Eye,
  Lock,
  User,
  Users,
  MapPin,
  HeartHandshake,
  ChevronRight,
  LineChart,
  ChevronLeft,
  XCircle,
  X,
  ImageIcon,
  AlignLeft,
  ExternalLink,
  Link,
  ArrowUpRight
} from "lucide-react";
import { useMyReports, ReportStatus } from "@/shared/hooks/useMyReports";
import { Spinner } from "@heroui/react";
import { useToast } from "@/shared/hooks/use-toast";
import { cn } from "@kovari/utils";
import { ReportDialog } from "@/shared/components/ReportDialog";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/shared/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { UserAvatarFallback } from "@/shared/components/UserAvatarFallback";
import { MobileBackNav } from "@/shared/components/layout/mobile-back-nav";

interface Target {
  id: string;
  name: string;
  imageUrl?: string;
  username?: string;
}

// Helper for formatting dates
function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function SafetyPage() {
  const { user, isLoaded } = useUser();
  const { reports, loading: reportsLoading, error: reportsError, refetch: refetchReports } = useMyReports();
  const { toast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  // Navigation states
  const [activeView, setActiveView] = useState<"main" | "search" | "reports">("main");
  
  // Custom states for report flow natively on the page
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
  const [reportTargetType, setReportTargetType] = useState<"user" | "group">("user");
  const [selectedTargetId, setSelectedTargetId] = useState<string>("");
  const [selectedTargetName, setSelectedTargetName] = useState<string>("");

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Target[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    
    // Fetch user profile verified status
    const fetchProfileStatus = async () => {
      try {
        const res = await fetch("/api/profile/current");
        if (res.ok) {
          const data = await res.json();
          // Assuming the API returns a 'verified' field in the profile data wrapper
          setIsVerified(!!data.data?.verified);
        }
      } catch (err) {
        console.error("Failed to fetch profile status:", err);
      }
    };
    
    if (user) {
      fetchProfileStatus();
    }
  }, [user]);

  // Search effect
  useEffect(() => {
    if (activeView !== "search") {
      setSearchError(null);
      return;
    }

    const fetchTargets = async (q: string) => {
      setSearchLoading(true);
      setSearchError(null);
      try {
        const res = await fetch(`/api/reports/targets?type=${reportTargetType}&q=${encodeURIComponent(q)}`);
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        setSearchResults(data.targets || []);
      } catch (err) {
        setSearchError("Error loading " + (reportTargetType === "user" ? "users" : "groups"));
      } finally {
        setSearchLoading(false);
      }
    };

    const delayDebounceFn = setTimeout(() => {
      fetchTargets(searchQuery);
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, activeView, reportTargetType]);

  const handleOpenReport = (type: "user" | "group") => {
    setReportTargetType(type);
    setSearchQuery("");
    setSearchResults([]);
    setActiveView("search");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSelectTarget = (id: string, name: string) => {
    setSelectedTargetId(id);
    setSelectedTargetName(name);
    // slight delay for touch feedback before overlay pops up
    setTimeout(() => {
      setIsReportDialogOpen(true);
    }, 150);
  };

  const handleCopyProfileLink = () => {
    if (user) {
      const link = `${window.location.origin}/profile/${user.id}`;
      navigator.clipboard.writeText(link);
      toast({
        title: "Link Copied",
        description: "Your profile link has been copied.",
      });
    }
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-background pb-10 font-sans">
      {/* Mobile back nav */}
      <MobileBackNav title="Safety & Trust" fallbackHref="/dashboard" />
      
      <div className="max-w-full mx-auto px-5 sm:px-5 relative z-20">
        <AnimatePresence mode="wait" initial={false}>
          {activeView === "main" ? (
            <motion.div
              key="main-view"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="space-y-10"
            >
              {/* 1. HEADER (True iOS System Settings Hero) */}
              <section className="px-4 pt-10 pb-2 flex flex-col items-center text-center">
                <ShieldCheck className="w-10 h-10 text-primary mb-3" strokeWidth={1.5} />
                <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground mb-3">
                  Safety &amp; Trust
                </h1>
                <p className="text-sm text-muted-foreground max-w-xs md:max-w-md mx-auto leading-relaxed">
                  Reports are manually reviewed to ensure a respectful and secure environment.
                </p>
              </section>

              {/* 2. ACTIONS (iOS Grouped List) */}
        <section className="animate-in fade-in slide-in-from-bottom-2 duration-700 delay-100 ease-out fill-mode-both">
          <SectionTitle title="Actions" />
          <div className="bg-card rounded-xl overflow-hidden border border-border/40">
            <div className="divide-y divide-border/40">
              <ListRow 
                icon={AlertTriangle} 
                iconBg=" text-foreground"
                label="Report a User"
                onClick={() => handleOpenReport("user")}
              />
              <ListRow 
                icon={AlertTriangle} 
                iconBg=" text-foreground"
                label="Report a Group"
                onClick={() => handleOpenReport("group")}
              />
              <ListRow 
                icon={FileText} 
                iconBg="text-foreground"
                label="View My Reports"
                onClick={() => {
                  setActiveView("reports");
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              />
              <ListRow 
                icon={PhoneCall} 
                iconBg="bg-destructive/10 text-destructive"
                label="Emergency Help"
                isDestructive={true}
                onClick={() => {
                  document.getElementById("emergency")?.scrollIntoView({ behavior: "smooth" });
                }}
              />
            </div>
          </div>
        </section>

        {/* 3. ACCOUNT STATUS (Compact Row Info) */}
        <section className="animate-in fade-in slide-in-from-bottom-2 duration-700 delay-200 ease-out fill-mode-both">
          <SectionTitle title="Your Status" />
          <div className="bg-card rounded-xl overflow-hidden border border-border/40">
            <div className="divide-y divide-border/40">
              <div className="flex items-center justify-between p-3 bg-card">
                <div className="flex items-center gap-4">
                  <div className="p-1.5 rounded-lg  text-foreground">
                    <ShieldCheck className="w-4 h-4" strokeWidth={1.5} />
                  </div>
                  <span className="text-base text-foreground">Identity Level</span>
                </div>
                {isVerified ? (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 bg-green-500/10 rounded-md">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-sm shadow-green-500/20" />
                    <span className="text-sm text-green-700 dark:text-green-500 font-medium tracking-wide">Verified</span>
                  </div>
                ) : (
                  <span className="text-base text-muted-foreground mr-1">Unverified</span>
                )}
              </div>

              <div className="flex items-center justify-between p-3 bg-card">
                <div className="flex items-center gap-4">
                  <div className="p-1.5 rounded-lg  text-foreground">
                    <Clock className="w-4 h-4" strokeWidth={1.5} />
                  </div>
                  <span className="text-base text-foreground">Member Since</span>
                </div>
                <span className="text-base text-muted-foreground mr-1">
                  {isLoaded && user && user.createdAt ? formatDate(user.createdAt.toString()) : "Recently"}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* 4. REPORT FLOW (Informational list) */}
        <section className="animate-in fade-in slide-in-from-bottom-2 duration-700 delay-300 ease-out fill-mode-both">
           <SectionTitle title="How Reporting Works" />
           <div className="bg-card rounded-xl overflow-hidden border border-border/40">
             <div className="divide-y divide-border/40">
              {[
                { icon: AlertTriangle, title: "1. Submission", desc: "Flag unsafe behavior securely." },
                { icon: Search, title: "2. Investigation", desc: "Moderators review evidence within 24h." },
                { icon: Shield, title: "3. Action Taken", desc: "Violators face warnings or bans." },
                { icon: CheckCircle2, title: "4. Resolution", desc: "You are notified of the outcome." },
              ].map((step, idx) => (
                <div key={idx} className="flex gap-4 items-center p-4 px-6 bg-card">
                  <div className="flex flex-col gap-0.5">
                    <h3 className="text-base text-foreground font-medium">{step.title}</h3>
                    <p className="text-sm text-muted-foreground">{step.desc}</p>
                  </div>
                </div>
              ))}
             </div>
             <div className="px-6 py-3 border-t border-border/40 bg-card">
               <p className="text-sm text-muted-foreground leading-relaxed">
                 Reporting and enforcement are governed by our{" "}
                 <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">Terms of Service</a>
                 {" "}and{" "}
                 <a href="/community-guidelines" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">Community Guidelines</a>.
               </p>
             </div>
           </div>
        </section>


        {/* 6. INFORM: Safety Tips (iOS Notes style) */}
        <section className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-700 delay-500 ease-out fill-mode-both">
          <div>
            <SectionTitle title="Solo Travel Guidelines" />
            <div className="bg-card rounded-xl p-4 border border-border/40">
              <ul className="space-y-4">
                <TipRow text="Share full itinerary with a trusted friend" />
                <TipRow text="Research local emergency numbers" />
                <TipRow text="Leave quietly if you feel uncomfortable" />
              </ul>
            </div>
          </div>

          <div>
            <SectionTitle title="Group Travel Guidelines" />
            <div className="bg-card rounded-xl p-4 border border-border/40">
              <ul className="space-y-4">
                <TipRow text="Meet in a public space before departing" />
                <TipRow text="Discuss budgets and styles clearly upfront" />
                <TipRow text="Avoid sharing sensitive financial info" />
              </ul>
            </div>
          </div>

          <div>
            <SectionTitle title="Real-Life Meetings" />
            <div className="bg-card rounded-xl p-4 border border-border/40">
              <ul className="space-y-4">
                <TipRow text="First meeting must be in a well-lit cafe" />
                <TipRow text="Arrange your own independent transport" />
                <TipRow text="Text a friend when arriving and leaving" />
              </ul>
            </div>
          </div>
        </section>

        {/* 7. PROTECT: Emergency Help (iOS Settings Contact Style) */}
        <section id="emergency" className="scroll-mt-32 animate-in fade-in slide-in-from-bottom-2 duration-700 delay-500 ease-out fill-mode-both">
          <SectionTitle title="Emergency Contact" />
          <div className="bg-card rounded-xl overflow-hidden border border-border/40">
            <div className="p-4 px-6 border-b border-border/40">
              <p className="text-sm text-muted-foreground leading-relaxed">
                If in immediate danger, contact local authorities immediately.
              </p>
            </div>
            
            <div className="divide-y divide-border/40">
              <a href="tel:112" className="flex items-center justify-between p-4 px-6 hover:/50 transition-colors duration-150 hover:bg-secondary">
                <div className="flex flex-col gap-0.5">
                  <h4 className="text-base text-foreground">National Emergency</h4>
                  <p className="text-base text-destructive">112</p>
                </div>
                <PhoneCall className="w-4 h-4 text-destructive" strokeWidth={1.5} />
              </a>

              <a href="tel:1091" className="flex items-center justify-between p-4 px-6 hover:/50 transition-colors duration-150 hover:bg-secondary">
                <div className="flex flex-col gap-0.5">
                  <h4 className="text-base text-foreground">Women Helpline</h4>
                  <p className="text-base text-destructive">1091</p>
                </div>
                <PhoneCall className="w-4 h-4 text-destructive" strokeWidth={1.5} />
              </a>
              
              <button 
                className="w-full flex items-center justify-between p-4 px-6 hover:/50 transition-colors duration-150 hover:bg-secondary text-left"
                onClick={handleCopyProfileLink}
              >
                <div className="flex flex-col gap-0.5">
                  <h4 className="text-base text-primary">Copy Profile Link</h4>
                  <p className="text-sm text-muted-foreground">For providing to authorities</p>
                </div>
                <LinkIcon className="w-4 h-4 text-primary" strokeWidth={1.5} />
              </button>
            </div>
          </div>
        </section>

        {/* 8. Trust Footer */}
        <section className="pt-8 pb-4 flex items-center justify-center animate-in fade-in duration-1000 delay-500">
          <div className="flex items-center gap-x-3 text-xs text-muted-foreground uppercase tracking-widest">
             <div className="flex items-center gap-1.5">
               <Eye className="w-3.5 h-3.5 opacity-60" strokeWidth={1.5} /> Reviewed
             </div>
             <div className="w-1 h-1 rounded-full bg-muted" />
             <div className="flex items-center gap-1.5">
               <Lock className="w-3.5 h-3.5 opacity-60" strokeWidth={1.5} /> Encrypted
             </div>
          </div>
        </section>
      </motion.div>
    ) : activeView === "search" ? (
      <motion.div
        key="search-view"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        transition={{ duration: 0.25, ease: "easeInOut" }}
        className="space-y-6 min-h-[50vh]"
      >
        <div className="flex items-center justify-between mb-2 pt-4 sm:pt-5">
           <button 
             onClick={() => setActiveView("main")}
             className="flex items-center gap-1 text-primary"
           >
             <ChevronLeft className="w-4 h-4" strokeWidth={2} />
             <span className="text-sm font-medium">Safety</span>
           </button>
        </div>

        <div className="px-1">
           <h2 className="text-sm sm:text-md font-semibold text-foreground mb-1">
             Report a {reportTargetType === "user" ? "User" : "Group"}
           </h2>
           <p className="text-xs sm:text-sm text-muted-foreground mb-6">
             Select the profile you want to report
           </p>

           {/* Search Input */}
           <div className="relative mb-3">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search ${reportTargetType === "user" ? "users" : "groups"}...`}
                className="pl-10 pr-10 h-11 !bg-card border-border/40 rounded-xl focus-visible:ring-0 focus-visible:bg-card shadow-none transition-colors placeholder:text-muted-foreground"
              />
              {searchQuery.length > 0 && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors focus:outline-none"
                >
                  <X className="w-5 h-5 text-muted-foreground" strokeWidth={2} />
                </button>
              )}
           </div>

            {/* Results List */}
            <div className="flex flex-col">
              {searchLoading ? (
                <div className="flex items-center min-h-[70vh] justify-center gap-2 bg-card rounded-xl border border-border">
                  <Spinner variant="spinner" size="sm" classNames={{spinnerBars:"bg-muted-foreground"}} /> 
                  <p className="text-sm text-muted-foreground">Fetching {reportTargetType === "user" ? "users" : "groups"}...</p>
                </div>
              ) : searchError ? (
                <div className="min-h-[70vh] flex items-center justify-center text-center text-sm text-destructive bg-card rounded-xl border border-border">{searchError}</div>
              ) : searchResults.length === 0 ? (
                <div className="min-h-[70vh] flex items-center justify-center text-center text-sm text-muted-foreground/60 bg-card rounded-xl border border-border">
                  {searchQuery.trim().length > 0 
                     ? `No ${reportTargetType === "user" ? "users" : "groups"} found matching "${searchQuery}"`
                     : `No ${reportTargetType === "user" ? "active users" : "active groups"} available.`}
                </div>
              ) : (
                <div className="bg-card rounded-xl overflow-hidden border border-border/40">
                  <div className="divide-y divide-border/40 flex flex-col">
                    {searchResults.map((target) => (
                      <button
                        key={target.id}
                        onClick={() => handleSelectTarget(target.id, target.name)}
                        className="w-full flex items-center p-3 px-4 duration-150 transition-colors"
                      >
                        <Avatar className="w-9 h-9 mr-3">
                          <AvatarImage src={target.imageUrl} />
                          <UserAvatarFallback />
                        </Avatar>
                        <div className="flex flex-col items-start text-left">
                          <span className="text-sm text-foreground font-medium">{target.name}</span>
                          {target.username && <p className="text-sm text-muted-foreground">@{target.username}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
        </div>
      </motion.div>
    ) : activeView === "reports" ? (
      <motion.div
        key="reports-view"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        transition={{ duration: 0.25, ease: "easeInOut" }}
        className="space-y-6 min-h-[50vh]"
      >
        <div className="flex items-center justify-between mb-2 pt-4 sm:pt-5">
           <button 
             onClick={() => setActiveView("main")}
             className="flex items-center gap-1 text-primary"
           >
             <ChevronLeft className="w-4 h-4" strokeWidth={2} />
             <span className="text-sm font-medium">Safety</span>
           </button>
        </div>

        <div className="px-1">
           <div className="flex items-center justify-between mb-2">
             <h2 className="text-sm sm:text-md font-semibold text-foreground mb-1">
               My Reports
             </h2>
             <span className="text-xs sm:text-sm text-muted-foreground bg-secondary px-2 py-0.5 rounded-md">
               {reports.length} Total
             </span>
           </div>

           <div className="flex flex-col">
            {reportsLoading ? (
               <div className="flex items-center min-h-[80vh] justify-center gap-2 bg-card rounded-xl border border-border mt-2">
                 <Spinner variant="spinner" size="sm" classNames={{spinnerBars:"bg-muted-foreground"}} /> 
                 <p className="text-sm text-muted-foreground">Loading your reports...</p>
               </div>
            ) : reportsError ? (
               <div className="min-h-[70vh] flex flex-col items-center justify-center text-center bg-card rounded-xl border border-border p-8">
                <AlertTriangle className="w-8 h-8 mb-2 text-muted-foreground" strokeWidth={1.5} />
                <p className="text-base text-foreground mb-1">Couldn't load reports</p>
                <p className="text-sm text-muted-foreground">{reportsError}</p>
              </div>
            ) : reports.length === 0 ? (
               <div className="min-h-[80vh] flex flex-col items-center justify-center text-center bg-card rounded-xl border border-border p-8">
                <div className="w-12 h-12  rounded-full flex items-center justify-center mb-4">
                  <HeartHandshake className="w-6 h-6 text-muted-foreground" strokeWidth={1.5} />
                </div>
                <h3 className="text-base text-foreground mb-1">No active reports</h3>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
                  We're glad things are safe. You can report concerns here anytime.
                </p>
              </div>
            ) : (
               <div className="space-y-6 flex flex-col pt-2">
                 {Object.entries(
                   reports.reduce((acc, report) => {
                     const dateStr = formatDate(report.createdAt);
                     if (!acc[dateStr]) acc[dateStr] = [];
                     acc[dateStr].push(report);
                     return acc;
                   }, {} as Record<string, typeof reports>)
                 ).map(([date, dayReports]) => (
                   <div key={date} className="flex flex-col gap-2">
                     {/* Modern Date Separator Label */}
                     <h3 className="text-sm font-medium text-muted-foreground">
                       {date}
                     </h3>
                     
                     {/* Bounded Card iOS style holding reports on this day */}
                     <div className="bg-card rounded-xl overflow-hidden border border-border/40 shadow-none">
                       <div className="divide-y divide-border/40 flex flex-col">
                         {dayReports.map((report) => (
                           <div key={report.id} className="p-4 flex flex-col items-start gap-3 transition-colors duration-150 group">
                             {/* Avatar Block */}
                             <div className="flex flex-row gap-2 w-full">
                             <Avatar className={cn("w-10 h-10 shrink-0 mt-0.5", report.targetType === "group" ? "rounded-[10px]" : "rounded-full")}>
                               <AvatarImage 
                                 src={report.targetImageUrl} 
                                 alt={report.targetName} 
                                 className={cn("object-cover", report.targetType === "group" ? "rounded-full" : "rounded-full")} 
                               />
                               {report.targetType === "group" ? (
                                 <AvatarFallback className="rounded-full bg-secondary text-secondary-foreground text-xs font-semibold uppercase">
                                   {report.targetName.substring(0, 2)}
                                 </AvatarFallback>
                               ) : (
                                 <UserAvatarFallback />
                               )}
                             </Avatar>
                                      {/* Content Block */}
                                <div className="flex-1 min-w-0 flex flex-row items-center justify-between gap-3">
                                  <div className="flex flex-1 items-center gap-2 pr-2 min-w-0">
                                    <div className="flex flex-col">
                                      <span className="text-sm font-semibold text-foreground truncate block">
                                        {report.targetName}
                                      </span>
                                      {report.targetType === "user" && report.targetUsername && (
                                        <span className="text-xs text-muted-foreground truncate block">
                                          @{report.targetUsername}
                                        </span>
                                      )}
                                      {report.targetType === "group" && report.targetMemberCount !== undefined && (
                                        <span className="text-xs text-muted-foreground truncate block">
                                          {report.targetMemberCount} {report.targetMemberCount === 1 ? "member" : "members"}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="shrink-0">
                                    <ReportStatusBadge status={report.status} />
                                  </div>
                                </div>
                              </div>

                              <div className="flex flex-col gap-1">
                                {/* Reason Block */}
                                  <div>
                                    <p className="text-xs text-foreground leading-snug">
                                      <span className="text-muted-foreground font-medium">Reason:</span> {report.reason}
                                    </p>
                                  </div>
                                {/* Additional Notes */}
                                  {report.additionalNotes && report.additionalNotes.trim() !== "" && (
                                    <div className="">
                                      <p className="text-xs text-foreground leading-relaxed line-clamp-2">
                                        <span className="text-muted-foreground font-medium">Additional Context:</span> &quot;{report.additionalNotes}&quot;
                                      </p>
                                    </div>
                                  )}

                                  {/* Evidence Attachment */}
                                  {report.evidenceUrl && report.evidenceUrl.trim() !== "" && (
                                      <div className="flex flex-row items-center gap-2">
                                        <div className="flex flex-row items-center gap-1">
                                          <a href={report.evidenceUrl} target="_blank" rel="noreferrer" className="flex flex-row items-center gap-1 text-xs text-primary hover:underline">
                                            View Evidence
                                            <ArrowUpRight className="w-3 h-3" />
                                          </a>
                                        </div>
                                      </div>
                                  )}</div>
                            </div>
                          ))}
                       </div>
                     </div>
                   </div>
                 ))}
               </div>
            )}
           </div>
        </div>
      </motion.div>
    ) : (
      <motion.div
        key="search-view"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        transition={{ duration: 0.25, ease: "easeInOut" }}
        className="space-y-6 min-h-[50vh]"
      >
        <div className="flex items-center justify-between mb-2 pt-4 sm:pt-5">
           <button 
             onClick={() => setActiveView("main")}
             className="flex items-center gap-1 text-primary"
           >
             <ChevronLeft className="w-4 h-4" strokeWidth={2} />
             <span className="text-sm font-medium">Safety</span>
           </button>
        </div>

        <div>
           <h2 className="text-md font-semibold text-foreground mb-1">
             Report a {reportTargetType === "user" ? "User" : "Group"}
           </h2>
           <p className="text-sm text-muted-foreground/80 mb-4">
             Select the profile you want to report
           </p>

           {/* Search Input */}
           <div className="relative mb-3">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search ${reportTargetType === "user" ? "users" : "groups"}...`}
                className="pl-10 pr-10 h-11 bg-secondary/60 border-border/40 rounded-xl focus-visible:ring-0 focus-visible:bg-secondary/80 text-base shadow-none transition-colors placeholder:text-muted-foreground"
              />
              {searchQuery.length > 0 && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors focus:outline-none"
                >
                  <X className="w-5 h-5 text-muted-foreground" strokeWidth={2} />
                </button>
              )}
           </div>

           {/* Results List */}
           <div className="flex flex-col">
             {searchLoading ? (
                <div className="flex items-center min-h-[70vh] justify-center gap-2 bg-card rounded-xl border border-border">
                  <Spinner variant="spinner" size="sm" classNames={{spinnerBars:"bg-muted-foreground"}} /> 
                  <p className="text-sm text-muted-foreground">Fetching {reportTargetType === "user" ? "users" : "groups"}...</p>
                </div>
             ) : searchError ? (
               <div className="min-h-[70vh] flex items-center justify-center text-center text-sm text-destructive bg-card rounded-xl border border-border">{searchError}</div>
             ) : searchResults.length === 0 ? (
               <div className="min-h-[70vh] flex items-center justify-center text-center text-sm text-muted-foreground/60 bg-card rounded-xl border border-border">
                 {searchQuery.trim().length > 0 
                    ? `No ${reportTargetType === "user" ? "users" : "groups"} found matching "${searchQuery}"`
                    : `No ${reportTargetType === "user" ? "active users" : "active groups"} available.`}
               </div>
             ) : (
               <div className="bg-card rounded-xl overflow-hidden border border-border/40">
                 <div className="divide-y divide-border/40 flex flex-col">
                   {searchResults.map((target) => (
                     <button
                       key={target.id}
                       onClick={() => handleSelectTarget(target.id, target.name)}
                       className="w-full flex items-center p-3 px-4 hover:bg-secondary/50 active:bg-secondary duration-150 transition-colors"
                     >
                       <Avatar className={cn("w-9 h-9 mr-3", reportTargetType === "group" ? "rounded-[10px]" : "rounded-full")}>
                         <AvatarImage 
                           src={target.imageUrl} 
                           className={reportTargetType === "group" ? "rounded-[10px] object-cover" : "rounded-full object-cover"} 
                         />
                         {reportTargetType === "group" ? (
                           <AvatarFallback className="rounded-[10px] bg-secondary text-secondary-foreground text-xs font-semibold uppercase">
                             {target.name.substring(0, 2)}
                           </AvatarFallback>
                         ) : (
                           <UserAvatarFallback />
                         )}
                       </Avatar>
                       <div className="flex flex-col">
                         <span className="text-sm text-foreground font-medium">{target.name}</span>
                         {target.username && <p className="text-left text-sm text-muted-foreground">@{target.username}</p>}
                       </div>
                     </button>
                   ))}
                 </div>
               </div>
             )}
           </div>
        </div>
      </motion.div>
    )}
  </AnimatePresence>
</div>

      <ReportDialog 
        open={isReportDialogOpen} 
        onOpenChange={setIsReportDialogOpen} 
        targetType={reportTargetType} 
        targetId={selectedTargetId} 
        targetName={selectedTargetName} 
        onSuccess={refetchReports} 
      />
    </div>
  );
}

// ----------------------------------------
// Local Reusable Components
// ----------------------------------------

function SectionTitle({ title, rightLabel }: { title: string, rightLabel?: string }) {
  return (
    <div className="flex items-center justify-between px-4 pb-2">
      <h2 className="text-sm text-muted-foreground uppercase tracking-wider">{title}</h2>
      {rightLabel && (
        <span className="text-sm text-muted-foreground">{rightLabel}</span>
      )}
    </div>
  );
}

function ListRow({ icon: Icon, iconBg, label, value, isDestructive, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between p-3 hover:/50 hover:bg-secondary duration-150 transition-colors"
    >
      <div className="flex items-center gap-4">
        <div className={cn("p-1.5 rounded-lg", iconBg)}>
          <Icon className="w-4 h-4" strokeWidth={1.5} />
        </div>
        <span className={cn("text-base", isDestructive ? "text-destructive" : "text-foreground")}>{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {value && <span className="text-base text-muted-foreground mr-1">{value}</span>}
        <ChevronRight className="w-4 h-4 text-muted-foreground/40" strokeWidth={2} />
      </div>
    </button>
  );
}

function ReportStatusBadge({ status }: { status: ReportStatus }) {
  const map: Record<ReportStatus, { label: string; text: string; dot: string }> = {
    pending: { label: "Pending", text: "text-amber-600 dark:text-amber-500", dot: "bg-amber-500" },
    reviewed: { label: "Ongoing", text: "text-primary", dot: "bg-primary" },
    resolved: { label: "Resolved", text: "text-green-600 dark:text-green-500", dot: "bg-green-500" },
    actioned: { label: "Resolved", text: "text-green-600 dark:text-green-500", dot: "bg-green-500" },
    dismissed: { label: "Dismissed", text: "text-muted-foreground", dot: "bg-muted-foreground" },
  };

  const config = map[status] || map.pending;

  return (
    <div className={`flex items-center gap-1.5 text-sm ${config.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </div>
  );
}

function TipRow({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-5">
      <div className="mt-2 ml-2 w-1.5 h-1.5 bg-muted rounded-full flex-shrink-0" />
      <span className="text-base text-foreground leading-snug">{text}</span>
    </li>
  );
}
