import React from "react";
import {
  SITE_URL,
  SITE_LOGO_URL,
  HELLO_EMAIL,
  SOCIAL_LINKS,
} from "@/lib/config/site";

export function WebAppJsonLd() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Kovari",
    url: SITE_URL,
    description:
      "Social travel platform for group trip planning and finding travel companions.",
    applicationCategory: "TravelApplication",
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "INR",
    },
    creator: {
      "@type": "Organization",
      name: "Kovari",
      url: SITE_URL,
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export function OrganizationJsonLd() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Kovari",
    url: SITE_URL,
    logo: SITE_LOGO_URL,
    sameAs: [SOCIAL_LINKS.instagram, SOCIAL_LINKS.twitter, SOCIAL_LINKS.linkedin],
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: HELLO_EMAIL,
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export function WebSiteJsonLd() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Kovari",
    url: SITE_URL,
    publisher: {
      "@type": "Organization",
      name: "Kovari",
      url: SITE_URL,
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
