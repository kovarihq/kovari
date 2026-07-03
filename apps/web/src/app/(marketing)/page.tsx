import LandingContent from "@/shared/components/landing/LandingContent";
import ClientRedirectGate from "@/shared/components/landing/ClientRedirectGate";
import { createAdminSupabaseClient } from "@kovari/api";
import { createMarketingMetadata } from "@/lib/seo";

export async function generateMetadata() {
  return createMarketingMetadata({
    title: "Kovari | Connect & Travel With the Right People",
    description:
      "Kovari helps you plan trips, build travel groups, and find companions who match your travel style. Join the waitlist.",
    path: "/",
  });
}

export default async function HomePage() {
  let initialCount: number | null = null;
  try {
    const supabase = createAdminSupabaseClient();
    const { count, error } = await supabase
      .from("waitlist")
      .select("*", { count: "exact", head: true });

    if (!error && count !== null) {
      initialCount = count;
    }
  } catch (error) {
    console.error("Error fetching waitlist count:", error);
  }

  return (
    <>
      <ClientRedirectGate />
      <LandingContent initialWaitlistCount={initialCount} />
    </>
  );
}


