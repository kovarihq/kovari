import Footer from "@/shared/components/landing/Footer";
import Link from "next/link";
import React from "react";
import { createMarketingMetadata } from "@/lib/seo";

export const metadata = createMarketingMetadata({
  title: "Community Guidelines",
  description:
    "Read Kovari's Community Guidelines to understand the standards of conduct expected from all users on the platform.",
  path: "/community-guidelines",
});

export default function CommunityGuidelinesPage() {
  const lastUpdated = "March 3, 2026";

  return (
    <>
      <div className="min-h-screen bg-background pt-16 md:pt-24 pb-12 md:pb-16 font-sans selection:bg-muted-foreground/20">
        <div className="container mx-auto px-6 md:px-8 max-w-6xl">
          {/* Header */}
          <div className="mb-12 md:mb-16">
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-foreground mb-4 md:mb-6">
              Community Guidelines
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground leading-relaxed font-medium">
              Last Updated: {lastUpdated}
            </p>
          </div>

          {/* Sections */}
          <div className="space-y-12 md:space-y-16">

            {/* 1 */}
            <section className="group">
              <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4 tracking-tight">
                1. Respect & Safety
              </h2>
              <div className="border-transparent group-hover:border-border/50 transition-colors duration-500">
                <p className="text-base md:text-lg text-muted-foreground mb-4 leading-relaxed">
                  All users are expected to treat others with dignity and
                  respect. Harassment, intimidation, threats, or discrimination
                  of any kind — based on race, religion, gender, nationality,
                  sexual orientation, disability, or any other characteristic
                  — will not be tolerated. This includes:
                </p>
                <ul className="space-y-2 text-base md:text-lg text-muted-foreground">
                  <li className="flex items-start gap-3">
                    <span className="select-none text-muted-foreground/40">•</span>
                    Sending threatening, abusive, or demeaning messages
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="select-none text-muted-foreground/40">•</span>
                    Targeting users based on personal characteristics
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="select-none text-muted-foreground/40">•</span>
                    Coordinating off-platform harassment campaigns
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="select-none text-muted-foreground/40">•</span>
                    Engaging in any conduct that creates an unsafe experience for others
                  </li>
                </ul>
              </div>
            </section>

            {/* 2 */}
            <section className="group">
              <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4 tracking-tight">
                2. Authentic Profiles
              </h2>
              <div className="border-transparent group-hover:border-border/50 transition-colors duration-500">
                <p className="text-base md:text-lg text-muted-foreground mb-4 leading-relaxed">
                  Trust is the foundation of Kovari. Your profile must
                  represent who you genuinely are. You may not:
                </p>
                <ul className="space-y-2 text-base md:text-lg text-muted-foreground">
                  <li className="flex items-start gap-3">
                    <span className="select-none text-muted-foreground/40">•</span>
                    Create fake, duplicate, or misleading accounts
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="select-none text-muted-foreground/40">•</span>
                    Impersonate another person, public figure, or organization
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="select-none text-muted-foreground/40">•</span>
                    Use photos that are not of yourself or that are materially
                    misleading
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="select-none text-muted-foreground/40">•</span>
                    Misrepresent your travel experience, intentions, or
                    identity to other users
                  </li>
                </ul>
                <p className="text-base md:text-lg text-muted-foreground leading-relaxed mt-4">
                  Kovari does not independently verify the accuracy of
                  user-submitted information and does not conduct background
                  checks on any user. Users are required to provide truthful
                  information, but you should not treat the presence of a
                  profile on Kovari as validation of any user&apos;s identity,
                  history, or intentions. Providing false or deceptive profile
                  details is a violation of these guidelines and our Terms of
                  Service.
                </p>
              </div>
            </section>

            {/* 3 */}
            <section className="group">
              <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4 tracking-tight">
                3. No Scams or Financial Exploitation
              </h2>
              <div className="border-transparent group-hover:border-border/50 transition-colors duration-500">
                <p className="text-base md:text-lg text-muted-foreground mb-4 leading-relaxed">
                  Kovari is a networking platform, not a marketplace or
                  financial service. Using the platform to financially exploit
                  other users is strictly prohibited. This includes:
                </p>
                <ul className="space-y-2 text-base md:text-lg text-muted-foreground">
                  <li className="flex items-start gap-3">
                    <span className="select-none text-muted-foreground/40">•</span>
                    Soliciting money, loans, or gifts from other users under
                    false pretenses
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="select-none text-muted-foreground/40">•</span>
                    Operating romance, travel, or investment scams
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="select-none text-muted-foreground/40">•</span>
                    Promoting fraudulent services, fake tours, or fictitious
                    group trips
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="select-none text-muted-foreground/40">•</span>
                    Requesting payment outside the platform for services that
                    do not exist
                  </li>
                </ul>
                <p className="text-base md:text-lg text-muted-foreground leading-relaxed mt-4">
                  If another user asks you for money or makes unsolicited
                  financial requests, we strongly encourage you to report them
                  immediately and exercise caution.
                </p>
              </div>
            </section>

            {/* 4 */}
            <section className="group">
              <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4 tracking-tight">
                4. Safe Offline Interactions
              </h2>
              <div className="border-transparent group-hover:border-border/50 transition-colors duration-500">
                <p className="text-base md:text-lg text-muted-foreground mb-4 leading-relaxed">
                  Kovari facilitates connections between travelers, but does
                  not supervise, arrange, or take responsibility for offline
                  meetings, travel plans, or in-person interactions between
                  users. Kovari does not supervise, verify, or guarantee the
                  identity, intentions, or conduct of any user. All decisions
                  to meet another user in person are made entirely at your
                  sole discretion and risk.
                </p>
                <p className="text-base md:text-lg text-muted-foreground mb-4 leading-relaxed">
                  When meeting someone you connected with through Kovari, we
                  strongly recommend:
                </p>
                <ul className="space-y-2 text-base md:text-lg text-muted-foreground">
                  <li className="flex items-start gap-3">
                    <span className="select-none text-muted-foreground/40">•</span>
                    Meeting in public, well-populated locations first
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="select-none text-muted-foreground/40">•</span>
                    Informing a trusted person of your plans and whereabouts
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="select-none text-muted-foreground/40">•</span>
                    Conducting your own independent due diligence before
                    committing to any shared travel arrangements
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="select-none text-muted-foreground/40">•</span>
                    Trusting your instincts and removing yourself from any
                    situation that feels unsafe
                  </li>
                </ul>
                <p className="text-base md:text-lg text-muted-foreground leading-relaxed mt-4">
                  You are solely responsible for evaluating other users before
                  agreeing to meet offline. You assume full responsibility for
                  all travel decisions, arrangements, and risks resulting from
                  your use of Kovari. Kovari is not liable for any physical,
                  financial, or personal harm arising from offline interactions
                  between users.
                </p>
              </div>
            </section>

            {/* 5 */}
            <section className="group">
              <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4 tracking-tight">
                5. Appropriate Content
              </h2>
              <div className="border-transparent group-hover:border-border/50 transition-colors duration-500">
                <p className="text-base md:text-lg text-muted-foreground mb-4 leading-relaxed">
                  All content shared on Kovari — including profile photos,
                  bios, messages, trip descriptions, and images — must be
                  appropriate for a general audience. The following content is
                  not permitted:
                </p>
                <ul className="space-y-2 text-base md:text-lg text-muted-foreground">
                  <li className="flex items-start gap-3">
                    <span className="select-none text-muted-foreground/40">•</span>
                    Sexually explicit or pornographic material
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="select-none text-muted-foreground/40">•</span>
                    Content that glorifies violence, self-harm, or illegal
                    activity
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="select-none text-muted-foreground/40">•</span>
                    Hate speech or content that promotes discrimination
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="select-none text-muted-foreground/40">•</span>
                    Any content that exploits or endangers minors
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="select-none text-muted-foreground/40">•</span>
                    Graphic or disturbing imagery unrelated to travel
                  </li>
                </ul>
              </div>
            </section>

            {/* 6 */}
            <section className="group">
              <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4 tracking-tight">
                6. No Spam or Commercial Misuse
              </h2>
              <div className="border-transparent group-hover:border-border/50 transition-colors duration-500">
                <p className="text-base md:text-lg text-muted-foreground mb-4 leading-relaxed">
                  Kovari is designed for genuine traveler connections, not for
                  unsolicited promotion or commercial activity. You may not:
                </p>
                <ul className="space-y-2 text-base md:text-lg text-muted-foreground">
                  <li className="flex items-start gap-3">
                    <span className="select-none text-muted-foreground/40">•</span>
                    Send unsolicited promotional messages or advertisements
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="select-none text-muted-foreground/40">•</span>
                    Use automated scripts, bots, or tools to interact with
                    users or content
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="select-none text-muted-foreground/40">•</span>
                    Create accounts primarily for the purpose of promoting
                    external services or businesses
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="select-none text-muted-foreground/40">•</span>
                    Scrape, harvest, or systematically collect user data from
                    the platform
                  </li>
                </ul>
              </div>
            </section>

            {/* 7 */}
            <section className="group">
              <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4 tracking-tight">
                7. Reporting & Moderation
              </h2>
              <div className="border-transparent group-hover:border-border/50 transition-colors duration-500">
                <p className="text-base md:text-lg text-muted-foreground mb-4 leading-relaxed">
                  If you encounter behavior that violates these guidelines,
                  please report it using the in-app reporting tools. All
                  moderation decisions are made at Kovari&apos;s sole
                  discretion. By submitting a report, you understand that:
                </p>
                <ul className="space-y-2 text-base md:text-lg text-muted-foreground">
                  <li className="flex items-start gap-3">
                    <span className="select-none text-muted-foreground/40">•</span>
                    Submitting a report does not guarantee that an
                    investigation will be conducted or that any specific action
                    will be taken
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="select-none text-muted-foreground/40">•</span>
                    Reports may be retained for safety investigations and
                    internal review
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="select-none text-muted-foreground/40">•</span>
                    Kovari may contact you for additional information if
                    necessary
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="select-none text-muted-foreground/40">•</span>
                    Outcomes of moderation actions are generally not disclosed
                    to reporters
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="select-none text-muted-foreground/40">•</span>
                    Filing a false or malicious report is itself a violation of
                    these guidelines
                  </li>
                </ul>
                <p className="text-base md:text-lg text-muted-foreground leading-relaxed mt-4">
                  For urgent safety concerns, please contact local emergency
                  services. Kovari is not an emergency response service and
                  cannot guarantee any response time or outcome.
                </p>
              </div>
            </section>

            {/* 8 */}
            <section className="group">
              <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4 tracking-tight">
                8. Repeated Violations
              </h2>
              <div className="border-transparent group-hover:border-border/50 transition-colors duration-500">
                <p className="text-base md:text-lg text-muted-foreground mb-4 leading-relaxed">
                  Users who engage in repeated or severe violations of these
                  guidelines are subject to escalating enforcement action,
                  including:
                </p>
                <ul className="space-y-2 text-base md:text-lg text-muted-foreground">
                  <li className="flex items-start gap-3">
                    <span className="select-none text-muted-foreground/40">•</span>
                    Temporary restrictions on account features
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="select-none text-muted-foreground/40">•</span>
                    Permanent account suspension or termination
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="select-none text-muted-foreground/40">•</span>
                    Being banned from re-registering on the platform
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="select-none text-muted-foreground/40">•</span>
                    Referral to appropriate authorities where required by law
                  </li>
                </ul>
                <p className="text-base md:text-lg text-muted-foreground leading-relaxed mt-4">
                  Kovari may remove any content or restrict or terminate any
                  account at its sole discretion, without prior notice, if we
                  determine — based on available information — that a violation
                  has occurred, that conduct poses a potential risk to the
                  community, or that a user&apos;s presence on the platform is
                  contrary to community standards, regardless of whether actual
                  harm has resulted.
                </p>
              </div>
            </section>

            {/* 9 */}
            <section className="group">
              <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4 tracking-tight">
                9. Community Responsibility
              </h2>
              <div className="border-transparent group-hover:border-border/50 transition-colors duration-500">
                <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
                  Kovari works best when every user takes personal
                  responsibility for the health of the community. You are
                  encouraged to model the behavior you want to see — be
                  transparent about your intentions, communicate respectfully,
                  and advocate for the safety of others. A strong community is
                  built by its members, not just its policies.
                </p>
              </div>
            </section>

            {/* 10 */}
            <section className="group">
              <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4 tracking-tight">
                10. Enforcement Philosophy
              </h2>
              <div className="border-transparent group-hover:border-border/50 transition-colors duration-500">
                <p className="text-base md:text-lg text-muted-foreground mb-4 leading-relaxed">
                  We aim to enforce these guidelines consistently and fairly.
                  Our approach is context-sensitive — we consider the nature of
                  the violation, its potential impact on others, and the history
                  of the account involved. We do not operate a zero-tolerance
                  policy for every minor infraction, but we will act decisively
                  when safety, trust, or the integrity of the platform is at
                  risk.
                </p>
                <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
                  These guidelines are non-exhaustive. They do not represent a
                  complete list of all conduct that may result in enforcement
                  action. Kovari reserves the right to act against any behavior
                  that we determine — at our sole discretion — to be harmful,
                  deceptive, unsafe, or inconsistent with the spirit of a
                  trustworthy travel community, even if that behavior is not
                  explicitly listed in these guidelines.
                </p>
              </div>
            </section>

            {/* 11 */}
            <section className="group">
              <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4 tracking-tight">
                11. Your Responsibility
              </h2>
              <div className="border-transparent group-hover:border-border/50 transition-colors duration-500">
                <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
                  By using Kovari, you acknowledge that you have read and
                  understood these Community Guidelines and agree to be bound
                  by them. You accept that Kovari does not verify user
                  identities, does not conduct background checks, and cannot
                  guarantee the safety of any offline interaction. Your
                  continued use of the platform constitutes your ongoing
                  agreement to these guidelines and your acceptance of personal
                  responsibility for all interactions and decisions made through
                  or resulting from your use of Kovari.
                </p>
              </div>
            </section>

            {/* Related documents */}
            <section className="group">
              <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4 tracking-tight">
                Related Documents
              </h2>
              <div className="border-transparent group-hover:border-border/50 transition-colors duration-500">
                <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
                  These Community Guidelines supplement our{" "}
                  <Link
                    href="/terms"
                    className="text-primary hover:text-primary/80 font-medium transition-colors border-b border-primary/20 hover:border-primary"
                  >
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link
                    href="/privacy"
                    className="text-primary hover:text-primary/80 font-medium transition-colors border-b border-primary/20 hover:border-primary"
                  >
                    Privacy Policy
                  </Link>
                  . By using Kovari, you agree to be bound by all three
                  documents. For questions, contact us at{" "}
                  <a
                    href="mailto:support@kovari.in"
                    className="text-primary hover:text-primary/80 font-medium transition-colors border-b border-primary/20 hover:border-primary"
                  >
                    support@kovari.in
                  </a>
                  .
                </p>
              </div>
            </section>

          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}

