// The Me tab (Interest Profile). Ticket 04 adds the language; 06 and 07 fill in the rest.
import { LanguageSetting, T } from "../_components/language";
import { Placeholder } from "../_components/placeholder";

export default function MePage() {
  return (
    <Placeholder title={<T en="Me" ar="أنا" />} after={<LanguageSetting />}>
      <T
        en="Your Topics, opt-ins, city and notification settings will be here."
        ar="ستجد هنا موضوعاتك واختياراتك ومدينتك وإعدادات التنبيهات."
      />
    </Placeholder>
  );
}
