// Me › Password: the signed-in Reader changes their own password, giving the
// current one. A plain HTML form posting to /api/auth/password, which redirects
// back here with the outcome. This device stays signed in; their others are signed out.
import Link from "next/link";
import { getAppContext } from "@/server/app";
import { requireReaderPage } from "@/server/readers/page-session";
import { Chevron } from "../../_components/chevron";
import c from "../../_components/chrome.module.css";
import { T } from "../../_components/language";
import { buttonStyle, inputStyle } from "../../_components/styles";

export const dynamic = "force-dynamic";

type Search = { error?: string; changed?: string };

const ERRORS: Record<string, { en: string; ar: string }> = {
  wrong: { en: "Your current password is wrong.", ar: "كلمة المرور الحالية غير صحيحة." },
  short: { en: "Use at least 8 characters for the new password.", ar: "استخدم ٨ أحرف على الأقل لكلمة المرور الجديدة." },
  long: { en: "Use at most 200 characters for the new password.", ar: "استخدم ٢٠٠ حرف على الأكثر لكلمة المرور الجديدة." },
  mismatch: { en: "The two new passwords don't match.", ar: "كلمتا المرور الجديدتان غير متطابقتين." },
  limit: { en: "Too many tries. Wait 15 minutes, then try again.", ar: "محاولات كثيرة. انتظر ١٥ دقيقة ثم حاول مجددًا." },
};

const field = { display: "grid", gap: 6 } as const;

export default async function PasswordPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireReaderPage();
  const { error, changed } = await searchParams;
  const basePath = getAppContext().config.basePath;
  const problem = error ? ERRORS[error] : undefined;
  return (
    <main className={c.screen}>
      <Link href="/me" className={c.back}>
        <Chevron to="back" size={18} />
        <span>
          <T en="Back to Me" ar="العودة إلى «أنا»" />
        </span>
      </Link>
      <h1>
        <T en="Password" ar="كلمة المرور" />
      </h1>
      <p className={c.lede}>
        <T
          en="Change the password you sign in with. You stay signed in here; your other devices are signed out."
          ar="غيّر كلمة المرور التي تسجّل الدخول بها. تبقى مسجّلًا هنا، ويُسجَّل خروجك من أجهزتك الأخرى."
        />
      </p>
      {changed && (
        <p role="status" data-testid="password-changed" style={{ margin: "16px 0 0" }}>
          <T
            en="Password changed. Use it next time you sign in."
            ar="تم تغيير كلمة المرور. استخدمها في المرة القادمة التي تسجّل فيها الدخول."
          />
        </p>
      )}
      {problem && (
        <p role="alert" data-testid="password-error" style={{ margin: "16px 0 0" }}>
          <T en={problem.en} ar={problem.ar} />
        </p>
      )}
      <form method="post" action={`${basePath}/api/auth/password`} style={{ display: "grid", gap: 12, marginTop: 20 }}>
        <label style={field}>
          <span>
            <T en="Current password" ar="كلمة المرور الحالية" />
          </span>
          <input dir="ltr" type="password" name="current_password" autoComplete="current-password" required style={inputStyle} />
        </label>
        <label style={field}>
          <span>
            <T en="New password" ar="كلمة المرور الجديدة" />
          </span>
          <input dir="ltr" type="password" name="new_password" autoComplete="new-password" minLength={8} required style={inputStyle} />
        </label>
        <label style={field}>
          <span>
            <T en="Type the new password again" ar="اكتب كلمة المرور الجديدة مرة أخرى" />
          </span>
          <input dir="ltr" type="password" name="confirm_password" autoComplete="new-password" minLength={8} required style={inputStyle} />
        </label>
        <button type="submit" style={buttonStyle}>
          <T en="Change password" ar="تغيير كلمة المرور" />
        </button>
      </form>
    </main>
  );
}
