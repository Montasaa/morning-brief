// The Threads tab (ticket 14): the Story Threads the Reader follows, then the
// other active ones (carried by the latest Edition).
import { getAppContext } from "@/server/app";
import { requireReaderPage } from "@/server/readers/page-session";
import { listThreads } from "@/server/threads/threads";
import { ThreadList } from "../_components/thread-views";

export const dynamic = "force-dynamic";

export default async function ThreadsPage() {
  const reader = await requireReaderPage();
  const ctx = getAppContext();
  return <ThreadList threads={listThreads(ctx, reader.id)} basePath={ctx.config.basePath} />;
}
