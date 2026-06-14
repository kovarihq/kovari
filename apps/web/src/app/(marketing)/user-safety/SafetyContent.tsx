"use client";

import React from "react";
import {
  ShieldCheck,
  AlertTriangle,
  FileText,
  PhoneCall,
  CheckCircle2,
  Search,
  Shield,
  Eye,
  Lock,
  ChevronRight,
  ArrowRight,
  Info,
  ExternalLink
} from "lucide-react";
import { cn } from "@kovari/utils";
import Link from "next/link";

export default function SafetyContent() {
  return (
    <div className="space-y-12 md:space-y-16">
      {/* 1. HEADER */}
      <section className="mb-12 md:mb-16 items-center text-center">
        <ShieldCheck className="w-12 h-12 text-primary mx-auto mb-6" strokeWidth={1.5} />
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-foreground mb-4 md:mb-6">
          Safety & Trust
        </h1>
        <p className="text-md md:text-lg text-muted-foreground leading-relaxed">
          Travel is better when you feel safe about the people you're with. Kovari helps you connect intentionally before your trip — with safety, clarity, and control built into the experience.
        </p>
      </section>

      {/* 2. ACTIONS / MODERATION */}
      <section className="group">
        <SectionTitle title="Safety & Moderation" />
        <div className="bg-card rounded-xl overflow-hidden border border-border/40">
          <div className="divide-y divide-border/40">
            <ListRow 
              icon={AlertTriangle} 
              iconBg="text-foreground"
              label="Report unsafe behavior"
              description="Easily flag users or content that violates our community standards. We take all reports seriously."
            />
            <ListRow 
              icon={Search} 
              iconBg="text-foreground"
              label="Group safety monitoring"
              description="We review reported activity and take action when necessary to keep the community respectful and safe."
            />
            <ListRow 
              icon={Shield} 
              iconBg="text-foreground"
              label="Manual moderation review"
              description="Every report is reviewed by a human moderator to ensure fair action and thorough investigation."
            />
          </div>
        </div>
      </section>

      {/* 3. TRANSPARENCY & RESPONSIBILITY (Subtle Card) */}
      <section className="group">
        <SectionTitle title="Transparency & Responsibility" />
        <div className="bg-card rounded-xl p-5 border border-border/40 flex gap-5 items-start">
          <div className="p-2.5 bg-primary/10 rounded-lg shrink-0">
            <Info className="w-5 h-5 text-primary" strokeWidth={1.5} />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-medium text-foreground">Identity Verification</h3>
            <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
              Kovari does not currently verify user identities. Users are encouraged to make independent decisions and take personal precautions when interacting with others. Always prioritize your intuition.
            </p>
          </div>
        </div>
      </section>

      {/* 4. GUIDELINES SECTIONS */}
      <section className="space-y-12 md:space-y-16">
        <div>
          <SectionTitle title="Solo Travel Guidelines" />
          <div className="bg-card rounded-xl p-5 border border-border/40">
            <ul className="space-y-4">
              <TipRow text="Share full itinerary with a trusted friend or family member" />
              <TipRow text="Research local emergency numbers and embassy locations" />
              <TipRow text="Leave immediately if you feel uncomfortable or unsafe" />
            </ul>
          </div>
        </div>

        <div>
          <SectionTitle title="Group Travel Guidelines" />
          <div className="bg-card rounded-xl p-5 border border-border/40">
            <ul className="space-y-4">
              <TipRow text="Meet in a public space before departing on long trips" />
              <TipRow text="Discuss budgets, styles, and expectations clearly upfront" />
              <TipRow text="Avoid sharing sensitive financial info with group members" />
            </ul>
          </div>
        </div>

        <div>
          <SectionTitle title="Real-Life Meetings" />
          <div className="bg-card rounded-xl p-5 border border-border/40">
            <ul className="space-y-4">
              <TipRow text="First meeting must be in a well-lit cafe or public place" />
              <TipRow text="Arrange your own independent transport to and from meetings" />
              <TipRow text="Text a friend when arriving and leaving the meeting" />
            </ul>
          </div>
        </div>
      </section>

      {/* 5. HOW REPORTING WORKS (Stepped list) */}
      <section className="group">
         <SectionTitle title="How Reporting Works" />
         <div className="bg-card rounded-xl overflow-hidden border border-border/40">
           <div className="divide-y divide-border/40">
            {[
              { icon: AlertTriangle, title: "1. Submission", desc: "Flag unsafe behavior securely through our reporting tools." },
              { icon: Search, title: "2. Investigation", desc: "Moderators review evidence manually and check against guidelines." },
              { icon: Shield, title: "3. Action Taken", desc: "Violators face warnings, content removal, or permanent bans." },
              { icon: CheckCircle2, title: "4. Resolution", desc: "You are notified of the outcome via your registered email." },
            ].map((step, idx) => (
              <div key={idx} className="flex gap-5 items-center p-5 bg-card">
                <div className="flex flex-col gap-1">
                  <h3 className="text-lg text-foreground font-medium">{step.title}</h3>
                  <p className="text-base md:text-lg text-muted-foreground">{step.desc}</p>
                </div>
              </div>
            ))}
           </div>
           <div className="px-6 py-4 border-t border-border/40 bg-card/50">
             <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
               Reporting and enforcement are governed by our{" "}
               <Link href="/terms" className="text-primary font-medium underline underline-offset-4 hover:text-primary/80 transition-colors">Terms of Service</Link>
               {" "}and{" "}
               <Link href="/community-guidelines" className="text-primary font-medium underline underline-offset-4 hover:text-primary/80 transition-colors">Community Guidelines</Link>.
             </p>
           </div>
         </div>
      </section>

      {/* 6. EMERGENCY CONTACT */}
      <section className="group">
        <SectionTitle title="Emergency Contact" />
        <div className="bg-card rounded-xl overflow-hidden border border-border/40">
          <div className="p-5 border-b border-border/40">
            <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
              If in immediate danger, contact local authorities immediately. These numbers are for India.
            </p>
          </div>
          
          <div className="divide-y divide-border/40">
            <a href="tel:112" className="flex items-center justify-between p-5 hover:bg-secondary/40 transition-colors duration-150">
              <div className="flex flex-col gap-1">
                <h4 className="text-lg text-foreground font-medium">National Emergency</h4>
                <p className="text-xl font-semibold text-destructive">112</p>
              </div>
              <PhoneCall className="w-5 h-5 text-destructive" strokeWidth={2} />
            </a>

            <a href="tel:1091" className="flex items-center justify-between p-5 hover:bg-secondary/40 transition-colors duration-150">
              <div className="flex flex-col gap-1">
                <h4 className="text-lg text-foreground font-medium">Women Helpline</h4>
                <p className="text-xl font-semibold text-destructive">1091</p>
              </div>
              <PhoneCall className="w-5 h-5 text-destructive" strokeWidth={2} />
            </a>
          </div>
        </div>
      </section>

      {/* 7. Trust Footer */}
      <section className="pt-8">
               <div className="flex items-center justify-center gap-x-4 text-xs text-muted-foreground uppercase tracking-[0.2em] font-medium opacity-70">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4" strokeWidth={1.5} /> Reviewed
                  </div>
                  <div className="w-1.5 h-1.5 rounded-full bg-muted" />
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4" strokeWidth={1.5} /> Encrypted
                  </div>
               </div>
      </section>
    </div>
  );
}

// ----------------------------------------
// Local Reusable Components
// ----------------------------------------

function SectionTitle({ title, rightLabel }: { title: string, rightLabel?: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-xl md:text-2xl font-semibold text-foreground tracking-tight">{title}</h2>
      {rightLabel && (
        <span className="text-sm text-muted-foreground mt-1 block">{rightLabel}</span>
      )}
    </div>
  );
}

function ListRow({ icon: Icon, iconBg, label, description }: { icon: any, iconBg?: string, label: string, description: string }) {
  return (
    <div className="w-full flex items-start gap-5 p-5 bg-card">
      <div className={cn("p-2 rounded-lg shrink-0 mt-0.5 bg-muted/30", iconBg || "text-foreground")}>
        <Icon className="w-5 h-5" strokeWidth={1.5} />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-lg text-foreground font-semibold">{label}</span>
        <p className="text-base md:text-lg text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

function TipRow({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-4">
      <div className="mt-2.5 w-2 h-2 bg-muted rounded-full flex-shrink-0" />
      <span className="text-base md:text-lg text-muted-foreground leading-relaxed">{text}</span>
    </li>
  );
}

