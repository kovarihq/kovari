import Footer from "@/shared/components/landing/Footer";
import React from "react";
import { createMarketingMetadata } from "@/lib/seo";

export const metadata = createMarketingMetadata({
  title: "Terms of Service",
  description:
    "Review the Terms of Service for Kovari. Understand our platform guidelines, user agreements, and rules for organizing community travel.",
  path: "/terms",
});

export default function TermsPage() {
  const lastUpdated = "March 3, 2026";

  return (
    <>
      <div className="min-h-screen bg-background pt-16 md:pt-24 pb-12 md:pb-16 font-sans selection:bg-muted-foreground/20">
        <div className="container mx-auto px-6 md:px-8 max-w-6xl">
          {/* Header */}
          <div className="mb-12 md:mb-16">
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-foreground mb-4 md:mb-6">
              Terms of Service
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground leading-relaxed font-medium">
              Effective Date: {lastUpdated}
            </p>
          </div>

          {/* Content */}
          <div className="space-y-12 md:space-y-16">
            
            <section className="group">
              <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4 tracking-tight">1. Acceptance of Terms</h2>
              <div className="border-transparent group-hover:border-border/50 transition-colors duration-500">
                <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
                  By accessing or using Kovari (“Platform”, “we”, “us”, or “our”), you agree to be bound by these Terms of Service (“Terms”). If you do not agree to these Terms, please do not use our platform or services.
                </p>
              </div>
            </section>

            <section className="group">
              <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4 tracking-tight">2. Description of Services</h2>
              <div className="border-transparent group-hover:border-border/50 transition-colors duration-500">
                <p className="text-base md:text-lg text-muted-foreground mb-4 leading-relaxed">
                  Kovari is a social technology platform designed to help users discover travel companions, organize group trips, and interact with a global community of travelers.
                </p>
                <div className="bg-muted/30 p-6 rounded-lg border border-border/40 mt-6 md:mt-8">
                  <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground border-b border-primary/20 pb-1 mb-3 inline-block text-primary">Important Disclaimer</span>
                  <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
                    Kovari is not a travel agency, tour operator, or event organizer. We provide networking software to connect travelers — nothing more. We do not organize trips, manage accommodations or transport, or handle payments between users. Kovari does not verify user identities, does not conduct background checks, and does not screen users in any way. We do not guarantee the identity, accuracy, safety, intentions, or conduct of any user, and we make no representation that any user profile is authentic, accurate, or complete. You are solely responsible for evaluating other users before interacting with or meeting them in person. All offline meetings, travel arrangements, and interactions with other users occur entirely at your own risk.
                  </p>
                </div>
              </div>
            </section>

            <section className="group">
              <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4 tracking-tight">3. User Accounts & Eligibility</h2>
              <div className="border-transparent group-hover:border-border/50 transition-colors duration-500">
                <p className="text-base md:text-lg text-muted-foreground mb-4 leading-relaxed">
                  To access certain features of our platform, you must create an account. By using Kovari, you represent that you are at least 18 years of age. Kovari does not independently verify the accuracy of profile information submitted by users. You are responsible for:
                </p>
                <ul className="space-y-2 text-base md:text-lg text-muted-foreground">
                  <li className="flex items-start gap-3"><span className="select-none text-muted-foreground/40">•</span>Providing accurate, honest, and complete profile information</li>
                  <li className="flex items-start gap-3"><span className="select-none text-muted-foreground/40">•</span>Maintaining the confidentiality of your account credentials</li>
                  <li className="flex items-start gap-3"><span className="select-none text-muted-foreground/40">•</span>All activities and communications that occur under your account</li>
                  <li className="flex items-start gap-3"><span className="select-none text-muted-foreground/40">•</span>Notifying us immediately of any unauthorized access</li>
                </ul>
              </div>
            </section>

            <section className="group">
              <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4 tracking-tight">4. Acceptable Use & Conduct</h2>
              <div className="border-transparent group-hover:border-border/50 transition-colors duration-500">
                <p className="text-base md:text-lg text-muted-foreground mb-4 leading-relaxed">You agree not to:</p>
                <ul className="space-y-2 text-base md:text-lg text-muted-foreground">
                  <li className="flex items-start gap-3"><span className="select-none text-muted-foreground/40">•</span>Use the platform for any illegal, hazardous, or unauthorized purposes</li>
                  <li className="flex items-start gap-3"><span className="select-none text-muted-foreground/40">•</span>Harass, abuse, threaten, or discriminate against other travelers</li>
                  <li className="flex items-start gap-3"><span className="select-none text-muted-foreground/40">•</span>Create fake profiles, impersonate others, or engage in scams or fraudulent activity</li>
                  <li className="flex items-start gap-3"><span className="select-none text-muted-foreground/40">•</span>Scrape data, reverse engineer, or transmit any malicious code to the platform</li>
                  <li className="flex items-start gap-3"><span className="select-none text-muted-foreground/40">•</span>Use Kovari for unwanted commercial solicitation or spam</li>
                </ul>
              </div>
            </section>

            <section className="group">
              <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4 tracking-tight">5. User Content</h2>
              <div className="border-transparent group-hover:border-border/50 transition-colors duration-500">
                <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
                  You retain ownership of any content (photos, itineraries, bios) you submit to Kovari. However, by posting content, you grant us a worldwide, non-exclusive, royalty-free license to use, display, reproduce, and distribute your content across our platform to provide our services. You are solely responsible for ensuring your content does not violate third-party rights.
                </p>
                <p className="text-base md:text-lg text-muted-foreground leading-relaxed mt-4">
                  Kovari reserves the right to remove, hide, or restrict any content, and to suspend or terminate access to any account, without prior notice, if we determine — at our sole discretion — that such content or conduct violates these Terms, our community standards, or applicable law.
                </p>
              </div>
            </section>

            <section className="group">
              <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4 tracking-tight">6. Intellectual Property</h2>
              <div className="border-transparent group-hover:border-border/50 transition-colors duration-500">
                <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
                  All platform software, designs, algorithms, text, graphics, and trademarks are owned by Kovari and are protected by international copyright and intellectual property laws. You may not copy, modify, or distribute our intellectual property without express written consent.
                </p>
              </div>
            </section>

            <section className="group">
              <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4 tracking-tight">7. Payment Terms</h2>
              <div className="border-transparent group-hover:border-border/50 transition-colors duration-500">
                <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
                  If you purchase premium services, verifications, or event access through Kovari, all payment terms, subscription fees, and available refund policies will be presented to you at the time of purchase. You agree to pay all applicable fees via our trusted third-party payment processors.
                </p>
              </div>
            </section>

            <section className="group">
              <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4 tracking-tight">8. Disclaimer of Warranties</h2>
              <div className="border-transparent group-hover:border-border/50 transition-colors duration-500">
                <p className="text-base md:text-lg text-muted-foreground mb-4 leading-relaxed uppercase tracking-wide font-semibold text-foreground/90">
                  THE SERVICES ARE PROVIDED “AS IS” AND “AS AVAILABLE” WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED.
                </p>
                <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
                  We disclaim all warranties, including implied warranties of merchantability, fitness for a particular purpose, and non-infringement. We do not guarantee that your use of the platform will be uninterrupted, secure, or free from errors. We take no responsibility for any offline travel arrangements or real-world interactions resulting from your use of Kovari.
                </p>
              </div>
            </section>

            <section className="group">
              <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4 tracking-tight">9. Limitation of Liability</h2>
              <div className="border-transparent group-hover:border-border/50 transition-colors duration-500">
                <p className="text-base md:text-lg text-muted-foreground leading-relaxed uppercase tracking-wide font-medium">
                  TO THE FULLEST EXTENT PERMITTED BY LAW, Kovari AND ITS OFFICERS, DIRECTORS, AND EMPLOYEES SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES ARISING OUT OF YOUR ACCESS TO, USE OF, OR INABILITY TO USE THE PLATFORM, OR ANY CONDUCT OR CONTENT OF ANY THIRD PARTY ON THE PLATFORM, INCLUDING PHYSICAL HARM OR DISPUTES ARISING DURING TRAVEL.
                </p>
              </div>
            </section>

            <section className="group">
              <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4 tracking-tight">10. Assumption of Risk</h2>
              <div className="border-transparent group-hover:border-border/50 transition-colors duration-500">
                <p className="text-base md:text-lg text-muted-foreground mb-4 leading-relaxed">
                  By using Kovari to connect with other users, you acknowledge and voluntarily accept all risks associated with those interactions, including any in-person meetings or travel activities that may result from using the platform. Kovari does not screen users, does not conduct background checks, and is not responsible for the conduct of any user, whether online or offline. You assume full responsibility for your interactions with other users.
                </p>
                <ul className="space-y-2 text-base md:text-lg text-muted-foreground">
                  <li className="flex items-start gap-3"><span className="select-none text-muted-foreground/40">•</span>Travel and in-person meetings with strangers carry inherent risks, including physical, financial, and personal risks</li>
                  <li className="flex items-start gap-3"><span className="select-none text-muted-foreground/40">•</span>Kovari is not responsible for any injuries, losses, damages, or adverse experiences arising from offline interactions or travel activities between users, regardless of how those interactions originated on the platform</li>
                  <li className="flex items-start gap-3"><span className="select-none text-muted-foreground/40">•</span>Users are strongly encouraged to exercise caution, use good judgment, and take appropriate safety precautions when meeting other users</li>
                </ul>
              </div>
            </section>

            <section className="group">
              <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4 tracking-tight">11. Indemnification</h2>
              <div className="border-transparent group-hover:border-border/50 transition-colors duration-500">
                <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
                  You agree to indemnify, defend, and hold harmless Kovari from any claims, liabilities, damages, losses, and expenses (including legal fees) arising from your use of the platform, your offline interactions with other travelers, or any violation of these Terms or applicable law.
                </p>
              </div>
            </section>

            <section className="group">
              <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4 tracking-tight">12. No Agency Relationship</h2>
              <div className="border-transparent group-hover:border-border/50 transition-colors duration-500">
                <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
                  Nothing in these Terms creates, or should be construed to create, any partnership, agency, employment, franchise, or joint venture relationship between Kovari and any user. You act entirely on your own behalf when using this platform.
                </p>
              </div>
            </section>

            <section className="group">
              <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4 tracking-tight">13. User Disputes</h2>
              <div className="border-transparent group-hover:border-border/50 transition-colors duration-500">
                <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
                  Any disputes that arise between users — whether online or offline — are the sole responsibility of the users involved. Kovari is not a party to such disputes and is not obligated to investigate, mediate, arbitrate, or resolve them. We may, at our sole discretion, take platform-level action (such as account suspension) in response to reported disputes, but we make no commitment to do so and do not guarantee any specific outcome.
                </p>
              </div>
            </section>

            <section className="group">
              <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4 tracking-tight">14. Termination</h2>
              <div className="border-transparent group-hover:border-border/50 transition-colors duration-500">
                <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
                  We may terminate or suspend your access to our platform immediately, at our sole discretion, without prior notice or liability, for any reason whatsoever, including a breach of these Terms, suspected fraudulent activity, or safety concerns reported by other users.
                </p>
              </div>
            </section>

            <section className="group">
              <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4 tracking-tight">15. Governing Law & Dispute Resolution</h2>
              <div className="border-transparent group-hover:border-border/50 transition-colors duration-500">
                <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
                  These Terms shall be governed by and construed in accordance with the laws of India. Any disputes arising out of or relating to these Terms or your use of Kovari shall be subject to the exclusive jurisdiction of the courts located in India. We encourage you to first attempt resolution by contacting our support team at <span>
                    <a href="mailto:support@kovari.in" className="text-primary hover:text-primary/80 font-medium transition-colors border-b border-primary/20 hover:border-primary">support@kovari.in</a>.
                  </span>
                </p>
              </div>
            </section>

            <section className="group">
              <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4 tracking-tight">16. Severability & Changes to Terms</h2>
              <div className="border-transparent group-hover:border-border/50 transition-colors duration-500">
                <p className="text-base md:text-lg text-muted-foreground mb-4 leading-relaxed">
                  If any provision of these Terms is found to be unenforceable, the remaining provisions will continue in full force.
                </p>
                <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
                  We reserve the right to modify these Terms at any time. We will provide notice of material changes by updating the "Effective Date" on this page. Your continued use of Kovari constitutes acceptance of those changes.
                </p>
              </div>
            </section>

            <section className="group">
              <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4 tracking-tight">17. Contact Information</h2>
              <div className="border-transparent group-hover:border-border/50 transition-colors duration-500">
                <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
                  If you have any questions, concerns, or legal inquiries about these Terms, please contact us at:
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

