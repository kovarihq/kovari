import { Metadata } from "next";
import SafetyContent from "./SafetyContent";
import Footer from "@/shared/components/landing/Footer";

export const metadata: Metadata = {
  title: "Safety & Trust | Kovari",
  description: "Learn about Kovari's safety protocols, moderation processes, and community guidelines for safe solo and group travel.",
  openGraph: {
    title: "Safety & Trust | Kovari",
    description: "Your safety is our priority. Explore our guidelines for secure travel and community interactions.",
    url: "https://kovari.app/user-safety",
    siteName: "Kovari",
    images: [
      {
        url: "/og-safety.png",
        width: 1200,
        height: 630,
      },
    ],
    locale: "en_US",
    type: "website",
  },
};

export default function SafetyPage() {
  return (
    <>
      <div className="min-h-screen bg-background pt-16 md:pt-24 pb-12 md:pb-16 font-sans selection:bg-muted-foreground/20">
        <div className="container mx-auto px-6 md:px-8 max-w-6xl">
          <SafetyContent />
        </div>
      </div>
      <Footer />
    </>
  );
}

