// One Story Thread's dated timeline (ticket 14): each development is its own
// Item, newest first, across every Edition.
import { notFound } from "next/navigation";
import { getAppContext } from "@/server/app";
import { requireReaderPage } from "@/server/readers/page-session";
import { threadTimeline } from "@/server/threads/threads";
import { ThreadTimelineView } from "../../_components/thread-views";

export const dynamic = "force-dynamic";

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const reader = await requireReaderPage();
  const ctx = getAppContext();
  const timeline = threadTimeline(ctx, reader.id, (await params).id);
  if (!timeline) notFound();
  return <ThreadTimelineView timeline={timeline} basePath={ctx.config.basePath} />;
}
