"use client";

import React, { useState, useCallback } from "react";
import { UseFormReturn } from "react-hook-form";
import { ProfileEditForm } from "@/features/profile/lib/types";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { MapPin, Plus, Trash2, Check, X, Pencil } from "lucide-react";

const TIMEFRAME_OPTIONS = [
  "This month",
  "Next month",
  "In 2-3 months",
  "In 3-6 months",
  "Flexible",
];

const MAX_INTENTIONS = 5;

interface TravelIntention {
  destination: string;
  timeframe: string;
  is_confirmed: boolean;
}

interface TravelSectionProps {
  form: UseFormReturn<ProfileEditForm>;
  isSubmitting: boolean;
  onSubmit: () => void;
  profileData: ProfileEditForm | null;
  isLoading: boolean;
  updateProfileField: (
    field: keyof ProfileEditForm,
    value: any
  ) => Promise<any>;
}

const TravelSection: React.FC<TravelSectionProps> = ({
  form,
  updateProfileField,
}) => {
  const isMobile = useIsMobile();
  const [isAdding, setIsAdding] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Draft state for add/edit form
  const [draft, setDraft] = useState<TravelIntention>({
    destination: "",
    timeframe: "",
    is_confirmed: false,
  });

  const intentions: TravelIntention[] = form.watch("travel_intentions") || [];

  const saveIntentions = useCallback(
    async (updated: TravelIntention[]) => {
      setIsSaving(true);
      try {
        form.setValue("travel_intentions", updated as any);
        await updateProfileField("travel_intentions", updated);
      } catch (err) {
        console.error("Failed to save travel intentions:", err);
      } finally {
        setIsSaving(false);
      }
    },
    [form, updateProfileField]
  );

  const handleAdd = useCallback(async () => {
    if (!draft.destination.trim() || !draft.timeframe) return;
    const updated = [...intentions, { ...draft, destination: draft.destination.trim() }];
    await saveIntentions(updated);
    setDraft({ destination: "", timeframe: "", is_confirmed: false });
    setIsAdding(false);
  }, [draft, intentions, saveIntentions]);

  const handleEdit = useCallback(
    async (index: number) => {
      if (!draft.destination.trim() || !draft.timeframe) return;
      const updated = [...intentions];
      updated[index] = { ...draft, destination: draft.destination.trim() };
      await saveIntentions(updated);
      setDraft({ destination: "", timeframe: "", is_confirmed: false });
      setEditingIndex(null);
    },
    [draft, intentions, saveIntentions]
  );

  const handleDelete = useCallback(
    async (index: number) => {
      const updated = intentions.filter((_, i) => i !== index);
      await saveIntentions(updated);
    },
    [intentions, saveIntentions]
  );

  const startEdit = useCallback(
    (index: number) => {
      setDraft({ ...intentions[index] });
      setEditingIndex(index);
      setIsAdding(false);
    },
    [intentions]
  );

  const startAdd = useCallback(() => {
    setDraft({ destination: "", timeframe: "", is_confirmed: false });
    setIsAdding(true);
    setEditingIndex(null);
  }, []);

  const cancelForm = useCallback(() => {
    setDraft({ destination: "", timeframe: "", is_confirmed: false });
    setIsAdding(false);
    setEditingIndex(null);
  }, []);

  const renderForm = (onSave: () => void) => (
    <div className="space-y-3 p-4 rounded-xl border border-border bg-secondary/30">
      {/* Destination */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Destination
        </label>
        <input
          type="text"
          placeholder="e.g. Goa, Manali, Bali..."
          value={draft.destination}
          onChange={(e) =>
            setDraft((d) => ({ ...d, destination: e.target.value }))
          }
          className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
          maxLength={100}
          autoFocus
        />
      </div>

      {/* Timeframe */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          When do you plan to go?
        </label>
        <div className="flex flex-wrap gap-2">
          {TIMEFRAME_OPTIONS.map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => setDraft((d) => ({ ...d, timeframe: tf }))}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                draft.timeframe === tf
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-foreground/30"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Confirmed Toggle */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() =>
            setDraft((d) => ({ ...d, is_confirmed: !d.is_confirmed }))
          }
          className={`w-9 h-5 rounded-full transition-colors relative ${
            draft.is_confirmed
              ? "bg-primary"
              : "bg-muted-foreground/30"
          }`}
        >
          <span
            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
              draft.is_confirmed ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </button>
        <span className="text-xs text-muted-foreground">
          {draft.is_confirmed
            ? "Confirmed — I'm definitely going"
            : "Exploring — Still deciding"}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={onSave}
          disabled={!draft.destination.trim() || !draft.timeframe || isSaving}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Check className="w-3.5 h-3.5" />
          {isSaving ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={cancelForm}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <div className={`w-full mx-auto ${isMobile ? "p-0" : "p-4"} space-y-6`}>
      {/* Header */}
      <div className="md:space-y-2 space-y-1">
        <div className="flex items-center justify-between">
          <h1 className="md:text-lg text-sm font-semibold text-foreground">
            Travel Intentions
          </h1>
          {intentions.length < MAX_INTENTIONS && !isAdding && editingIndex === null && (
            <button
              type="button"
              onClick={startAdd}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          )}
        </div>
        <p className="md:text-sm text-xs text-muted-foreground">
          Tell others where you&apos;re planning to travel. This helps match you
          with travelers heading to the same places.
        </p>
      </div>

      {/* Card Content */}
      <section
        className={`rounded-2xl bg-card ${
          isMobile
            ? "pt-2 border border-border shadow-none"
            : "border-none py-4 shadow-none"
        }`}
      >
        <div className={isMobile ? "space-y-3 px-4 pt-2 pb-4" : "space-y-3"}>
          {/* Existing Intentions */}
          {intentions.length === 0 && !isAdding && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-3">
                <MapPin className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">
                No travel plans yet
              </p>
              <p className="text-xs text-muted-foreground mb-4 max-w-[240px]">
                Add where you&apos;re planning to go and get matched with
                travelers heading the same way.
              </p>
              <button
                type="button"
                onClick={startAdd}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add your first destination
              </button>
            </div>
          )}

          {intentions.map((intention, index) => (
            <div key={index}>
              {editingIndex === index ? (
                renderForm(() => handleEdit(index))
              ) : (
                <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-secondary/20 hover:bg-secondary/40 transition-colors group">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        intention.is_confirmed
                          ? "bg-emerald-500/15 text-emerald-600"
                          : "bg-amber-500/15 text-amber-600"
                      }`}
                    >
                      <MapPin className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {intention.destination}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">
                          {intention.timeframe}
                        </span>
                        <span
                          className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                            intention.is_confirmed
                              ? "bg-emerald-500/15 text-emerald-600"
                              : "bg-amber-500/15 text-amber-600"
                          }`}
                        >
                          {intention.is_confirmed ? "Confirmed" : "Exploring"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => startEdit(index)}
                      className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(index)}
                      disabled={isSaving}
                      className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Add Form */}
          {isAdding && renderForm(handleAdd)}

          {/* Limit indicator */}
          {intentions.length > 0 && (
            <p className="text-[10px] text-muted-foreground text-right pt-1">
              {intentions.length}/{MAX_INTENTIONS} destinations
            </p>
          )}
        </div>
      </section>
    </div>
  );
};

export default TravelSection;
