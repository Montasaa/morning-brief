// The sign-in page: an email and a password. While the Owner has no password
// yet (their first visit), it also lets the Owner's email choose one. Plain
// HTML forms, so it works before (or without) JavaScript. Signed-in Readers go
// to their Brief.
import { redirect } from "next/navigation";
import { getAppContext } from "@/server/app";
import { currentReader } from "@/server/readers/page-session";
import { ownerNeedsPassword } from "@/server/readers/sign-in";
import { T } from "../_components/language";
import { buttonStyle, inputStyle } from "../_components/styles";

export const dynamic = "force-dynamic";

type Search = { error?: string; first?: string };

const SIGN_IN_ERRORS: Record<string, { en: string; ar: string }> = {
  wrong: { en: "Wrong email or password.", ar: "البريد الإلكتروني أو كلمة المرور غير صحيحة." },
  limit: {
    en: "Too many tries for this email. Wait 15 minutes, then try again.",
    ar: "محاولات كثيرة لهذا البريد. انتظر ١٥ دقيقة ثم حاول مجددًا.",
  },
};

const FIRST_PASSWORD_ERRORS: Record<string, { en: string; ar: string }> = {
  short: { en: "Use at least 8 characters.", ar: "استخدم ٨ أحرف على الأقل." },
  long: { en: "Use at most 200 characters.", ar: "استخدم ٢٠٠ حرف على الأكثر." },
  mismatch: { en: "The two passwords don't match.", ar: "كلمتا المرور غير متطابقتين." },
  refused: {
    en: "A password can't be set for this email here. Sign in instead.",
    ar: "لا يمكن تعيين كلمة مرور لهذا البريد هنا. سجّل الدخول بدلًا من ذلك.",
  },
  limit: SIGN_IN_ERRORS.limit!,
};

const field = { display: "grid", gap: 6 } as const;

export default async function SignInPage({ searchParams }: { searchParams: Promise<Search> }) {
  if (await currentReader()) redirect("/");
  const { error, first } = await searchParams;
  const ctx = getAppContext();
  const basePath = ctx.config.basePath;
  const firstVisit = ownerNeedsPassword(ctx);
  const signInError = error ? SIGN_IN_ERRORS[error] : undefined;
  const firstError = first ? FIRST_PASSWORD_ERRORS[first] : undefined;

  return (
    <main style={{ maxWidth: 420, margin: "0 auto", padding: "48px 16px" }}>
      <h1 style={{ fontSize: 24, margin: "0 0 8px" }}>
        <T en="Morning Brief" ar="الموجز الصباحي" />
      </h1>

      {firstVisit && (
        <section aria-labelledby="first-visit" style={{ margin: "0 0 32px", paddingBottom: 24, borderBottom: "1px solid var(--line)" }}>
          <h2 id="first-visit" style={{ fontSize: "var(--fs-l)", margin: "0 0 4px" }}>
            <T en="First visit: choose the Owner's password" ar="الزيارة الأولى: اختر كلمة مرور المالك" />
          </h2>
          <p style={{ margin: "0 0 16px", color: "var(--mute)" }}>
            <T
              en="The Owner has no password yet. Enter the Owner's email and choose one, at least 8 characters. This works only once."
              ar="لا توجد كلمة مرور للمالك بعد. أدخل بريد المالك واختر كلمة مرور من ٨ أحرف على الأقل. يعمل هذا مرة واحدة فقط."
            />
          </p>
          {firstError && (
            <p role="alert" data-testid="first-password-error" style={{ margin: "0 0 16px" }}>
              <T en={firstError.en} ar={firstError.ar} />
            </p>
          )}
          <form method="post" action={`${basePath}/api/auth/first-password`} style={{ display: "grid", gap: 12 }}>
            <label style={field}>
              <span>
                <T en="Owner's email" ar="بريد المالك" />
              </span>
              <input dir="ltr" type="email" name="email" autoComplete="username" inputMode="email" required style={inputStyle} />
            </label>
            <label style={field}>
              <span>
                <T en="New password" ar="كلمة المرور الجديدة" />
              </span>
              <input dir="ltr" type="password" name="password" autoComplete="new-password" minLength={8} required style={inputStyle} />
            </label>
            <label style={field}>
              <span>
                <T en="Type it again" ar="اكتبها مرة أخرى" />
              </span>
              <input
                dir="ltr"
                type="password"
                name="confirm_password"
                autoComplete="new-password"
                minLength={8}
                required
                style={inputStyle}
              />
            </label>
            <button type="submit" style={buttonStyle}>
              <T en="Set password and sign in" ar="عيّن كلمة المرور وسجّل الدخول" />
            </button>
          </form>
        </section>
      )}

      <p style={{ margin: "0 0 24px", color: "var(--mute)" }}>
        <T en="Sign in with your email and password." ar="سجّل الدخول ببريدك الإلكتروني وكلمة المرور." />
      </p>
      {signInError && (
        <p role="alert" data-testid="sign-in-error" style={{ margin: "0 0 16px" }}>
          <T en={signInError.en} ar={signInError.ar} />
        </p>
      )}
      <form method="post" action={`${basePath}/api/auth/sign-in`} style={{ display: "grid", gap: 12 }}>
        <label style={field}>
          <span>
            <T en="Email" ar="البريد الإلكتروني" />
          </span>
          <input dir="ltr" type="email" name="email" autoComplete="username" inputMode="email" required style={inputStyle} />
        </label>
        <label style={field}>
          <span>
            <T en="Password" ar="كلمة المرور" />
          </span>
          <input dir="ltr" type="password" name="password" autoComplete="current-password" required style={inputStyle} />
        </label>
        <button type="submit" style={buttonStyle}>
          <T en="Sign in" ar="تسجيل الدخول" />
        </button>
      </form>
      <p style={{ margin: "16px 0 0", color: "var(--mute)", fontSize: "var(--fs-s)" }}>
        <T
          en="Forgot your password? Ask the Owner to reset it."
          ar="نسيت كلمة المرور؟ اطلب من المالك إعادة تعيينها."
        />
      </p>
    </main>
  );
}
