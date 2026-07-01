import { useEffect, useRef, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { XIcon, ChevronLeft, ChevronRight } from "lucide-react";

export interface MediaViewerItem {
  url: string;
  type: "image" | "video";
  timestamp?: string;
  sender?: string;
}

interface MediaViewerModalProps {
  open: boolean;
  onClose: () => void;
  mediaUrl: string;
  mediaType: "image" | "video";
  timestamp?: string;
  sender?: string;
  /** Optional list for gallery navigation (prev/next and arrow keys) */
  mediaItems?: MediaViewerItem[];
  currentIndex?: number;
  onIndexChange?: (index: number) => void;
}

// Utility: format timestamp for modal
const formatMediaTimestamp = (dateString?: string) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  const now = new Date();
  const isToday =
    date.getUTCDate() === now.getUTCDate() &&
    date.getUTCMonth() === now.getUTCMonth() &&
    date.getUTCFullYear() === now.getUTCFullYear();
  const time = date
    .toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
    .toLowerCase();
  if (isToday) return time;
  const day = date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  return `${day}, ${time}`;
};

export const MediaViewerModal = ({
  open,
  onClose,
  mediaUrl,
  mediaType,
  timestamp,
  sender,
  mediaItems,
  currentIndex = 0,
  onIndexChange,
}: MediaViewerModalProps) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const hasNavigation =
    Array.isArray(mediaItems) &&
    mediaItems.length > 1 &&
    typeof onIndexChange === "function";

  const effective = useMemo(() => {
    if (
      hasNavigation &&
      mediaItems!.length > 0 &&
      currentIndex >= 0 &&
      currentIndex < mediaItems!.length
    ) {
      const item = mediaItems![currentIndex];
      return {
        url: item.url,
        type: item.type,
        timestamp: item.timestamp,
        sender: item.sender,
      };
    }
    return {
      url: mediaUrl,
      type: mediaType,
      timestamp,
      sender,
    };
  }, [
    hasNavigation,
    mediaItems,
    currentIndex,
    mediaUrl,
    mediaType,
    timestamp,
    sender,
  ]);

  const goPrev = () => {
    if (!hasNavigation || currentIndex <= 0) return;
    onIndexChange!(currentIndex - 1);
  };

  const goNext = () => {
    if (!hasNavigation || currentIndex >= mediaItems!.length - 1) return;
    onIndexChange!(currentIndex + 1);
  };

  const canGoPrev = hasNavigation && currentIndex > 0;
  const canGoNext =
    hasNavigation && currentIndex < mediaItems!.length - 1;

  // Close on Escape; Left/Right for navigation when available
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (!hasNavigation) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose, hasNavigation, currentIndex, mediaItems?.length]);

  // Focus trap: focus close button on open
  useEffect(() => {
    if (open && closeButtonRef.current) {
      closeButtonRef.current.focus();
    }
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md transition-all p-0 sm:p-2 md:p-4"
      aria-modal="true"
      role="dialog"
      aria-label={
        hasNavigation
          ? `Media ${currentIndex + 1} of ${mediaItems!.length}`
          : "Media viewer"
      }
      tabIndex={-1}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="relative w-full h-full max-w-[100vw] max-h-[100dvh] flex items-center justify-center min-h-0">
        {/* Close button - responsive position and size */}
        <button
          ref={closeButtonRef}
          onClick={onClose}
          aria-label="Close media viewer"
          className="absolute top-3 right-3 sm:top-4 sm:right-4 z-10 rounded-full p-2 sm:p-2.5 bg-black/50 hover:bg-black/70 text-white opacity-90 hover:opacity-100 transition-all focus:outline-none focus:ring-0 touch-manipulation"
        >
          <XIcon className="size-5 sm:size-5" />
        </button>

        {/* Left nav - show when gallery has previous */}
        {hasNavigation && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goPrev();
            }}
            disabled={!canGoPrev}
            aria-label="Previous photo or video"
            className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 min-[380px]:w-14 min-[380px]:h-14 rounded-full bg-black/50 hover:bg-black/70 text-white disabled:opacity-30 disabled:pointer-events-none transition-all focus:outline-none focus:ring-0 focus:ring-offset-0 focus:ring-offset-transparent touch-manipulation"
          >
            <ChevronLeft className="size-7" />
          </button>
        )}

        {/* Right nav */}
        {hasNavigation && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goNext();
            }}
            disabled={!canGoNext}
            aria-label="Next photo or video"
            className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 min-[380px]:w-14 min-[380px]:h-14 rounded-full bg-black/50 hover:bg-black/70 text-white disabled:opacity-30 disabled:pointer-events-none transition-all focus:outline-none focus:ring-0 focus:ring-offset-0 focus:ring-offset-transparent touch-manipulation"
          >
            <ChevronRight className="size-7" />
          </button>
        )}

        {/* Media + caption area - responsive sizing */}
        <div className="flex flex-col items-center justify-center w-full h-full px-2 py-14 pb-20 sm:py-16 sm:pb-24 sm:px-4 md:px-8 max-w-5xl mx-auto">
          <div className="flex flex-col items-center max-w-full max-h-[80vh] justify-center flex-1 min-h-0">
            {effective.type === "image" ? (
              <img
                src={effective.url}
                alt=""
                className="max-w-full h-auto max-h-[68dvh] sm:max-h-[70vh] md:max-h-[72vh] object-contain rounded-xl sm:rounded-2xl select-none shadow-2xl"
                draggable={false}
              />
            ) : (
              <video
                key={effective.url}
                src={effective.url}
                controls
                autoPlay
                playsInline
                className="max-w-full h-auto max-h-[68dvh] sm:max-h-[70vh] md:max-h-[72vh] object-contain rounded-xl sm:rounded-2xl shadow-2xl bg-black"
              />
            )}
          </div>
          <div className="flex flex-row items-center justify-between w-full mt-3 sm:mt-4 px-1 sm:px-2 gap-2 min-w-0 shrink-0">
            {effective.sender && (
              <span
                className="text-xs sm:text-sm text-white/90 font-medium truncate max-w-[50vw] sm:max-w-xs"
                aria-label="Sender"
              >
                {effective.sender}
              </span>
            )}
            {effective.timestamp && (
              <span
                className="text-xs sm:text-sm text-white/80 shrink-0 ml-auto"
                aria-label="Timestamp"
              >
                {formatMediaTimestamp(effective.timestamp)}
              </span>
            )}
          </div>
          {hasNavigation && (
            <p className="text-xs text-white/60 mt-1 sm:mt-2 shrink-0" aria-live="polite">
              {currentIndex + 1} / {mediaItems!.length}
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default MediaViewerModal;

