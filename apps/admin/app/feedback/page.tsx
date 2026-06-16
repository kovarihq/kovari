"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { GroupContainer } from "@/components/ui/ios/GroupContainer";
import { ListRow } from "@/components/ui/ios/ListRow";
import { SectionHeader } from "@/components/ui/ios/SectionHeader";
import { SearchInput } from "@/components/ui/ios/SearchInput";
import { StatusBadge } from "@/components/ui/ios/StatusBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Loader2, MessageSquare, Plus, FileText, Send } from "lucide-react";
import { toast } from "sonner";

interface FeedbackItem {
  id: string;
  user_id: string;
  type: "bug" | "suggestion" | "other";
  message: string;
  page_url?: string;
  created_at: string;
  status: "new" | "reviewing" | "resolved";
  users?: {
    email: string;
    name: string | null;
    beta_status?: string;
    invite_date?: string;
    activation_date?: string;
    beta_batch?: string;
  };
}

interface Note {
  id: string;
  note: string;
  created_at: string;
  admin_id: string;
  admins?: {
    email: string;
  };
}

export default function FeedbackPage() {
  const [feedback, setFeedback] = React.useState<FeedbackItem[]>([]);
  const [page, setPage] = React.useState(1);
  const [limit] = React.useState(20);
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<string>("");
  const [type, setType] = React.useState<string>("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(true);

  // Selected feedback details state
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [selectedItem, setSelectedItem] = React.useState<FeedbackItem | null>(null);
  const [notes, setNotes] = React.useState<Note[]>([]);
  const [feedbackCount, setFeedbackCount] = React.useState<number>(0);
  const [newNote, setNewNote] = React.useState("");
  const [isSubmittingNote, setIsSubmittingNote] = React.useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = React.useState(false);

  const fetchFeedback = React.useCallback(
    async (newPage: number, searchQuery: string, statusFilter: string, typeFilter: string) => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          page: newPage.toString(),
          limit: limit.toString(),
        });
        if (searchQuery) params.append("query", searchQuery);
        if (statusFilter) params.append("status", statusFilter);
        if (typeFilter) params.append("type", typeFilter);

        const res = await fetch(`/api/admin/feedback?${params}`);
        if (!res.ok) throw new Error("Failed to fetch feedback");
        const data = await res.json();
        
        if (newPage === 1) {
          setFeedback(data.feedback || []);
        } else {
          setFeedback((prev) => [...prev, ...(data.feedback || [])]);
        }
        setPage(newPage);
        setHasMore((data.feedback || []).length === limit);
      } catch (error) {
        console.error("Error fetching feedback:", error);
        toast.error("Failed to load feedback queue");
      } finally {
        setIsLoading(false);
      }
    },
    [limit]
  );

  React.useEffect(() => {
    fetchFeedback(1, query, status, type);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchFeedback(1, query, status, type);
  };

  const handleStatusFilterChange = (val: string) => {
    const filter = val === "all" ? "" : val;
    setStatus(filter);
    fetchFeedback(1, query, filter, type);
  };

  const handleTypeFilterChange = (val: string) => {
    const filter = val === "all" ? "" : val;
    setType(filter);
    fetchFeedback(1, query, status, filter);
  };

  const fetchFeedbackDetails = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/feedback/${id}`);
      if (!res.ok) throw new Error("Failed to fetch feedback details");
      const data = await res.json();
      setSelectedItem(data.feedback);
      setNotes(data.notes || []);
      setFeedbackCount(data.feedbackCount ?? 0);
      setSelectedId(id);
    } catch {
      toast.error("Failed to fetch details");
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim() || !selectedId) return;

    setIsSubmittingNote(true);
    try {
      const res = await fetch(`/api/admin/feedback/${selectedId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: newNote }),
      });

      if (!res.ok) throw new Error("Failed to save note");
      const data = await res.json();
      setNotes((prev) => [...prev, data.note]);
      setNewNote("");
      toast.success("Note added successfully");
    } catch {
      toast.error("Failed to add internal note");
    } finally {
      setIsSubmittingNote(false);
    }
  };

  const handleStatusUpdate = async (newStatus: "reviewing" | "resolved") => {
    if (!selectedId) return;

    setIsUpdatingStatus(true);
    try {
      const res = await fetch(`/api/admin/feedback/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) throw new Error("Failed to update status");
      
      setSelectedItem((prev) => prev ? { ...prev, status: newStatus } : null);
      setFeedback((prev) =>
        prev.map((item) => (item.id === selectedId ? { ...item, status: newStatus } : item))
      );
      toast.success(`Status updated to ${newStatus}`);
    } catch {
      toast.error("Failed to update status");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  return (
    <div className="max-w-full mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6">
        <div className="space-y-0">
          <h1 className="text-lg font-semibold tracking-tight">User Feedback</h1>
          <p className="text-md text-muted-foreground">
            Monitor bugs, feature requests, and feedback submitted by closed beta participants
          </p>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="space-y-6">
        <form onSubmit={handleSearch} className="">
          <SearchInput
            placeholder="Search feedback message, user name, or email..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onClear={() => {
              setQuery("");
              fetchFeedback(1, "", status, type);
            }}
          />
          <button type="submit" className="hidden" />
        </form>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground ml-1">Status</label>
            <Select value={status || "all"} onValueChange={handleStatusFilterChange}>
              <SelectTrigger className="w-full !h-10 rounded-xl bg-card border-border shadow-none font-medium">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="reviewing">Reviewing</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground ml-1">Category</label>
            <Select value={type || "all"} onValueChange={handleTypeFilterChange}>
              <SelectTrigger className="w-full !h-10 rounded-xl bg-card border-border shadow-none font-medium">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="bug">Bug</SelectItem>
                <SelectItem value="suggestion">Suggestion</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Feedback List */}
      <section>
        <SectionHeader>Feedback Items {feedback.length > 0 && `(${feedback.length})`}</SectionHeader>
        <GroupContainer shadow={false}>
          {isLoading && page === 1 ? (
            <div className="h-[60vh] flex items-center justify-center text-muted-foreground text-sm">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : feedback.length === 0 ? (
            <div className="h-[60vh] flex items-center justify-center text-muted-foreground text-sm font-medium">
              No feedback entries found
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {feedback.map((item) => (
                <ListRow
                  key={item.id}
                  onClick={() => fetchFeedbackDetails(item.id)}
                  icon={
                    <div className={cn(
                      "p-2 rounded-full h-10 w-10 flex items-center justify-center shrink-0 border border-border",
                      item.status === "resolved" ? "bg-green-500/10 text-green-600" :
                      item.status === "reviewing" ? "bg-amber-500/10 text-amber-600" :
                      "bg-blue-500/10 text-blue-600"
                    )}>
                      <MessageSquare className="h-4 w-4" />
                    </div>
                  }
                  label={item.users?.name || item.users?.email || "Anonymous User"}
                  secondary={
                    <div className="flex flex-col gap-1 mt-1">
                      <p className="text-sm font-normal text-foreground/90 line-clamp-1 pr-6">{item.message}</p>
                      <span className="text-xs text-muted-foreground">
                        Category: <span className="font-semibold text-foreground/75 uppercase">{item.type}</span> • {new Date(item.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  }
                  trailing={
                    <div className="flex items-center gap-4">
                      <StatusBadge status={item.status} />
                    </div>
                  }
                  showChevron={true}
                />
              ))}
            </div>
          )}
        </GroupContainer>
      </section>

      {/* Load More */}
      {hasMore && !isLoading && feedback.length > 0 && (
        <div className="flex justify-center mt-6">
          <Button
            variant="outline"
            onClick={() => fetchFeedback(page + 1, query, status, type)}
            className="rounded-xl px-6 font-semibold"
          >
            Load More Feedback
          </Button>
        </div>
      )}

      {/* Details Side Drawer Sheet */}
      <Sheet open={selectedId !== null} onOpenChange={(open) => { if (!open) { setSelectedId(null); setSelectedItem(null); } }}>
        <SheetContent className="w-full sm:max-w-md bg-card/95 backdrop-blur-md border-l border-border flex flex-col p-0">
          {selectedItem && (
            <>
              <SheetHeader className="p-6 pb-4 border-b border-border/40">
                <SheetTitle className="text-lg font-bold">Feedback Details</SheetTitle>
                <SheetDescription className="text-xs text-muted-foreground mt-0.5">
                  Submitted by {selectedItem.users?.email}
                </SheetDescription>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {/* User Context */}
                  {selectedItem.users && (
                    <div className="bg-secondary/40 p-4 rounded-xl space-y-3">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">User Context</span>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-muted-foreground">Name</span>
                          <span className="text-xs font-semibold">{selectedItem.users.name || "—"}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-muted-foreground">Email</span>
                          <span className="text-xs font-mono text-foreground/80">{selectedItem.users.email}</span>
                        </div>
                        {selectedItem.users.beta_batch && (
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-muted-foreground">Cohort</span>
                            <span className="text-xs font-semibold text-primary">
                              {selectedItem.users.beta_batch.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                            </span>
                          </div>
                        )}
                        {selectedItem.users.beta_status && (
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-muted-foreground">Beta Status</span>
                            <StatusBadge status={selectedItem.users.beta_status} />
                          </div>
                        )}
                        {selectedItem.users.invite_date && (
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-muted-foreground">Invited</span>
                            <span className="text-xs text-foreground/70">{new Date(selectedItem.users.invite_date).toLocaleDateString()}</span>
                          </div>
                        )}
                        {selectedItem.users.activation_date && (
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-muted-foreground">Activated</span>
                            <span className="text-xs text-foreground/70">{new Date(selectedItem.users.activation_date).toLocaleDateString()}</span>
                          </div>
                        )}
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-muted-foreground">Feedback Submitted</span>
                          <span className="text-xs font-semibold">{feedbackCount} {feedbackCount === 1 ? 'report' : 'reports'}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Meta details */}
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-secondary/40 p-3 rounded-xl">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Category</span>
                      <p className="text-sm font-semibold uppercase mt-0.5">{selectedItem.type}</p>
                    </div>
                    <div className="bg-secondary/40 p-3 rounded-xl flex flex-col justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</span>
                      <div className="mt-1">
                        <StatusBadge status={selectedItem.status} />
                      </div>
                    </div>
                  </div>

                  <div className="bg-secondary/40 p-4 rounded-xl space-y-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Message</span>
                    <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{selectedItem.message}</p>
                  </div>

                  {selectedItem.page_url && (
                    <div className="bg-secondary/20 p-3 rounded-xl">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">URL Reference</span>
                      <p className="text-xs font-mono text-muted-foreground mt-0.5 break-all">{selectedItem.page_url}</p>
                    </div>
                  )}

                  <div className="text-xs text-muted-foreground px-1">
                    Submitted on {new Date(selectedItem.created_at).toLocaleString()}
                  </div>
                </div>

                {/* Status operations */}
                <div className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">Update Status</span>
                  <div className="flex gap-2">
                    {selectedItem.status !== "reviewing" && selectedItem.status !== "resolved" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleStatusUpdate("reviewing")}
                        disabled={isUpdatingStatus}
                        className="flex-1 rounded-xl h-9"
                      >
                        {isUpdatingStatus && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                        Move to Reviewing
                      </Button>
                    )}
                    {selectedItem.status !== "resolved" && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleStatusUpdate("resolved")}
                        disabled={isUpdatingStatus}
                        className="flex-1 rounded-xl h-9 bg-green-600 hover:bg-green-700 text-white border-none"
                      >
                        {isUpdatingStatus && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                        Resolve Feedback
                      </Button>
                    )}
                  </div>
                </div>

                {/* Notes History */}
                <div className="space-y-3 pt-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">Internal Notes</span>
                  
                  {notes.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic px-1">No notes added yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {notes.map((note) => (
                        <div key={note.id} className="bg-secondary/40 p-3.5 rounded-xl border border-border/20 space-y-1">
                          <p className="text-xs text-foreground/90">{note.note}</p>
                          <div className="flex justify-between items-center text-[10px] text-muted-foreground pt-1">
                            <span>{note.admins?.email.split("@")[0] || "Admin"}</span>
                            <span>{new Date(note.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Compose Note */}
              <div className="p-4 border-t border-border/40 bg-card">
                <form onSubmit={handleAddNote} className="flex gap-2 items-end">
                  <Textarea
                    placeholder="Type an internal note (append-only)..."
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    rows={2}
                    className="flex-1 min-h-[50px] max-h-[120px] rounded-xl text-xs bg-background resize-none py-2 px-3 focus-visible:ring-1"
                  />
                  <Button
                    type="submit"
                    size="icon"
                    disabled={isSubmittingNote || !newNote.trim()}
                    className="rounded-xl h-10 w-10 shrink-0"
                  >
                    {isSubmittingNote ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </form>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
