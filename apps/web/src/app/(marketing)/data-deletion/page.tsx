import Footer from "@/shared/components/landing/Footer";
import React from "react";
import { createMarketingMetadata } from "@/lib/seo";

export const metadata = createMarketingMetadata({
  title: "Data Deletion Policy",
  description:
    "Learn how to securely delete your account and personal data from Kovari, in alignment with applicable global data protection frameworks and privacy standards.",
  path: "/data-deletion",
});

export default function DataDeletionPage() {
  const lastUpdated = "March 3, 2026";

  return (
    <>
      <div className="min-h-screen bg-background pt-16 md:pt-24 pb-12 md:pb-16 font-sans selection:bg-muted-foreground/20">
        <div className="container mx-auto px-6 md:px-8 max-w-6xl">
          {/* Header */}
          <div className="mb-12 md:mb-16">
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-foreground mb-4 md:mb-6">
              Data Deletion Policy
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground leading-relaxed font-medium">
              Effective Date: {lastUpdated}
            </p>
          </div>

          {/* Content */}
          <div className="space-y-12 md:space-y-16">
            
            <section className="group">
              <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4 tracking-tight">1. Right to Erasure</h2>
              <div className="border-transparent group-hover:border-border/50 transition-colors duration-500">
                <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
                  Kovari ("we", "us", "our") respects your privacy and your right to control your personal data. In alignment with applicable global data protection frameworks, you have the right to request the deletion or irreversible anonymization of your personal data, subject to applicable legal and safety retention requirements.
                </p>
              </div>
            </section>

            <section className="group">
              <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4 tracking-tight">2. How to Request Deletion</h2>
              <div className="border-transparent group-hover:border-border/50 transition-colors duration-500">
                <p className="text-base md:text-lg text-muted-foreground mb-4 leading-relaxed">You can request the deletion of your Kovari account and associated travel data through the following methods:</p>
                <ul className="space-y-2 text-base md:text-lg text-muted-foreground mb-6">
                  <li className="flex items-start gap-3"><span className="select-none text-muted-foreground/40">•</span>Navigate to Settings {'>'} Account and select the "Delete Account" option.</li>
                  <li className="flex items-start gap-3"><span className="select-none text-muted-foreground/40">•</span>Send an email request from the email address associated with your Kovari account to support@kovari.in with the subject line "Data Deletion Request".</li>
                </ul>
              </div>
            </section>

            <section className="group">
              <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4 tracking-tight">3. What Data Gets Deleted</h2>
              <div className="border-transparent group-hover:border-border/50 transition-colors duration-500">
                <p className="text-base md:text-lg text-muted-foreground mb-4 leading-relaxed">Upon receiving and verifying a valid deletion request, we will delete or irreversibly anonymize the following data from Kovari&apos;s active systems:</p>
                <ul className="space-y-2 text-base md:text-lg text-muted-foreground mb-4">
                  <li className="flex items-start gap-3"><span className="select-none text-muted-foreground/40">•</span>Your user profile and personal identifiers (name, username, email, age)</li>
                  <li className="flex items-start gap-3"><span className="select-none text-muted-foreground/40">•</span>Authentication credentials associated with your account</li>
                  <li className="flex items-start gap-3"><span className="select-none text-muted-foreground/40">•</span>User-generated content, travel preferences, itineraries, and match history</li>
                </ul>
                <p className="text-base md:text-lg text-muted-foreground leading-relaxed">Where outright deletion is not technically feasible, data will be irreversibly anonymized so that it can no longer be associated with you. Content you previously shared with other users may remain visible to or independently retained by those users, and Kovari is not responsible for content that has left our systems through normal platform use.</p>
              </div>
            </section>

            <section className="group">
              <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4 tracking-tight">4. Data We May Retain</h2>
              <div className="border-transparent group-hover:border-border/50 transition-colors duration-500">
                <p className="text-base md:text-lg text-muted-foreground mb-4 leading-relaxed">We may retain certain data for a limited period after a deletion request, strictly where required to comply with legal obligations, prevent fraud, enforce our Terms of Service, or protect community safety. This may include:</p>
                <ul className="space-y-2 text-base md:text-lg text-muted-foreground mb-4">
                  <li className="flex items-start gap-3"><span className="select-none text-muted-foreground/40">•</span>Anonymized analytics data that cannot identify you or your activity</li>
                  <li className="flex items-start gap-3"><span className="select-none text-muted-foreground/40">•</span>Information necessary to comply with legal, tax, or accounting obligations</li>
                  <li className="flex items-start gap-3"><span className="select-none text-muted-foreground/40">•</span>Data related to ongoing disputes, trust &amp; safety investigations, or enforcement of our Terms of Service</li>
                  <li className="flex items-start gap-3"><span className="select-none text-muted-foreground/40">•</span>Minimal internal records (such as anonymized identifiers or fraud-prevention logs) necessary to detect abuse, prevent repeat violations, or enforce our Terms of Service</li>
                  <li className="flex items-start gap-3"><span className="select-none text-muted-foreground/40">•</span>Message histories and interaction records relevant to active or potential safety investigations or dispute resolution proceedings</li>
                </ul>
                <p className="text-base md:text-lg text-muted-foreground mb-4 leading-relaxed">Retained data is limited to what is reasonably necessary for the specific purpose justifying its retention. Retained data will not be used for marketing or profiling purposes after account deletion.</p>
              </div>
            </section>

            <section className="group">
              <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4 tracking-tight">5. Third-Party Service Providers</h2>
              <div className="border-transparent group-hover:border-border/50 transition-colors duration-500">
                <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
                  We will communicate your deletion request to our third-party service providers (e.g., authentication providers, cloud databases, and analytics services) and instruct them to remove your data from their active systems in accordance with their respective data retention and compliance policies. However, Kovari cannot guarantee the deletion timelines of independent third-party systems, and some backup or archival systems operated by those providers may have delayed purge cycles beyond our direct control.
                </p>
                <p className="text-base md:text-lg text-muted-foreground leading-relaxed mt-4">
                  Kovari cannot control or be responsible for content that other users have independently saved, copied, or shared outside of the platform. Deletion of your account removes your data from Kovari&apos;s systems but does not extend to actions taken by third parties beyond our control.
                </p>
              </div>
            </section>

            <section className="group">
              <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4 tracking-tight">6. Processing Time</h2>
              <div className="border-transparent group-hover:border-border/50 transition-colors duration-500">
                <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
                  We process data deletion requests as promptly as practicable. To protect against unauthorized deletion requests, we may require identity verification before processing your request. Account deletion initiated via the app settings is typically processed within a short period. Requests submitted via email, or those subject to a legal hold, may take up to 30 days to fully propagate across all active systems. Where applicable legal obligations or ongoing safety investigations apply, deletion may be delayed until those obligations are resolved. Data stored in secure backup systems may persist temporarily beyond this period but will be purged in accordance with our standard backup retention cycles.
                </p>
              </div>
            </section>

            <section className="group">
              <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4 tracking-tight">7. Changes to Policy</h2>
              <div className="border-transparent group-hover:border-border/50 transition-colors duration-500">
                <p className="text-base md:text-lg text-muted-foreground leading-relaxed">We may update this Data Deletion Policy periodically. Any material changes will be reflected with an updated "Effective Date" at the top of this page.</p>
              </div>
            </section>

            <section className="group">
              <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4 tracking-tight">8. Contact Us</h2>
              <div className="border-transparent group-hover:border-border/50 transition-colors duration-500">
                <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
                  If you have any questions regarding your data, privacy, or account deletion, please contact us at:
                </p>
                <div className="text-base md:text-lg text-muted-foreground">
                  <p>
                    <a href="mailto:support@kovari.in" className="text-primary hover:text-primary/80 font-medium transition-colors border-b border-primary/20 hover:border-primary">support@kovari.in</a>
                  </p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}

