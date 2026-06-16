import LandingContent from "@/shared/components/landing/LandingContent";
import ClientRedirectGate from "@/shared/components/landing/ClientRedirectGate";

export async function generateMetadata() {
  return {
    title: "Kovari | Connect & Travel With the Right People",
    description: "Kovari helps you plan trips, build travel groups, and find companions who match your travel style. Join the waitlist.",
  };
}

export default function HomePage() {
  return (
    <>
      <ClientRedirectGate />
      <LandingContent />
    </>
  );
}

