import { SectionHeader } from "@/components/ui/ios/SectionHeader";
import { GroupContainer } from "@/components/ui/ios/GroupContainer";
import { ListRow } from "@/components/ui/ios/ListRow";
import { Skeleton } from "@/components/ui/skeleton";

export default function AnalyticsLoading() {
  return (
    <div className="max-w-full space-y-6 pb-8">
      {/* Header Loading State */}
      <div className="space-y-1">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-96" />
      </div>

      <div className="space-y-6">
        {/* Section 1: Cohort Growth & Retention */}
        <section>
          <SectionHeader>Cohort Growth & Retention</SectionHeader>
          <GroupContainer>
            {[1, 2, 3].map((i) => (
              <ListRow
                key={i}
                icon={<Skeleton className="h-5 w-5 rounded-full" />}
                label={<Skeleton className="h-4 w-24" />}
                secondary={<Skeleton className="h-3 w-36 mt-1" />}
                trailing={<Skeleton className="h-4 w-12" />}
                showChevron={false}
              />
            ))}
          </GroupContainer>
        </section>

        {/* Section 2: Travel Intentions */}
        <section>
          <SectionHeader>Travel Intentions</SectionHeader>
          <GroupContainer>
            <ListRow
              icon={<Skeleton className="h-5 w-5 rounded-full" />}
              label={<Skeleton className="h-4 w-24" />}
              secondary={<Skeleton className="h-3 w-36 mt-1" />}
              showChevron={false}
            />
            <div className="divide-y divide-border">
              {[1, 2, 3, 4, 5].map((i) => (
                <ListRow
                  key={i}
                  icon={<Skeleton className="h-4 w-4 rounded-full" />}
                  label={<Skeleton className="h-4 w-32" />}
                  secondary={<Skeleton className="h-3 w-24 mt-1" />}
                  trailing={<Skeleton className="h-4 w-12" />}
                  showChevron={false}
                />
              ))}
            </div>
          </GroupContainer>
        </section>

        {/* Section 3: Matchmaking & Signal Funnel */}
        <section>
          <SectionHeader>Matchmaking & Signal Funnel</SectionHeader>
          <GroupContainer>
            {[1, 2].map((i) => (
              <ListRow
                key={i}
                icon={<Skeleton className="h-5 w-5 rounded-full" />}
                label={<Skeleton className="h-4 w-24" />}
                secondary={<Skeleton className="h-3 w-36 mt-1" />}
                trailing={<Skeleton className="h-4 w-12" />}
                showChevron={false}
              />
            ))}
          </GroupContainer>
        </section>

        {/* Section 4: Conversations & Direct Messaging */}
        <section>
          <SectionHeader>Conversations & Direct Messaging</SectionHeader>
          <div className="space-y-4">
            <GroupContainer>
              {[1, 2].map((i) => (
                <ListRow
                  key={i}
                  icon={<Skeleton className="h-5 w-5 rounded-full" />}
                  label={<Skeleton className="h-4 w-24" />}
                  secondary={<Skeleton className="h-3 w-36 mt-1" />}
                  trailing={<Skeleton className="h-4 w-12" />}
                  showChevron={false}
                />
              ))}
            </GroupContainer>
            <GroupContainer>
              <ListRow
                icon={<Skeleton className="h-5 w-5 rounded-full" />}
                label={<Skeleton className="h-4 w-24" />}
                secondary={<Skeleton className="h-3 w-36 mt-1" />}
                showChevron={false}
              />
              <div className="h-[180px] border-t border-border flex items-center justify-center p-6 bg-secondary/5">
                <Skeleton className="h-full w-full rounded-lg" />
              </div>
            </GroupContainer>
          </div>
        </section>

        {/* Section 5: Cohort Messaging Leaderboard */}
        <section>
          <SectionHeader>Cohort Messaging Leaderboard</SectionHeader>
          <GroupContainer className="h-full flex flex-col justify-between">
            <ListRow
              icon={<Skeleton className="h-5 w-5 rounded-full" />}
              label={<Skeleton className="h-4 w-24" />}
              secondary={<Skeleton className="h-3 w-36 mt-1" />}
              showChevron={false}
            />
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
          </GroupContainer>
        </section>

        {/* Section 6: 9-Stage Interaction Funnel */}
        <section>
          <SectionHeader>9-Stage Interaction Funnel</SectionHeader>
          <GroupContainer>
            <ListRow
              icon={<Skeleton className="h-5 w-5 rounded-full" />}
              label={<Skeleton className="h-4 w-24" />}
              secondary={<Skeleton className="h-3 w-36 mt-1" />}
              showChevron={false}
            />
            <div className="border-t border-border p-6 space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="space-y-1">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-2.5 w-full rounded-full" />
                </div>
              ))}
            </div>
          </GroupContainer>
        </section>
      </div>
    </div>
  );
}
