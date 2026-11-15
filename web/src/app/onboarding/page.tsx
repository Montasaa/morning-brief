// Onboarding: a first-time Reader picks Topics from the Catalog (never the
// Sensitive ones, which are opted into later from the Me tab), their language
// and their city, before their first Brief. Readers who have finished it go to
// their Brief; the Me tab is where the profile changes after that.
import { redirect } from "next/navigation";
import { getAppContext } from "@/server/app";
import { requireReaderPage } from "@/server/readers/page-session";
import { getProfile } from "@/server/readers/profile";
import { listCatalog } from "@/server/topics/catalog";
import { Onboarding } from "../_components/interest-profile";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const reader = await requireReaderPage();
  const ctx = getAppContext();
  const profile = getProfile(ctx, reader);
  if (profile.onboarded) redirect("/");
  const topics = listCatalog(ctx, reader.id).filter((t) => !t.sensitive);

  return (
    <Onboarding
      basePath={ctx.config.basePath}
      topics={topics}
      initialTopics={profile.topics.filter((id) => topics.some((t) => t.id === id))}
      initialCity={profile.city}
    />
  );
}
