"use client";

import React, {
  useRef,
  useEffect,
  useMemo,
  useLayoutEffect,
  useState,
  useCallback,
} from "react";
import { sanitizeMessage } from "@/lib/sanitize";
import { useUser } from "@clerk/nextjs";
import { useParams, useRouter } from "next/navigation";
import { useDirectChat } from "@/shared/hooks/useDirectChat";
import { useDirectInbox } from "@/shared/hooks/use-direct-inbox";
import { Button } from "@/shared/components/ui/button";
import { Image, Spinner } from "@heroui/react";
import { Avatar, AvatarImage } from "@/shared/components/ui/avatar";
import {
  Send,
  Loader2,
  CheckCheck,
  EllipsisVertical,
  User,
  ArrowLeft,
  Smile,
  XCircle,
  Check,
  ChevronLeft,
  ChevronUp,
} from "lucide-react";
import { PiPaperclip } from "react-icons/pi";
import { BiCheckDouble, BiCheck, BiTime } from "react-icons/bi";
import { HiPlay } from "react-icons/hi";
import { getUserUuidByClerkId, isUserBlocked, blockUser, unblockUser, checkBlockStatus } from "@kovari/api/client";
import { formatMessageDate, isSameDay, linkifyMessage, getFullImageUrl } from "@kovari/utils";
import Link from "next/link";
import { useToast } from "@/shared/hooks/use-toast";
import Picker from "@emoji-mart/react";
import data from "@emoji-mart/data";
import { useUserProfile } from "@/shared/hooks/use-user-profile";
import DirectChatSkeleton from "@/shared/components/layout/direct-chat-skeleton";
import { useTheme } from "next-themes";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/shared/components/ui/dropdown-menu";
import ChatActionsDropdown from "@/shared/components/chat/chat-actions-dropdown";
import { UserAvatarFallback } from "@/shared/components/UserAvatarFallback";
import { Skeleton } from "@heroui/react";
import MediaViewerModal from "@/shared/components/media-viewer-modal";


interface PartnerProfile {
  name?: string;
  username?: string;
  profile_photo?: string;
}

const formatMessageWithLineBreaks = (message: string) =>
  message.replace(/\n/g, "<br />");

const MessageSkeleton = () => (
  <div className="flex mb-0.5 justify-start">
    <div className="relative max-w-[75%] flex items-end gap-2">
      <div className="relative px-3 py-1 rounded-2xl bg-gray-200 animate-pulse w-32 h-6" />
    </div>
  </div>
);

const MediaWithSkeleton = ({
  url,
  timestamp,
  onDecrypted,
}: {
  url: string;
  timestamp: string;
  onDecrypted?: (blobUrl: string) => void;
}) => {
  const [loaded, setLoaded] = useState(false);
  const fullUrl = getFullImageUrl(url);

  useEffect(() => {
    if (fullUrl && onDecrypted) {
      onDecrypted(fullUrl);
    }
  }, [fullUrl, onDecrypted]);

  return (
    <div className="relative w-40 h-32 md:w-60 md:h-44 lg:w-80 lg:h-60 max-w-full">
      {!loaded && (
        <Skeleton className="absolute inset-0 w-full h-full rounded-2xl" />
      )}
      {fullUrl && (
        <img
          src={fullUrl}
          alt="sent media"
          className={`w-full h-full object-cover rounded-2xl ${loaded ? "" : "invisible"}`}
          onLoad={() => setLoaded(true)}
        />
      )}
      <span className="absolute bottom-2 right-2 bg-black/50 text-primary-foreground text-[10px] px-2 py-0.5 rounded-md">
        {timestamp}
      </span>
    </div>
  );
};

const VideoWithSkeleton = ({
  url,
  timestamp,
  onDecrypted,
}: {
  url: string;
  timestamp: string;
  onDecrypted?: (blobUrl: string) => void;
}) => {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (url && onDecrypted) {
      onDecrypted(url);
    }
  }, [url, onDecrypted]);

  return (
    <div className="relative w-40 h-32 md:w-60 md:h-44 lg:w-80 lg:h-60 max-w-full">
      {!loaded && (
        <Skeleton className="absolute inset-0 w-full h-full rounded-2xl" />
      )}
      {url && (
        <video
          src={url}
          controls={false}
          className={`w-full h-full object-cover rounded-2xl ${loaded ? "" : "invisible"}`}
          onLoadedData={() => setLoaded(true)}
        />
      )}
      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
        <HiPlay className="h-7 w-7 text-primary-foreground" />
      </div>
      <span className="absolute bottom-2 right-2 bg-black/50 text-primary-foreground text-[10px] px-2 py-0.5 rounded-md">
        {timestamp}
      </span>
    </div>
  );
};

// Utility: Check if message content is real text (not empty, not placeholder)
const isRealTextMessage = (content: string) => {
  if (!content) return false;
  const trimmed = content.trim();
  // We don't want to show [Encrypted message] bubbles
  return trimmed !== "" && trimmed !== "[Encrypted message]";
};

const MessageRow = React.memo(
  ({
    msg,
    isSent,
    content,
    showSpinner,
    showError,
    onRetry,
    isSenderDeleted,
    onMediaClick,
    decryptedUrls,
    setDecryptedUrls,
    sharedSecret,
  }: {
    msg: any;
    isSent: boolean;
    content: string;
    showSpinner: boolean;
    showError: boolean;
    onRetry?: (msg: any) => void;
    isSenderDeleted?: boolean;
    onMediaClick?: (url: string, type: "image" | "video", timestamp: string, sender: string) => void;
    decryptedUrls: Record<string, string>;
    setDecryptedUrls: React.Dispatch<React.SetStateAction<Record<string, string>>>;
    sharedSecret: string;
  }) => {
    const hasMedia = !!msg.mediaUrl;
    const hasText = isRealTextMessage(content);
    const timeString = new Date(msg.created_at).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    // Any media: show only media card (no bubble)
    if (hasMedia && msg.mediaType === "image") {
      const senderName = isSenderDeleted ? "Deleted User" : msg.sender_profile?.name || "Unknown User";
      return (
        <div
          className={`flex ${isSent ? "justify-end" : "justify-start"} mb-1`}
        >
          <button
            type="button"
            className="overflow-hidden rounded-2xl focus:outline-none focus:ring-0 mb-1"
            aria-label="View image in full screen"
            onClick={() => {
              if (onMediaClick) {
                onMediaClick(decryptedUrls[msg.id] || msg.mediaUrl, "image", msg.created_at, senderName);
              }
            }}
          >
            <MediaWithSkeleton
              url={msg.mediaUrl}
              timestamp={timeString}
              onDecrypted={(blobUrl) => {
                if (decryptedUrls[msg.id] !== blobUrl) {
                  setDecryptedUrls((prev) => ({ ...prev, [msg.id]: blobUrl }));
                }
              }}
            />
          </button>
        </div>
      );
    }
    if (hasMedia && msg.mediaType === "video") {
      const senderName = isSenderDeleted ? "Deleted User" : msg.sender_profile?.name || "Unknown User";
      return (
        <div
          className={`flex ${isSent ? "justify-end" : "justify-start"} mb-1`}
        >
          <button
            type="button"
            className="overflow-hidden rounded-2xl focus:outline-none focus:ring-0 mb-1"
            aria-label="View video in full screen"
            onClick={() => {
              if (onMediaClick) {
                onMediaClick(decryptedUrls[msg.id] || msg.mediaUrl, "video", msg.created_at, senderName);
              }
            }}
          >
            <VideoWithSkeleton
              url={msg.mediaUrl}
              timestamp={timeString}
              onDecrypted={(blobUrl) => {
                if (decryptedUrls[msg.id] !== blobUrl) {
                  setDecryptedUrls((prev) => ({ ...prev, [msg.id]: blobUrl }));
                }
              }}
            />
          </button>
        </div>
      );
    }

    // Only text: show bubble
    if (hasText) {
      const isEncryptedPlaceholder = content === "[Encrypted message]";
      
      return (
        <div
          className={`flex ${isSent ? "justify-end" : "justify-start"} mb-1`}
          aria-label={isSent ? "Sent message" : "Received message"}
        >
          <div
            className={`relative min-w-0 max-w-[75%] ${isSent ? "flex-row-reverse" : "flex-row"} flex items-end gap-2`}
          >
            <div
              className={`relative min-w-0 max-w-full px-3 py-1 rounded-2xl text-xs sm:text-sm leading-relaxed whitespace-pre-line ${
                isSent
                  ? "bg-primary text-primary-foreground rounded-br-md"
                  : "bg-secondary text-foreground rounded-bl-md"
              } ${isEncryptedPlaceholder ? "opacity-70 italic" : ""}`}
              tabIndex={0}
              aria-label={content}
              role="document"
            >
              <div className="flex items-center gap-1.5">
                {isEncryptedPlaceholder && <Loader2 className="w-3 h-3 animate-spin" />}
                {msg.status === "sending" || msg.status === "failed" ? (
                  <span className="block text-xs [overflow-wrap:anywhere]">
                    {content}
                  </span>
                ) : (
                  <span
                    className="block text-xs [overflow-wrap:anywhere]"
                    dangerouslySetInnerHTML={{
                      // SECURITY: Sanitize HTML to prevent stored XSS attacks
                      __html: sanitizeMessage(linkifyMessage(content)),
                    }}
                  />
                )}
              </div>
                <span className="flex items-center gap-1 justify-end ml-3 mt-0.5 float-right">
                <span
                  className={`text-[10px] ${
                    isSent ? "text-white/70" : "text-gray-500"
                  }`}
                >
                  {timeString}
                </span>
                {isSent && msg.status === "sending" && <BiTime className="w-3 h-3 text-white/70 flex-shrink-0" />}
                {isSent && msg.status === "sent" && <BiCheck className="w-4 h-4 text-white/70 flex-shrink-0" />}
                {isSent && msg.status === "delivered" && <BiCheckDouble className="w-4 h-4 text-white/70 flex-shrink-0" />}
                {isSent && (msg.status === "seen" || msg.read_at) && <BiCheckDouble className="w-4 h-4 text-primary-foreground flex-shrink-0" />}
                
                {showError && (
                  <>
                    <XCircle className="w-3 h-3 text-destructive" />
                    {onRetry && (
                      <button
                        className="ml-1 text-xs text-destructive underline focus:outline-none"
                        tabIndex={0}
                        aria-label="Retry sending message"
                        onClick={() => onRetry(msg)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onRetry(msg);
                          }
                        }}
                      >
                        Retry
                      </button>
                    )}
                  </>
                )}
              </span>
            </div>
          </div>
        </div>
      );
    }
    // If neither media nor real text, render nothing
    return null;
  },
);
MessageRow.displayName = "MessageRow";

const MessageList = ({
  messages,
  currentUserUuid,
  sharedSecret,
  onRetry,
  onMediaClick,
  decryptedUrls,
  setDecryptedUrls,
}: {
  messages: any[];
  currentUserUuid: string;
  sharedSecret: string;
  onRetry?: (msg: any) => void;
  onMediaClick?: (url: string, type: "image" | "video", timestamp: string, sender: string) => void;
  decryptedUrls: Record<string, string>;
  setDecryptedUrls: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) => {
  // Group messages by date and add date separators
  const messagesWithSeparators = useMemo(() => {
    const result: Array<{
      type: "message" | "separator";
      data: any;
      date?: string;
    }> = [];

    messages.forEach((msg, index) => {
      const messageDate = msg.created_at;

      // Add date separator if this is the first message or if the date changed
      if (
        index === 0 ||
        !isSameDay(messageDate, messages[index - 1].created_at)
      ) {
        result.push({
          type: "separator",
          data: { date: messageDate },
          date: messageDate,
        });
      }

      result.push({
        type: "message",
        data: msg,
      });
    });

    return result;
  }, [messages]);

  // Handle empty messages case
  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <span className="text-sm text-muted-foreground">
            No messages yet. Start a conversation!
          </span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div role="list">
        {messagesWithSeparators.map((item, index) => {
          if (item.type === "separator") {
            return (
              <div key={`separator-${item.date}`} className="text-center my-4">
                <span className="text-xs text-muted-foreground bg-secondary px-3 py-1 rounded-full">
                  {formatMessageDate(item.date!)}
                </span>
              </div>
            );
          }

          const msg = item.data;
          const isSent = msg.sender_id === currentUserUuid;

          // Check if sender is deleted
          const isSenderDeleted = msg.sender_profile?.deleted === true;

          const content = msg.message_content || "";
          const showSpinner = msg.status === "sending";
          const showError = msg.status === "failed";
          return (
            <div role="listitem" key={msg.tempId || msg.id}>
              <MessageRow
                msg={msg}
                isSent={isSent}
                content={content}
                showSpinner={showSpinner}
                showError={showError}
                onRetry={onRetry}
                isSenderDeleted={isSenderDeleted}
                onMediaClick={onMediaClick}
                decryptedUrls={decryptedUrls}
                setDecryptedUrls={setDecryptedUrls}
                sharedSecret={sharedSecret}
              />
            </div>
          );
        })}
      </div>
    </>
  );
};

const MessageInput = ({
  handleSend,
  sending,
  disabled,
  currentUserUuid,
  partnerUuid,
  sendTypingEvent,
  onError,
}: {
  handleSend: (
    value: string,
    mediaUrl?: string,
    mediaType?: string,
  ) => Promise<void>;
  sending: boolean;
  disabled: boolean;
  currentUserUuid: string;
  partnerUuid: string;
  sendTypingEvent: () => void;
  onError?: (message: string) => void;
}) => {
  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [hoverTimeout, setHoverTimeout] = useState<NodeJS.Timeout | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [text]);

  const insertEmoji = (emoji: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || 0;
    const value = textarea.value;
    const newValue = value.slice(0, start) + emoji + value.slice(end);
    setText(newValue);
    setTimeout(() => {
      textarea.setSelectionRange(start + emoji.length, start + emoji.length);
      textarea.focus();
    }, 0);
  };

  useEffect(() => {
    if (!showEmoji) return;
    const handleClick = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        emojiButtonRef.current &&
        !emojiButtonRef.current.contains(e.target as Node)
      ) {
        setShowEmoji(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowEmoji(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [showEmoji]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    sendTypingEvent();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (text.trim()) {
        handleSend(text);
        setText("");
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const signRes = await fetch("/api/cloudinary/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: `kovari-direct/${currentUserUuid}-${partnerUuid}` }),
      });
      if (!signRes.ok) {
        const errBody = await signRes.json().catch(() => ({}));
        console.error("[Upload] Sign API failed:", signRes.status, errBody);
        throw new Error("Failed to get upload permission");
      }
      const responseJson = await signRes.json();
      const { signature, timestamp, folder, api_key, cloud_name } = responseJson.data;

      if (!signature || !api_key || !cloud_name) {
        console.error("[Upload] Sign response missing fields:", responseJson);
        throw new Error("Invalid upload credentials");
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("api_key", api_key);
      formData.append("timestamp", timestamp.toString());
      formData.append("signature", signature);
      formData.append("folder", folder);

      const type = file.type.startsWith("video") ? "video" : "image";
      const resourceType = type === "video" ? "video" : "image";

      const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${cloud_name}/${resourceType}/upload`, {
        method: "POST",
        body: formData,
      });
      if (!uploadRes.ok) {
        const errBody = await uploadRes.json().catch(() => ({}));
        console.error("[Upload] Cloudinary upload failed:", uploadRes.status, errBody);
        throw new Error("File upload to Cloudinary failed");
      }
      const uploaded = await uploadRes.json();
      if (!uploaded.secure_url) {
        console.error("[Upload] No secure_url in Cloudinary response:", uploaded);
        throw new Error("Upload succeeded but no URL returned");
      }
      handleSend("", uploaded.secure_url, type);
    } catch (err: any) {
      console.error("[Upload] File upload error:", err?.message || err);
      onError?.(err?.message || "Failed to upload file");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="flex items-center space-x-1 relative">
      <button
        type="button"
        className="rounded-full bg-transparent hover:bg-primary/10 text-primary flex items-center justify-center p-2 focus:outline-none focus:ring-0"
        aria-label="Attach photo or video"
        tabIndex={0}
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading || sending || disabled}
      >
        {isUploading ? (
          <Spinner variant="spinner" size="sm" color="primary" />
        ) : (
          <PiPaperclip className="h-5 w-5" />
        )}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={handleFileChange}
        aria-label="Attach photo or video"
      />
      <div className="flex-1 relative h-auto flex items-center bg-transparent hover:cursor-text">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleInputChange}
          onKeyDown={handleInputKeyDown}
          placeholder="Your message"
          className="w-full h-full px-0 py-3 rounded-none border-none bg-transparent text-xs focus:outline-none resize-none max-h-10 overflow-y-auto scrollbar-hide align-middle"
          aria-label="Type your message"
          disabled={sending || isUploading || disabled}
          rows={1}
          tabIndex={0}
          style={{ lineHeight: "1.5" }}
        />
      </div>
      <button
        ref={emojiButtonRef}
        type="button"
        className="rounded-full bg-transparent hover:bg-primary/10 text-primary flex items-center justify-center p-2 focus:outline-none focus:ring-0"
        aria-label="Open emoji picker"
        tabIndex={0}
        onClick={() => setShowEmoji((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setShowEmoji((v) => !v);
          }
        }}
        onMouseEnter={() => {
          if (hoverTimeout) clearTimeout(hoverTimeout);
          setShowEmoji(true);
        }}
        onMouseLeave={() => {
          const timeout = setTimeout(() => setShowEmoji(false), 150);
          setHoverTimeout(timeout);
        }}
      >
        <Smile className="h-5 w-5" />
      </button>
      {showEmoji && (
        <div
          ref={popoverRef}
          className="absolute bottom-12 right-0 z-50 bg-card border-none rounded-xl shadow-none p-2"
          role="dialog"
          aria-label="Emoji picker"
          onMouseEnter={() => {
            if (hoverTimeout) clearTimeout(hoverTimeout);
          }}
          onMouseLeave={() => {
            const timeout = setTimeout(() => setShowEmoji(false), 150);
            setHoverTimeout(timeout);
          }}
        >
          {/* @ts-ignore */}
          <Picker
            data={data}
            theme={resolvedTheme === "dark" ? "dark" : "light"}
            previewPosition="none"
            skinTonePosition="search"
            emojiSet="apple"
            emojiButtonSize={32}
            emojiSize={24}
            onEmojiSelect={(emoji: any) => {
              insertEmoji(emoji.native);
            }}
            style={{ width: "320px" }}
          />
        </div>
      )}
      <button
        onClick={() => {
          if (text.trim()) {
            handleSend(text);
            setText("");
          }
        }}
        disabled={
          sending || isUploading || disabled || (!text.trim() && !isUploading)
        }
        className="rounded-full bg-transparent hover:bg-primary/90 text-primary disabled:opacity-50 flex items-center justify-center hover:cursor-pointer pr-3 min-w-[2.5rem]"
        aria-label="Send message"
      >
        {sending || isUploading ? (
          <Spinner variant="spinner" size="sm" color="primary" />
        ) : (
          <Send className="h-5 w-5" />
        )}
      </button>
    </div>
  );
};

const DirectChatPage = () => {
  const { user, isLoaded } = useUser();
  const params = useParams();
  const router = useRouter();
  const partnerUuid = params?.userId as string;
  const currentUserId = user?.id || "";
  // Cache currentUserUuid in localStorage for instant access
  const [currentUserUuid, setCurrentUserUuid] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("currentUserUuid") || "";
    }
    return "";
  });
  const {
    profile: partnerProfile,
    isDeleted: isPartnerDeleted,
    loading: isProfileLoading,
  } = useUserProfile(partnerUuid);
  const partnerLoading = isProfileLoading;
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isUnblocking, setIsUnblocking] = useState(false);
  const { toast } = useToast();
  const supabase = useMemo(() => require("@kovari/api/client").createClient(), []);
  const [iBlockedThem, setIBlockedThem] = useState(false);
  const [theyBlockedMe, setTheyBlockedMe] = useState(false);
  const [blockLoading, setBlockLoading] = useState(true);
  const [unblockError, setUnblockError] = useState<string | null>(null);
  // Modal state for media viewer
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMediaUrl, setModalMediaUrl] = useState<string | null>(null);
  const [decryptedUrls, setDecryptedUrls] = useState<Record<string, string>>({});
  const [modalMediaType, setModalMediaType] = useState<
    "image" | "video" | null
  >(null);
  const [modalTimestamp, setModalTimestamp] = useState<string | undefined>(
    undefined,
  );
  const [modalSender, setModalSender] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const checkBlocks = async () => {
      setBlockLoading(true);
      try {
        const { iBlockedThem, theyBlockedMe } = await checkBlockStatus(partnerUuid);
        if (!cancelled) {
          setIBlockedThem(iBlockedThem);
          setTheyBlockedMe(theyBlockedMe);
        }
      } catch (err) {
        console.error("Error checking blocks:", err);
      } finally {
        if (!cancelled) setBlockLoading(false);
      }
    };
    if (currentUserUuid && partnerUuid) {
      checkBlocks();
    } else {
      setBlockLoading(false);
    }
    // --- Real-time block status subscription ---
    let subscription: any = null;
    if (currentUserUuid && partnerUuid && supabase?.channel) {
      subscription = supabase
        .channel("user-blocks")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "blocked_users" },
          (payload: any) => {
            // If the block/unblock event involves the current user and partner
            const newRow = payload.new || {};
            const oldRow = payload.old || {};
            if (
              (newRow.blocker_id === partnerUuid &&
                newRow.blocked_id === currentUserUuid) ||
              (newRow.blocker_id === currentUserUuid &&
                newRow.blocked_id === partnerUuid) ||
              (oldRow.blocker_id === partnerUuid &&
                oldRow.blocked_id === currentUserUuid) ||
              (oldRow.blocker_id === currentUserUuid &&
                oldRow.blocked_id === partnerUuid)
            ) {
              checkBlocks();
            }
          },
        )
        .subscribe();
    }
    return () => {
      cancelled = true;
      if (subscription && supabase?.removeChannel) {
        supabase.removeChannel(subscription);
      }
    };
  }, [currentUserUuid, partnerUuid, supabase]);

  useEffect(() => {
    if (!currentUserId) return;
    const fetchUuid = async () => {
      const uuid = await getUserUuidByClerkId (currentUserId);
      setCurrentUserUuid(uuid || "");
      if (uuid && typeof window !== "undefined") {
        localStorage.setItem("currentUserUuid", uuid);
      }
    };
    fetchUuid();
  }, [currentUserId]);

  // Use the new direct chat hook
  const {
    messages,
    loading,
    sending,
    error,
    sendMessage,
    markMessagesRead,
    loadMoreMessages,
    hasMoreMessages,
    loadingMore,
    isPartnerTyping,
    sendTypingEvent,
    notifyMessagesSeen,
    lastSeenPartner,
  } = useDirectChat(
    currentUserUuid,
    partnerUuid,
    user?.id,
    partnerProfile?.clerk_id,
  );

  // Standardized sharedSecret using UUIDs for cross-platform parity
  const sharedSecret = useMemo(() => {
    if (!currentUserUuid || !partnerUuid) return "";
    return currentUserUuid < partnerUuid 
      ? `${currentUserUuid}:${partnerUuid}` 
      : `${partnerUuid}:${currentUserUuid}`;
  }, [currentUserUuid, partnerUuid]);

  // Use the inbox hook to get markConversationRead
  const { markConversationRead } = useDirectInbox(currentUserUuid, partnerUuid);

  const scrollToBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    const end = messagesEndRef.current;
    if (!container) return;
    if (end) {
      end.scrollIntoView({ block: "end" });
      return;
    }
    container.scrollTop = container.scrollHeight;
  }, []);

  // Track if we're loading more messages to prevent scroll to bottom
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Update loading more state when loadingMore changes
  useEffect(() => {
    setIsLoadingMore(loadingMore);
  }, [loadingMore]);

  // Smart auto-scroll and intersection observer
  const isNearBottomRef = useRef(true);
  const previousScrollHeight = useRef<number>(0);
  const previousScrollTop = useRef<number>(0);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (loadingMore || !hasMoreMessages) return;
      if (observerRef.current) observerRef.current.disconnect();
      
      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMoreMessages) {
          // Capture scroll position before loading
          if (messagesContainerRef.current) {
            previousScrollHeight.current = messagesContainerRef.current.scrollHeight;
            previousScrollTop.current = messagesContainerRef.current.scrollTop;
          }
          loadMoreMessages();
        }
      });
      
      if (node) observerRef.current.observe(node);
    },
    [loadingMore, hasMoreMessages, loadMoreMessages]
  );

  const handleScroll = useCallback(() => {
    if (!messagesContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    isNearBottomRef.current = scrollHeight - scrollTop - clientHeight < 150;
  }, []);

  useLayoutEffect(() => {
    if (blockLoading || partnerLoading || !currentUserUuid) return;
    if (loading) return;
    if (!messagesContainerRef.current) return;
    
    const container = messagesContainerRef.current;
    
    if (isLoadingMore) {
       // Maintain scroll position when prepending older messages
       const currentScrollHeight = container.scrollHeight;
       if (previousScrollHeight.current > 0 && currentScrollHeight > previousScrollHeight.current) {
          const heightDifference = currentScrollHeight - previousScrollHeight.current;
          container.scrollTop = previousScrollTop.current + heightDifference;
       }
       return;
    }

    // Only scroll to bottom if we were already near bottom (smart scrolling)
    if (isNearBottomRef.current) {
       scrollToBottom();
       const raf = requestAnimationFrame(() => scrollToBottom());
       return () => cancelAnimationFrame(raf);
    }
  }, [
    partnerUuid,
    blockLoading,
    partnerLoading,
    currentUserUuid,
    loading,
    isLoadingMore,
    messages.length,
    scrollToBottom,
  ]);
  
  // Realtime read receipts simple batcher
  useEffect(() => {
     if (messages.length > 0 && isNearBottomRef.current) {
        const unreadForeignMsgs = messages
           .filter(m => m.sender_id === partnerUuid && m.status !== "seen" && !m.read_at)
           .map(m => m.id)
           .filter(Boolean);
           
        if (unreadForeignMsgs.length > 0) {
           notifyMessagesSeen(unreadForeignMsgs as string[]);
        }
     }
  }, [messages, partnerUuid, notifyMessagesSeen]);

  // Error toast
  useEffect(() => {
    if (error) {
      toast({
        title: "Message failed",
        description: error,
        variant: "destructive",
      });
    }
  }, [error, toast]);

  // Retry handler for failed messages
  const handleRetry = useCallback(
    (msg: any) => {
      if (msg.message_content) {
        sendMessage(msg.message_content, msg.mediaUrl, msg.mediaType);
      }
    },
    [sendMessage],
  );

  // Helper to get displayable message content
  const getDisplayableContent = (msg: any) => {
    // If media, do not try to decrypt or show text
    if (msg.mediaUrl) return "";
    return msg.message_content || "";
  };

  // Dispatch event after sending or receiving a message
  useEffect(() => {
    if (!messages.length) return;
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg) return;
    window.dispatchEvent(
      new CustomEvent("inbox-message-update", {
        detail: {
          partnerId: partnerUuid,
          message: getDisplayableContent(lastMsg),
          createdAt: lastMsg.created_at,
          mediaType: lastMsg.mediaType || "",
        },
      }),
    );
  }, [messages, partnerUuid, sharedSecret]);

  // Mark messages as read when chat is opened or partnerUuid changes
  useEffect(() => {
    if (markMessagesRead) {
      markMessagesRead();
    }
  }, [partnerUuid, markMessagesRead]);

  const handleBackClick = () => {
    router.push("/chat");
  };

  // On unmount, mark conversation as read (for mobile/back nav)
  useEffect(() => {
    return () => {
      if (partnerUuid && markConversationRead) {
        markConversationRead(partnerUuid);
      }
    };
  }, [partnerUuid, markConversationRead]);

  const handleUnblock = async () => {
    setIsUnblocking(true);
    setUnblockError(null);
    try {
      await unblockUser(currentUserUuid, partnerUuid);
      setIBlockedThem(false); // local state update if you want to avoid reload
      toast({
        title: "User unblocked",
        description: "You can now chat with this user.",
        variant: "default",
      });
      // Optional: if you want to support a callback
      // if (onUnblocked) onUnblocked();
      // window.location.reload();
    } catch (e: any) {
      setUnblockError("Failed to unblock user");
      toast({
        title: "Failed to unblock user",
        description: e?.message || "An error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsUnblocking(false);
    }
  };

  // Helper to get sender display name
  const getSenderName = useCallback(
    (msg: any) => {
      console.log("🕵️ [getSenderName] msg:", { id: msg.id, sender_id: msg.sender_id, currentUserUuid, partnerUuid, partnerName: partnerProfile?.name });
      if (msg.sender_profile?.name) return msg.sender_profile.name;
      if (msg.sender_profile?.username) return msg.sender_profile.username;
      if (msg.sender_id === currentUserUuid) return "You";
      if (msg.sender_id === partnerUuid && partnerProfile) {
        if (partnerProfile.name) return partnerProfile.name;
        if (partnerProfile.username) return partnerProfile.username;
      }
      return "Unknown";
    },
    [currentUserUuid, partnerUuid, partnerProfile],
  );

  // Patch MessageRow to support modal opening for media
  interface PatchedMessageRowProps {
    msg: any;
    isSent: boolean;
    content: string;
    showSpinner: boolean;
    showError: boolean;
    onRetry?: (msg: any) => void;
    isSenderDeleted?: boolean;
  }
  const PatchedMessageRow = useMemo(() => {
    const Comp: React.FC<PatchedMessageRowProps> = React.memo(
      ({
        msg,
        isSent,
        content,
        showSpinner,
        showError,
        onRetry,
        isSenderDeleted,
      }) => {
        const hasMedia = !!msg.mediaUrl;
        const hasText = isRealTextMessage(content);
        const senderName = getSenderName(msg);
        // Format timestamp from created_at
        const timeString = new Date(msg.created_at).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });

        // Any media: show only media card (no bubble)
        if (hasMedia && msg.mediaType === "image") {
          return (
            <div
              className={`flex ${isSent ? "justify-end" : "justify-start"} mb-1`}
            >
              <button
                type="button"
                className="overflow-hidden rounded-2xl focus:outline-none focus:ring-0"
                aria-label="View image in full screen"
                tabIndex={0}
                onClick={() => {
                  setModalMediaUrl(decryptedUrls[msg.id] || msg.mediaUrl);
                  setModalMediaType("image");
                  setModalTimestamp(msg.created_at);
                  setModalSender(senderName);
                  setModalOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    setModalMediaUrl(decryptedUrls[msg.id] || msg.mediaUrl);
                    setModalMediaType("image");
                    setModalTimestamp(msg.created_at);
                    setModalSender(senderName);
                    setModalOpen(true);
                  }
                }}
              >
                <MediaWithSkeleton
                  url={msg.mediaUrl}
                  timestamp={timeString}
                  onDecrypted={(blobUrl) => {
                    if (decryptedUrls[msg.id] !== blobUrl) {
                      setDecryptedUrls((prev) => ({ ...prev, [msg.id]: blobUrl }));
                    }
                  }}
                />
              </button>
            </div>
          );
        }
        if (hasMedia && msg.mediaType === "video") {
          return (
            <div
              className={`flex ${isSent ? "justify-end" : "justify-start"} mb-1`}
            >
              <button
                type="button"
                className="overflow-hidden rounded-2xl focus:outline-none focus:ring-0"
                aria-label="View video in full screen"
                tabIndex={0}
                onClick={() => {
                  setModalMediaUrl(decryptedUrls[msg.id] || msg.mediaUrl);
                  setModalMediaType("video");
                  setModalTimestamp(msg.created_at);
                  setModalSender(senderName);
                  setModalOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    setModalMediaUrl(decryptedUrls[msg.id] || msg.mediaUrl);
                    setModalMediaType("video");
                    setModalTimestamp(msg.created_at);
                    setModalSender(senderName);
                    setModalOpen(true);
                  }
                }}
              >
                <VideoWithSkeleton
                  url={msg.mediaUrl}
                  timestamp={timeString}
                  onDecrypted={(blobUrl) => {
                    if (decryptedUrls[msg.id] !== blobUrl) {
                      setDecryptedUrls((prev) => ({ ...prev, [msg.id]: blobUrl }));
                    }
                  }}
                />
              </button>
            </div>
          );
        }

        // Only text: show bubble
        if (hasText) {
          return (
            <MessageRow
              msg={msg}
              isSent={isSent}
              content={content}
              showSpinner={showSpinner}
              showError={showError}
              onRetry={onRetry}
              isSenderDeleted={isSenderDeleted}
              decryptedUrls={decryptedUrls}
              setDecryptedUrls={setDecryptedUrls}
              sharedSecret={sharedSecret}
            />
          );
        }
        return null;
      },
    );
    Comp.displayName = "PatchedMessageRow";
    return Comp;
  }, [getSenderName, decryptedUrls, setDecryptedUrls, sharedSecret]);

  // Patch MessageList to use PatchedMessageRow
  const PatchedMessageList = useMemo(() => {
    const Comp = (props: any) => {
      const { messages, currentUserUuid, sharedSecret, onRetry } = props;

      const items = useMemo(() => {
        const result: Array<
          | { type: "separator"; date: string }
          | {
              type: "message";
              key: string;
              msg: any;
              isSent: boolean;
              content: string;
              showSpinner: boolean;
              showError: boolean;
              isSenderDeleted: boolean;
            }
        > = [];

        messages.forEach((msg: any, index: number) => {
          const messageDate = msg.created_at;
          if (
            index === 0 ||
            !isSameDay(messageDate, messages[index - 1].created_at)
          ) {
            result.push({ type: "separator", date: messageDate });
          }

          const isSent = msg.sender_id === currentUserUuid;
          const isSenderDeleted = msg.sender_profile?.deleted === true;
          const content = msg.message_content || "";
          const showSpinner = msg.status === "sending";
          const showError = msg.status === "failed";

          result.push({
            type: "message",
            key: msg.tempId || msg.id,
            msg,
            isSent,
            content,
            showSpinner,
            showError,
            isSenderDeleted,
          });
        });

        return result;
      }, [messages, currentUserUuid, sharedSecret]);

      if (messages.length === 0) {
        return (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <span className="text-sm text-muted-foreground">
                No messages yet. Start a conversation!
              </span>
            </div>
          </div>
        );
      }

      return (
        <div role="list">
          {items.map((item) => {
            if (item.type === "separator") {
              return (
                <div
                  key={`separator-${item.date}`}
                  className="text-center my-4"
                >
                  <span className="text-xs text-muted-foreground bg-secondary px-3 py-1 rounded-full">
                    {formatMessageDate(item.date)}
                  </span>
                </div>
              );
            }
            return (
              <div role="listitem" key={item.key}>
                <PatchedMessageRow
                  msg={item.msg}
                  isSent={item.isSent}
                  content={item.content}
                  showSpinner={item.showSpinner}
                  showError={item.showError}
                  onRetry={onRetry}
                  isSenderDeleted={item.isSenderDeleted}
                />
              </div>
            );
          })}
        </div>
      );
    };

    Comp.displayName = "PatchedMessageList";
    return Comp;
  }, [PatchedMessageRow]);

  if (
    blockLoading ||
    partnerLoading ||
    !currentUserUuid ||
    !partnerUuid ||
    (loading && messages.length === 0)
  ) {
    return <DirectChatSkeleton />;
  }
  if (iBlockedThem) {
    return (
      <div className="relative bg-card flex flex-col h-full items-center justify-center text-center p-3">
        <button
          onClick={handleBackClick}
          className="absolute top-4 left-3 bg-transparent text-foreground md:hidden p-0 gap-1 inline-flex items-center text-xs md:text-sm transition-colors"
          aria-label="Back to inbox"
        >
          <ChevronLeft className="md:h-4 md:w-4 h-3 w-3" />
          Back to Inbox
        </button>
        <span className="text-md font-semibold text-destructive mb-2">
          You have blocked this user.
        </span>
        <span className="text-sm text-muted-foreground">
          You cannot send or receive messages.
        </span>
        <button
          onClick={handleUnblock}
          disabled={isUnblocking}
          className="mt-4 py-1.5 px-4 rounded-lg bg-destructive text-primary-foreground text-sm font-semibold disabled:opacity-60 focus:outline-none focus:ring-0"
          aria-label="Unblock user"
        >
          {isUnblocking ? (
            <span className="flex items-center gap-2">
              <Spinner
                variant="spinner"
                size="sm"
                classNames={{ spinnerBars: "bg-primary-foreground" }}
              />
              Unblocking...
            </span>
          ) : (
            "Unblock User"
          )}
        </button>
      </div>
    );
  }
  if (theyBlockedMe) {
    return (
      <div className="relative flex flex-col h-full items-center justify-center text-center p-3">
        <button
          onClick={handleBackClick}
          className="absolute top-4 left-3 bg-transparent text-foreground md:hidden p-0 gap-1 inline-flex items-center text-xs md:text-sm transition-colors"
          aria-label="Back to inbox"
        >
          <ChevronLeft className="md:h-4 md:w-4 h-3 w-3" />
          Back to Inbox
        </button>
        <span className="text-md font-semibold text-destructive mb-2">
          You have been blocked by this user.
        </span>
        <span className="text-sm text-muted-foreground">
          You cannot send messages to this user.
        </span>
      </div>
    );
  }
  // Don't block access for deleted users - just show them as Anonymous
  // The chat will still be accessible and messages will be visible

  return (
    <div className="fixed inset-0 z-50 md:relative md:inset-auto md:z-0 flex flex-col h-full bg-card overflow-hidden">
      {/* Header */}
      <div className="sticky top-0 z-10 w-full bg-card border-b border-border px-3 sm:px-5 py-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Back button for mobile */}
            <button
              onClick={handleBackClick}
              className="bg-transparent text-foreground md:hidden p-0 h-5 w-5 gap-0"
              aria-label="Back to inbox"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <Link href={`/profile/${partnerUuid}`}>
              <div className="flex items-center gap-3">
                {isPartnerDeleted ? (
                  <Avatar className="h-10 w-10">
                    <AvatarImage
                      src={partnerProfile?.profile_photo || undefined}
                      alt={
                        partnerProfile?.name ||
                        partnerProfile?.username ||
                        "User"
                      }
                      className="object-cover"
                    />
                    <UserAvatarFallback />
                  </Avatar>
                ) : (
                  <Avatar className="h-10 w-10">
                    <AvatarImage
                      src={partnerProfile?.profile_photo || undefined}
                      alt={
                        partnerProfile?.name ||
                        partnerProfile?.username ||
                        "User"
                      }
                      className="object-cover"
                    />
                    <UserAvatarFallback />
                  </Avatar>
                )}
                <div>
                  <div className="font-semibold text-sm text-foreground">
                    {isPartnerDeleted
                      ? "Deleted User"
                      : partnerProfile?.name || "Unknown User"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {isPartnerTyping ? (
                      <span className="text-primary">typing...</span>
                    ) : lastSeenPartner === "online" ? (
                      <span className="text-primary font-medium">online</span>
                    ) : lastSeenPartner ? (
                      <span>Last seen at {new Date(lastSeenPartner).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    ) : (
                      `@${partnerProfile?.username || ""}`
                    )}
                  </div>
                </div>
              </div>
            </Link>
          </div>
          {/* Dropdown menu for chat actions */}
          <ChatActionsDropdown
            currentUserUuid={currentUserUuid}
            partnerUuid={partnerUuid}
            disabled={iBlockedThem || theyBlockedMe}
            partnerProfile={partnerProfile || undefined}
          />
        </div>
      </div>

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto scrollbar-hide p-4 bg-card flex flex-col w-full"
        data-testid="messages-container"
        aria-live="polite"
        aria-atomic="false"
        aria-relevant="additions text"
        tabIndex={0}
        aria-label="Chat messages"
      >
        <style dangerouslySetInnerHTML={{__html:`
          /* safe: hardcoded string, no user input */
          .intersect-observer-child { min-height: 1px; }
        `}} />
        <div className="w-full flex-1 min-h-[min-content]">
          {hasMoreMessages && (
            <div ref={loadMoreRef} className="flex justify-center py-4 text-xs text-muted-foreground w-full">
              {loadingMore && (
                <div className="flex items-center gap-2">
                  <Spinner variant="spinner" size="sm" classNames={{ spinnerBars: "bg-black" }} />
                  Loading older messages...
                </div>
              )}
            </div>
          )}
          <PatchedMessageList
            messages={messages}
            currentUserUuid={currentUserUuid}
            sharedSecret={sharedSecret}
            onRetry={handleRetry}
          />
          <div ref={messagesEndRef} className="h-4 w-full flex-shrink-0 intersect-observer-child" />
        </div>
      </div>

      {/* Message Input - Always at Bottom */}
      <div className="w-full bg-card border-t border-border px-2 py-1 shadow-none z-10 flex-shrink-0 sticky bottom-0">
        <MessageInput
          handleSend={async (
            value: string,
            mediaUrl?: string,
            mediaType?: string,
          ) => {
            // Always check latest block status before sending
            const [iBlocked, theyBlocked] = await Promise.all([
              isUserBlocked(currentUserUuid, partnerUuid),
              isUserBlocked(partnerUuid, currentUserUuid),
            ]);
            if (iBlocked || theyBlocked || isPartnerDeleted) {
              toast({
                title: "Cannot send message",
                description: "You cannot send messages to this user.",
                variant: "destructive",
              });
              return;
            }
            // Ensure mediaType is 'image' | 'video' | undefined
            const validMediaType: "image" | "video" | undefined =
              mediaType === "image" || mediaType === "video"
                ? mediaType
                : undefined;
            sendMessage(value, mediaUrl, validMediaType);
          }}
          sending={sending}
          disabled={iBlockedThem || theyBlockedMe || isPartnerDeleted}
          currentUserUuid={currentUserUuid}
          partnerUuid={partnerUuid}
          sendTypingEvent={sendTypingEvent}
          onError={(msg) => toast({ title: "Upload failed", description: msg, variant: "destructive" })}
        />
      </div>
      {/* Media Viewer Modal */}
      <MediaViewerModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        mediaUrl={modalMediaUrl || ""}
        mediaType={modalMediaType as "image" | "video"}
        timestamp={modalTimestamp}
        sender={modalSender}
      />
    </div>
  );
};

export default DirectChatPage;
