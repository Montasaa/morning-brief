// The sign-in page: enter your email, get a magic link. A plain HTML form, so
// it works before (or without) JavaScript. Signed-in Readers go to their Brief.
import { redirect } from "next/navigation";
import { getAppContext } from "@/server/app";
import { currentReader } from "@/server/readers/page-session";
import { T } from "../_components/language";
import { buttonStyle, inputStyle } from "../_components/styles";

export const dynamic = "force-dynamic";

type Search = { sent?: string; error?: string };

export default async function SignInPage({ searchParams }: { searchParams: Promise<Search> }) {
  if (await currentReader()) redirect("/");
  const { sent, error } = await searchParams;
  const basePath = getAppContext().config.basePath;

  return (
    <main style={{ maxWidth: 420, margin: "0 auto", padding: "48px 16px" }}>
      <h1 style={{ fontSize: 24, margin: "0 0 8px" }}>
        <T en="Morning Brief" ar="الموجز الصباحي" />
      </h1>
      {sent ? (
        <>
          <p role="status" data-testid="link-sent" style={{ margin: "0 0 16px" }}>
            <T
              en="Check your email. If this address has been invited, a sign-in link is on its way. It works once and expires in 15 minutes."
              ar="تحقق من بريدك. إن كان هذا العنوان مدعوًا فرابط تسجيل الدخول في طريقه إليك. يعمل مرة واحدة وتنتهي صلاحيته بعد ١٥ دقيقة."
            />
          </p>
          <a href={`${basePath}/sign-in`}>
            <T en="Use a different email" ar="استخدم بريدًا آخر" />
          </a>
        </>
      ) : (
        <>
          <p style={{ margin: "0 0 24px", color: "var(--muted)" }}>
            <T
              en="Sign in with your email. We'll send you a link, no password needed."
              ar="سجّل الدخول ببريدك. سنرسل إليك رابطًا، دون حاجة إلى كلمة مرور."
            />
          </p>
          {error === "link" && (
            <p data-testid="sign-in-error" style={{ margin: "0 0 16px" }}>
              <T
                en="That sign-in link has expired or was already used. Ask for a new one below."
                ar="انتهت صلاحية رابط تسجيل الدخول هذا أو سبق استخدامه. اطلب رابطًا جديدًا أدناه."
              />
            </p>
          )}
          {error === "email" && (
            <p data-testid="sign-in-error" style={{ margin: "0 0 16px" }}>
              <T en="Enter a valid email address." ar="أدخل عنوان بريد صحيحًا." />
            </p>
          )}
          <form method="post" action={`${basePath}/api/auth/magic-link`} style={{ display: "grid", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span>
                <T en="Email" ar="البريد الإلكتروني" />
              </span>
              <input dir="ltr" type="email" name="email" autoComplete="email" inputMode="email" required style={inputStyle} />
            </label>
            <button type="submit" style={buttonStyle}>
              <T en="Email me a sign-in link" ar="أرسل لي رابط تسجيل الدخول" />
            </button>
          </form>
        </>
      )}
    </main>
  );
}
