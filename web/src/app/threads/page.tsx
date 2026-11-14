// The Threads tab. Ticket 14 (Story Threads) fills it in.
import { T } from "../_components/language";
import { Placeholder } from "../_components/placeholder";

export default function ThreadsPage() {
  return (
    <Placeholder title={<T en="Threads" ar="القصص المتواصلة" />}>
      <T
        en="The Story Threads you follow and the active ones will be listed here."
        ar="ستظهر هنا القصص المتواصلة التي تتابعها والقصص النشطة."
      />
    </Placeholder>
  );
}
