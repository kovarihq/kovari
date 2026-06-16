"use client";

import { useState, useRef } from "react";
import { Card, Spinner } from "@heroui/react";
import { Upload, Trash2, Loader2, Plus, Search } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { getFeedImageUrl } from "@kovari/utils";
import { cn } from "@kovari/utils";

interface DestinationCardProps {
  imageUrl?: string;
  name: string;
  country: string;
  onExplore: () => void;
  forMobile?: boolean;
  forTablet?: boolean;
  /** When true, show upload (when no image) or trash (when image) and call onUploadSuccess / onDelete */
  editable?: boolean;
  onUploadSuccess?: (url: string) => void;
  onDelete?: () => void;
}

// Client-side image stretch component
interface ImageStretchProps {
  src: string;
  alt: string;
  ariaLabel?: string;
  className?: string;
}

const ImageStretch = ({
  src,
  alt,
  ariaLabel,
  className = "",
}: ImageStretchProps) => {
  return (
    <div className="w-full h-full">
      <img
        src={getFeedImageUrl(src)}
        alt={alt}
        aria-label={ariaLabel}
        className={cn(
          "w-full h-full object-cover object-center transition-all duration-500",
          className
        )}
        style={{ display: "block" }}
      />
    </div>
  );
};

export function DestinationCard({
  name,
  country,
  imageUrl,
  onExplore,
  forMobile = false,
  forTablet = false,
  editable = false,
  onUploadSuccess,
  onDelete,
}: DestinationCardProps) {
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasImage = Boolean(imageUrl?.trim());

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const signRes = await fetch("/api/cloudinary/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: "kovari-destinations" }),
      });
      if (!signRes.ok) throw new Error("Failed to get Cloudinary signature");
      const responseJson = await signRes.json();
      const { signature, timestamp, folder, api_key, cloud_name } = responseJson.data;

      const formData = new FormData();
      formData.append("file", file);
      formData.append("api_key", api_key);
      formData.append("timestamp", timestamp.toString());
      formData.append("signature", signature);
      formData.append("folder", folder);

      const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${cloud_name}/image/upload`, {
        method: "POST",
        body: formData,
      });
      if (!uploadRes.ok) throw new Error("Cloudinary upload failed");
      
      const uploaded = await uploadRes.json();
      const url = uploaded.secure_url;
      if (url) {
        onUploadSuccess?.(url);
      } else {
        throw new Error("No URL returned from upload");
      }
    } catch (err) {
      console.error("Upload error:", err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!editable || !onDelete || deleting) return;
    setDeleting(true);
    try {
      await Promise.resolve(onDelete());
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card
      className={cn(
        "group relative rounded-3xl shadow-sm border-3 border-card overflow-hidden flex flex-col bg-card text-card-foreground",
        forMobile === true && "w-full h-[180px]",
        forTablet === true && "w-full h-[220px]",
        !forMobile && !forTablet && "w-[250px] h-[200px]"
      )}
    >
      {/* Background: image or placeholder */}
      <div className="absolute inset-0 w-full h-full overflow-hidden bg-secondary rounded-3xl">
        {hasImage ? (
          <ImageStretch
            src={imageUrl!}
            alt="Destination"
            ariaLabel="Destination"
            className="rounded-3xl"
          />
        ) : (
          <div className="w-full h-full rounded-3xl bg-secondary" />
        )}

        {/* Upload when no image: button triggers file input (user-initiated click opens dialog) */}
        {!hasImage && (
          <div
            className={cn(
              "absolute inset-0 z-20 flex items-center justify-center rounded-3xl transition-colors",
              editable ? "bg-secondary" : "bg-secondary pointer-events-none"
            )}
          >
            {/* Hidden file input - off-screen so programmatic .click() works in all browsers */}
            {editable && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer pointer-events-auto"
                  aria-label="Upload destination image"
                  title="Upload destination image"
                />
              </>
            )}
            {uploading ? (
              <Spinner
                variant="spinner"
                size="sm"
                classNames={{ spinnerBars: "bg-gray-400" }}
              />
            ) : editable ? (
              <div
                className="flex flex-col items-center gap-1.5 rounded-3xl p-4 pointer-events-none"
              >
                <span className="text-[10px] sm:text-xs text-gray-400 font-semibold mb-0.5">
                  Add Destination Image
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1.5">
                <div className="rounded-full p-1">
                  <Plus className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content overlay - glassmorphism on city label, search and delete buttons */}
      <div className="absolute bottom-0 left-0 right-0 z-30 w-full rounded-b-3xl px-3 py-3 flex flex-row justify-between items-center gap-2">
        <span
          className={cn(
            "font-medium text-[12px] sm:text-xs truncate rounded-3xl px-3 py-2 h-8 text-center max-w-[140px] min-w-0  flex items-center justify-center",
            "bg-transparent hover:bg-transparent hover:text-primary-foreground backdrop-blur-md border border-primary-foreground [transform:translateZ(0)] transition-all duration-200",
            hasImage
              ? "text-primary-foreground"
              : "text-gray-400 border-gray-400 hover:text-gray-400 hover:bg-gray-400/20"
          )}
        >
          {name}
        </span>
        <div className="flex flex-row items-center gap-2 shrink-0">
          {editable && hasImage && (
            <Button
              variant="outline"
              size="icon"
              onClick={handleDeleteClick}
              disabled={deleting}
              className={cn(
                "h-8 w-8 rounded-full text-primary-foreground transition-opacity duration-200 focus:outline-none focus:ring-0",
                deleting
                  ? "opacity-100 pointer-events-none"
                  : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto",
                "bg-transparent hover:bg-transparent hover:text-primary-foreground backdrop-blur-md border border-primary-foreground dark:border-primary-foreground [transform:translateZ(0)]"
              )}
              aria-label={
                deleting ? "Removing image…" : "Remove destination image"
              }
            >
              {deleting ? (
                <Spinner
                  variant="spinner"
                  size="sm"
                  classNames={{ spinnerBars: "bg-primary-foreground" }}
                />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            className={cn(
              "rounded-full shrink-0 font-medium w-8 h-8",
              "bg-transparent hover:bg-transparent hover:text-primary-foreground backdrop-blur-md border border-primary-foreground dark:border-primary-foreground [transform:translateZ(0)]",
              hasImage
                ? "text-primary-foreground"
                : "text-gray-400 border-gray-400 dark:border-gray-400 hover:text-gray-400 hover:bg-gray-400/20"
            )}
            onClick={onExplore}
            aria-label="Explore destination"
          >
            <Search className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

