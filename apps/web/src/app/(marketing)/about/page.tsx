import Footer from "@/shared/components/landing/Footer";
import React from "react";
import { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "About Kovari | Social Travel Platform",
    description: "Learn how Kovari is reimagining group travel planning for the WhatsApp-and-spreadsheet generation.",
  };
}

export default function AboutPage() {
  return (
    <>
      <div className="min-h-screen bg-background pt-16 md:pt-24 pb-12 md:pb-16 font-sans selection:bg-muted-foreground/20">
        <div className="container mx-auto px-6 md:px-8 max-w-6xl">
          
          {/* Header / Title Block */}
          <div className="mb-12 md:mb-16">
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-foreground mb-4 md:mb-6">
              We’re making travel more human.
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground leading-relaxed font-medium">
              Kovari helps you find the right people before your trip — so you don’t have to figure it out alone once you arrive.
            </p>
          </div>

          <div className="space-y-12 md:space-y-16"> 
            
            {/* The Problem */}
            <section className="group">
              <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4 tracking-tight flex items-center gap-3">
                Solo travel is exciting — but not always easy
              </h2>
              <div className="pl-1 border-l-2 border-transparent group-hover:border-border/50 transition-colors duration-500">
                <p className="text-base md:text-lg text-muted-foreground mb-4 leading-relaxed">
                  Traveling solo gives you freedom, but it also comes with challenges.
                  You often
                </p>
                <ul className="space-y-2 text-base md:text-lg text-muted-foreground">
                  <li className="flex items-start gap-3">
                    <span className="select-none text-muted-foreground/40">•</span>
                    <span>don’t know who you’ll meet</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="select-none text-muted-foreground/40">•</span>
                    <span>rely on random group chats or last-minute plans</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="select-none text-muted-foreground/40">•</span>
                    <span>struggle to find people who match your vibe, budget, or timing</span>
                  </li>
                </ul>
                <p className="mt-4 text-base md:text-lg text-muted-foreground">
                  What starts as excitement can quickly turn into confusion or isolation.
                  We’ve been there too.
                </p>
              </div>
            </section>

            {/* Our Idea - Callout Style */}
            <section>
              <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4 tracking-tight">
                So we built Kovari
              </h2>
              <p className="text-base md:text-lg text-muted-foreground mb-8 leading-relaxed">
                Kovari is a platform designed to help travelers connect before the trip begins.
              </p>
              
              <div className="grid md:grid-cols-2 gap-8 md:gap-12">
                {/* Left Column: The Old Way (Muted) */}
                <div className="space-y-3 opacity-70">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-muted-foreground pb-1 mb-2 inline-block">Instead of</span>
                  <ul className="space-y-3 text-sm md:text-base text-muted-foreground line-through decoration-muted-foreground/30">
                    <li>random meetups</li>
                    <li>scattered WhatsApp groups</li>
                    <li>mismatched travel plans</li>
                  </ul>
                </div>

                {/* Right Column: The New Way (Highlighted) */}
                <div className="bg-muted/30 -mx-4 -my-4 p-4 md:mx-0 md:my-0 md:p-0 md:bg-transparent rounded-lg md:rounded-none">
                  <div className="space-y-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-primary pb-1 mb-2 inline-block text-primary">You can</span>
                    <ul className="space-y-3 text-sm md:text-base font-medium text-muted-foreground">
                      <li className="flex items-center gap-2">
                        find people going to the same destination
                      </li>
                      <li className="flex items-center gap-2">
                        match based on compatibility
                      </li>
                      <li className="flex items-center gap-2">
                        plan together in a structured way
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              <p className="mt-8 text-base md:text-lg font-medium text-muted-foreground border-l-2 border-primary/50 pl-4 py-1">
                Because the best trips aren’t just about places — they’re about people.
              </p>
            </section>

            {/* What Makes It Different */}
            <section>
              <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4 tracking-tight">
                Built for real connections, not just coordination
              </h2>
              <div className="text-base md:text-lg text-muted-foreground space-y-4 leading-relaxed">
                <p>Kovari focuses on quality over quantity.</p>
                <div className="bg-muted/20 rounded-xl p-5 md:p-6 border border-border/40">
                  <ul className="space-y-3 text-sm md:text-base">
                    <li className="flex gap-3">
                      <span className="text-primary font-bold">→</span>
                      Small travel circles instead of large chaotic groups
                    </li>
                    <li className="flex gap-3">
                      <span className="text-primary font-bold">→</span>
                      Compatibility-based matching instead of randomness
                    </li>
                    <li className="flex gap-3">
                      <span className="text-primary font-bold">→</span>
                      Built-in communication instead of scattered chats
                    </li>
                  </ul>
                </div>
                <p>
                  We’re not trying to create another social network.
                  We’re building a space where travel feels more intentional, safe, and human.
                </p>
              </div>
            </section>

            {/* Trust & Responsibility */}
            <section>
              <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4 tracking-tight">
                Designed with safety in mind
              </h2>
              <div className="text-base md:text-lg text-muted-foreground leading-relaxed">
                <p className="mb-6">We understand that traveling with new people requires trust.</p>
                
                <div className="flex flex-wrap gap-2 mb-6">
                  <span className="px-3 py-1 bg-muted/40 rounded-full text-sm md:text-base font-medium text-muted-foreground border border-border/50">Profile-based matching</span>
                  <span className="px-3 py-1 bg-muted/40 rounded-full text-sm md:text-base font-medium text-muted-foreground border border-border/50">Reporting & moderation</span>
                  <span className="px-3 py-1 bg-muted/40 rounded-full text-sm md:text-base font-medium text-muted-foreground border border-border/50">Privacy-first design</span>
                </div>

                <p className="text-base md:text-lg text-muted-foreground/80 border-l-2 border-border pl-4">
                  At the same time, we believe users should always make thoughtful decisions and take personal responsibility when meeting others.
                </p>
              </div>
            </section>

            {/* The Team / Vision Combined Block */}
            <div className="space-y-10 md:space-y-12">
              <section>
                <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4 tracking-tight">
                  Built by travelers and builders
                </h2>
                <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
                  Kovari is being built by a small team of developers and students who care about creating meaningful products.
                  We’ve experienced the same problems firsthand — and we’re building the solution we wish existed.
                </p>
              </section>

              <section>
                <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4 tracking-tight">
                  Where this is going
                </h2>
                <div className="text-base md:text-lg text-muted-foreground leading-relaxed space-y-4">
                  <p>
                    We believe travel will become more social, more intentional, and more connected. 
                    Kovari is just the beginning. Our goal is to make it easier for people anywhere to:
                  </p>
                  <div className="pl-4 space-y-1 text-muted-foreground font-medium text-base md:text-lg">
                     <p>1. Find the right travel companions</p>
                     <p>2. Plan better trips</p>
                     <p>3. Create real connections along the way</p>
                  </div>
                </div>
              </section>
            </div>

            {/* Closing */}
            <section className="pt-10 pb-12">
              <p className="text-xl md:text-2xl font-semibold text-foreground text-center tracking-tight">
                If this resonates with you,<br className="hidden md:block" /> you’re exactly who we’re building for.
              </p>
            </section>

          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}

