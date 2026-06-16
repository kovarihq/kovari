"use client";

import React, { useState, useCallback } from "react";
import { UseFormReturn } from "react-hook-form";
import { ProfileEditForm } from "@/features/profile/lib/types";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { LocationAutocomplete } from "@/shared/components/ui/location-autocomplete";
import { Button } from "@/shared/components/ui/button";
import { MapPin, Plus, Trash2, Check, X, Pencil, Loader2 } from "lucide-react";
import { Spinner } from "@heroui/react";

const MAX_INTENTIONS = 5;

interface TravelIntention {
  destination: string;
  destination_details?: {
    city?: string | null;
    country?: string | null;
    lat?: number | null;
    lon?: number | null;
  } | null;
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
  isLoading,
}) => {
  const isMobile = useIsMobile();
  const [isAdding, setIsAdding] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Draft state for add/edit form
  const [draft, setDraft] = useState<TravelIntention>({
    destination: "",
    destination_details: null,
  });

  const intentions: TravelIntention[] = form.watch("travel_intentions") || [];

  const saveIntentions = useCallback(
    async (updated: TravelIntention[]) => {
      setIsSaving(true);
      try {
        await updateProfileField("travel_intentions", updated);
        form.setValue("travel_intentions", updated as any);
      } catch (err) {
        console.error("Failed to save travel intentions:", err);
      } finally {
        setIsSaving(false);
      }
    },
    [form, updateProfileField]
  );

  const handleAdd = useCallback(async () => {
    if (!draft.destination.trim()) return;
    const updated = [...intentions, { ...draft, destination: draft.destination.trim() }];
    await saveIntentions(updated);
    setDraft({
      destination: "",
      destination_details: null,
    });
    setIsAdding(false);
  }, [draft, intentions, saveIntentions]);

  const handleEdit = useCallback(
    async (index: number) => {
      if (!draft.destination.trim()) return;
      const updated = [...intentions];
      updated[index] = { ...draft, destination: draft.destination.trim() };
      await saveIntentions(updated);
      setDraft({
        destination: "",
        destination_details: null,
      });
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
      setDraft({
        destination: intentions[index].destination,
        destination_details: intentions[index].destination_details,
      });
      setEditingIndex(index);
      setIsAdding(false);
    },
    [intentions]
  );

  const startAdd = useCallback(() => {
    setDraft({
      destination: "",
      destination_details: null,
    });
    setIsAdding(true);
    setEditingIndex(null);
  }, []);

  const cancelForm = useCallback(() => {
    setDraft({
      destination: "",
      destination_details: null,
    });
    setIsAdding(false);
    setEditingIndex(null);
  }, []);

  const renderForm = (onSave: () => void) => (
    <div className="w-full py-1">
      <div className="font-semibold text-foreground text-sm mb-1">
        Destination
      </div>
      <div className="flex gap-2 items-center">
        <div className="flex-1 min-w-0">
          <LocationAutocomplete
            value={draft.destination}
            onChange={(val) =>
              setDraft((d) => ({ ...d, destination: val }))
            }
            onSelect={(data) => {
              setDraft((d) => ({
                ...d,
                destination: data.city || data.formatted.split(",")[0],
                destination_details: {
                  city: data.city || "",
                  country: data.country || "",
                  lat: data.lat,
                  lon: data.lon,
                },
              }));
            }}
            placeholder="Enter destination"
            className="w-full"
          />
        </div>

        <Button
          size={isMobile ? "icon" : "sm"}
          onClick={onSave}
          disabled={!draft.destination.trim() || isSaving}
          className={
            isMobile
              ? "bg-primary text-primary-foreground text-xs h-9 w-9"
              : "bg-primary text-xs text-primary-foreground h-9"
          }
          aria-label="Save"
        >
          {isSaving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Check className="w-3.5 h-3.5" />
          )}
        </Button>

        <Button
          size={isMobile ? "icon" : "sm"}
          variant="outline"
          onClick={cancelForm}
          className={
            isMobile
              ? "text-xs h-9 w-9"
              : "text-xs h-9"
          }
          aria-label="Cancel"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
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
        <div className={isMobile ? "space-y-3 px-4 pt-4 pb-4" : "space-y-3"}>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Spinner variant="spinner" size="sm" classNames={{ spinnerBars: "bg-foreground" }} />
            </div>
          ) : (
            <>
              {/* Existing Intentions */}
              {intentions.length === 0 && !isAdding && (
                <div className="flex flex-col items-center justify-center py-4 text-center">
                  <p className="text-sm font-medium text-foreground mb-1">
                    No travel plans yet
                  </p>
                  <p className="text-xs text-muted-foreground mb-4">
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
                    <div className="flex items-center justify-between p-3 rounded-lg border border-border transition-all hover:bg-muted/30 group">
                      <div className="flex items-center gap-3 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {intention.destination}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => startEdit(index)}
                          className="p-1 rounded text-muted-foreground hover:text-foreground bg-secondary border border-border transition-all"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(index)}
                          disabled={isSaving}
                          className="p-1 rounded text-muted-foreground bg-secondary border border-border transition-all"
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

              {/* Add Button Below List */}
              {intentions.length > 0 && intentions.length < MAX_INTENTIONS && !isAdding && editingIndex === null && (
                <div className="flex sm:justify-end justify-center mt-2">
                  <button
                    type="button"
                    onClick={startAdd}
                    className="flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors sm:w-auto w-full"
                  >
                    <Plus className="w-4 h-4" />
                    Add Destination
                  </button>
                </div>
              )}

              {/* Limit indicator */}
              {intentions.length > 0 && (
                <p className="text-[10px] text-muted-foreground text-right pt-1">
                  {intentions.length}/{MAX_INTENTIONS} destinations
                </p>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
};

export default TravelSection;
