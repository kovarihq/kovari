import React, { useEffect, useRef } from "react";
import { motion, circInOut } from "framer-motion";
import { XIcon } from "lucide-react";

interface ProfileImageModalProps {
  src: string;
  onClose: () => void;
}

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

const imageVariants = {
  hidden: { scale: 0.96, opacity: 0 },
  visible: { scale: 1, opacity: 1 },
  exit: { scale: 0.96, opacity: 0 },
};

const transition = { duration: 0.25, ease: circInOut };

const ProfileImageModal: React.FC<ProfileImageModalProps> = ({
  src,
  onClose,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on ESC
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Close on click outside
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === overlayRef.current) {
      onClose();
    }
  };

  return (
    <motion.div
      ref={overlayRef}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md"
      onClick={handleOverlayClick}
      aria-modal="true"
      role="dialog"
      tabIndex={-1}
      initial="hidden"
      animate="visible"
      exit="exit"
      variants={overlayVariants}
      transition={transition}
    >
      <button
        onClick={onClose}
        aria-label="Close image viewer"
        className="hidden ring-offset-background bg-gray-200 rounded-full p-1 focus:ring-0 data-[state=open]:bg-secondary absolute top-5 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-offset-0 focus:outline-hidden disabled:pointer-events-none"
        tabIndex={0}
      >
        <XIcon className="size-4" />
      </button>
      <motion.div
        className="h-[min(80vw,80vh)] w-[min(80vw,80vh)] overflow-hidden rounded-full bg-black/10 shadow-md"
        initial="hidden"
        animate="visible"
        exit="exit"
        variants={imageVariants}
        transition={transition}
      >
        <img
          src={src}
          alt="Profile"
          className="h-full w-full object-cover"
          draggable={false}
        />
      </motion.div>
    </motion.div>
  );
};

export default ProfileImageModal;

