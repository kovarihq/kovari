import { SectionHeader } from "@/components/ui/ios/SectionHeader";
import { Skeleton } from "@/components/ui/skeleton";

export default function BetaAnalyticsLoading() {
  return (
    <div className="max-w-full mx-auto space-y-6 pb-8">
      {/* Header Loading State */}
      <div className="space-y-1">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-96" />
      </div>

      <div className="space-y-6">
        {/* Section 1: Users */}
        <section className="space-y-3">
          <SectionHeader>1. Users & Retention</SectionHeader>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <div className="rounded-xl border bg-card overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 min-h-[52px]">
                  <div className="flex items-center gap-3 w-full">
                    <Skeleton className="h-5 w-5 rounded-full" />
                    <div className="space-y-1 w-2/3">
                      <Skeleton className="h-4 w-1/3" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                </div>
                <div className="h-[220px] border-t border-border flex items-center justify-center p-6">
                  <Skeleton className="h-full w-full rounded-lg" />
                </div>
              </div>
            </div>

            <div>
              <div className="rounded-xl border bg-card overflow-hidden h-full flex flex-col">
                <div className="flex items-center px-4 py-3 min-h-[52px]">
                  <div className="flex items-center gap-3 w-full">
                    <Skeleton className="h-5 w-5 rounded-full" />
                    <Skeleton className="h-4 w-1/3" />
                  </div>
                </div>
                <div className="flex-1 p-6 flex flex-col justify-center space-y-4 border-t border-border">
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-2 w-full rounded-full" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-2 w-full rounded-full" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-2 w-full rounded-full" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2 & 3: Intentions & Interests */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <section className="space-y-3">
            <SectionHeader>2. Travel Intentions</SectionHeader>
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="flex items-center px-4 py-3 min-h-[52px]">
                <div className="flex items-center gap-3 w-full">
                  <Skeleton className="h-5 w-5 rounded-full" />
                  <Skeleton className="h-4 w-1/4" />
                </div>
              </div>
              <div className="border-t border-border p-6 min-h-[300px] flex flex-col justify-between space-y-4">
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex justify-between items-center py-2 border-b border-border/50 last:border-0">
                      <div className="flex items-center gap-3 w-1/2">
                        <Skeleton className="h-3 w-4" />
                        <Skeleton className="h-3 w-full" />
                      </div>
                      <Skeleton className="h-3 w-12" />
                    </div>
                  ))}
                </div>
                <Skeleton className="h-3 w-1/3 mx-auto" />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <SectionHeader>3. Match Interests & Interaction Funnel</SectionHeader>
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="flex items-center px-4 py-3 min-h-[52px]">
                <div className="flex items-center gap-3 w-full">
                  <Skeleton className="h-5 w-5 rounded-full" />
                  <Skeleton className="h-4 w-1/4" />
                </div>
              </div>
              <div className="border-t border-border p-6 min-h-[300px] flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="space-y-1">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-2.5 w-full rounded-full" />
                    </div>
                  ))}
                </div>
                <Skeleton className="h-3 w-1/3 mx-auto" />
              </div>
            </div>
          </section>
        </div>

        {/* Section 4: Conversations */}
        <section className="space-y-3">
          <SectionHeader>4. Conversations & Direct Messaging</SectionHeader>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <div className="rounded-xl border bg-card overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 min-h-[52px]">
                  <div className="flex items-center gap-3 w-full">
                    <Skeleton className="h-5 w-5 rounded-full" />
                    <div className="space-y-1 w-2/3">
                      <Skeleton className="h-4 w-1/3" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                </div>
                <div className="h-[240px] border-t border-border flex items-center justify-center p-6">
                  <Skeleton className="h-full w-full rounded-lg" />
                </div>
              </div>
            </div>

            <div>
              <div className="rounded-xl border bg-card overflow-hidden h-full flex flex-col">
                <div className="flex items-center px-4 py-3 min-h-[52px]">
                  <div className="flex items-center gap-3 w-full">
                    <Skeleton className="h-5 w-5 rounded-full" />
                    <div className="space-y-1 w-2/3">
                      <Skeleton className="h-4 w-1/3" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                </div>
                <div className="flex-1 border-t border-border p-4 flex flex-col justify-between space-y-4">
                  <div className="space-y-3">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="flex items-center gap-3">
                        <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                        <div className="flex-1 space-y-1.5">
                          <Skeleton className="w-20 h-3" />
                          <Skeleton className="w-28 h-2" />
                        </div>
                      </div>
                    ))}
                  </div>
                  <Skeleton className="h-3 w-1/2 mx-auto mt-4" />
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
