"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import InstagramIcon from '@mui/icons-material/Instagram';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import XIcon from "@mui/icons-material/X";
import { SOCIAL_LINKS } from "@/lib/config/site";

export default function Footer() {
  return (
    <footer className="w-full font-sans">
      <div className="container mx-auto px-6 sm:px-8 md:px-8 py-8 sm:py-12">
        <div className="flex justify-between items-center gap-4 sm:gap-0">
          {/* Left: Brand */}
          <div className="flex flex-col items-start">
            <Link href="/" className="flex items-center">
              <Image
                src="/logo.webp"
                alt="Kovari"
                width={400}
                height={160}
                className="h-5 sm:h-6 w-auto object-contain block dark:hidden sm:-translate-y-1 filter brightness-100 contrast-125"
                priority
              />
              <Image
                src="/logo_dark.webp"
                alt="Kovari"
                width={400}
                height={160}
                className="h-5 sm:h-6 w-auto object-contain hidden dark:block sm:-translate-y-1 filter brightness-100 contrast-125"
                priority
              />
            </Link>
          </div>

          {/* Right: Socials */}
          <div className="flex items-center gap-3">
            <Link
              href={SOCIAL_LINKS.instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <InstagramIcon className="!w-5 !h-5 sm:!w-6 sm:!h-6" strokeWidth={1.5} />
            </Link>
            <Link
              href={SOCIAL_LINKS.twitter}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <XIcon className="!w-5 !h-5 sm:!w-5 sm:!h-5" />
            </Link>
            <Link
              href={SOCIAL_LINKS.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <LinkedInIcon className="!w-5 !h-5 sm:!w-6 sm:!h-6" strokeWidth={1.5} />
            </Link>
          </div>
        </div>

        {/* Divider */}
        <div className="w-full h-px bg-border my-4 sm:my-5"></div>

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 md:gap-0 text-xs sm:text-sm text-muted-foreground">
          {/* Bottom Left: Links */}
          <nav className="flex flex-wrap justify-start gap-4 sm:gap-6">
            <Link
              href="/about"
              className="hover:text-foreground transition-colors"
            >
              About
            </Link>
            <Link
              href="/privacy"
              className="hover:text-foreground transition-colors"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="hover:text-foreground transition-colors"
            >
              Terms of Service
            </Link>
            <Link
              href="/user-safety"
              className="hover:text-foreground transition-colors"
            >
              Safety & Trust
            </Link>
            <Link
              href="/community-guidelines"
              className="hover:text-foreground transition-colors"
            >
              Community Guidelines
            </Link>
            <Link
              href="/data-deletion"
              className="hover:text-foreground transition-colors"
            >
              Data Deletion
            </Link>
          </nav>

          {/* Bottom Right: Copyright */}
          <div className="text-left md:text-right mt-2 md:mt-0 select-none">
            © {new Date().getFullYear()} Kovari. All rights reserved.
          </div>
        </div>
      </div>
    </footer>
  );
}

