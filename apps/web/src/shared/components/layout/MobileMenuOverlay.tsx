"use client";

import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@kovari/utils";

interface MenuItem {
  label: string;
  href: string;
  icon?: React.ElementType;
  onClick?: () => void;
}

interface MobileMenuOverlayProps {
  open: boolean;
  onClose: () => void;
  menuItems?: MenuItem[];
  onJoinWaitlist?: () => void;
}

const MobileMenuOverlay: React.FC<MobileMenuOverlayProps> = ({
  open,
  onClose,
  menuItems = [],
  onJoinWaitlist,
}) => {
  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Split items into categories
  const exploreItems = menuItems.filter(item => 
    ["About", "Safety & Trust"].includes(item.label)
  );
  
  const legalItems = menuItems.filter(item => 
    ["Privacy Policy", "Terms of Service", "Data Deletion", "Community Guidelines"].includes(item.label)
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="mobile-menu"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="font-sans fixed top-0 left-0 right-0 bottom-0 z-40 flex flex-col bg-background/90 backdrop-blur-3xl"
          onClick={onClose}
        >
          {/* Inner container — stop click propagation so tapping nav links doesn't bubble */}
          <div
            className="flex flex-col h-full"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Spacer for Navbar */}
            <div className="h-20 w-full shrink-0" />
            
            {/* Nav Links Container */}
            <div className="flex-1 flex flex-col justify-center px-6 w-full max-w-sm mx-auto space-y-1">
              
              {/* Explore Section */}
              <div className="space-y-4">
                <div className="flex flex-col gap-1">
                  {exploreItems.map((item) => (
                    <MenuLink key={item.label} item={item} onClose={onClose} />
                  ))}
                </div>
              </div>

              {/* Divider */}
              {/* <div className="px-4">
                <div className="h-[1px] w-full bg-gray-500 mx-auto" />
              </div> */}
              
              {/* Legal Section */}
              <div className="space-y-4">
                <div className="flex flex-col gap-1">
                  {legalItems.map((item) => (
                    <MenuLink key={item.label} item={item} onClose={onClose} />
                  ))}
                </div>
              </div>
            </div>

            {/* Bottom CTA */}
            <div className="px-8 pb-12 pt-6 w-full max-w-sm mx-auto flex flex-col items-center gap-3">
              <Button
                className="w-full h-12 rounded-3xl text-md font-semibold bg-primary text-primary-foreground shadow-md transition-transform active:scale-[0.98]"
                onClick={() => {
                  onJoinWaitlist?.();
                  onClose();
                }}
              >
                Join the waitlist
              </Button>
              <Link href="/sign-in" className="w-full" onClick={onClose}>
                <Button
                  className="w-full h-12 rounded-3xl text-md font-semibold text-foreground bg-transparent hover:bg-transparent hover:text-foreground"
                >
                  Log In
                </Button>
              </Link>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

interface MenuLinkProps {
  item: MenuItem;
  onClose: () => void;
}

const MenuLink: React.FC<MenuLinkProps> = ({ item, onClose }) => {
  return (
    <Link
      href={item.href}
      onClick={onClose}
      className={cn(
        "group relative flex items-center justify-start py-1 px-4 rounded-2xl w-full",
        "text-lg font-semibold tracking-tight text-foreground/90",
        "transition-all duration-200 ease-out",
        "hover:bg-foreground/[0.03] active:bg-foreground/[0.05] active:scale-[0.99]"
      )}
    >
      <span className="relative z-10">{item.label}</span>
    </Link>
  );
};

export default MobileMenuOverlay;

