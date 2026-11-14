// The Me tab (Interest Profile). Ticket 04 adds the language and 06 the account
// (who is signed in, the Owner's Invites, Sign out); 07 fills in the rest.
import { getAppContext } from "@/server/app";
import { requireReaderPage } from "@/server/readers/page-session";
import { AccountBar } from "../_components/account-bar";
import { LanguageSetting, T } from "../_components/language";
import { Placeholder } from "../_components/placeholder";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const reader = await requireReaderPage();
  return (
    <Placeholder
      title={<T en="Me" ar="أنا" />}
      before={<AccountBar reader={reader} basePath={getAppContext().config.basePath} />}
      after={<LanguageSetting />}
    >
      <T
        en="Your Topics, opt-ins, city and notification settings will be here."
        ar="ستجد هنا موضوعاتك واختياراتك ومدينتك وإعدادات التنبيهات."
      />
    </Placeholder>
  );
}
