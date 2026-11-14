// The Brief tab: the Swipe Brief built from the latest Edition.
import { getAppContext } from "@/server/app";
import { composeBrief } from "@/server/brief/compose";
import { Placeholder } from "./_components/placeholder";
import { SwipeBrief } from "./_components/swipe-brief";

export const dynamic = "force-dynamic";

export default function BriefPage() {
  const brief = composeBrief(getAppContext());

  if (!brief.edition) {
    return (
      <Placeholder title="Morning Brief">
        No Edition yet. The next one arrives after the morning gathering run.
      </Placeholder>
    );
  }
  return <SwipeBrief brief={brief} />;
}
