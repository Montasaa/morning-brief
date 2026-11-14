// The Threads tab. Ticket 14 (Story Threads) fills it in.
import { requireReaderPage } from "@/server/readers/page-session";
import { T } from "../_components/language";
import { Placeholder } from "../_components/placeholder";

export const dynamic = "force-dynamic";

export default async function ThreadsPage() {
  await requireReaderPage();
  return (
    <Placeholder title={<T en="Threads" ar="القصص المتواصلة" />}>
      <T
        en="The Story Threads you follow and the active ones will be listed here."
        ar="ستظهر هنا القصص المتواصلة التي تتابعها والقصص النشطة."
      />
    </Placeholder>
  );
}
