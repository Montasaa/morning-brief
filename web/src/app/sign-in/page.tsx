// The sign-in page: enter your email, get a magic link. A plain HTML form, so
// it works before (or without) JavaScript. Signed-in Readers go to their Brief.
import { redirect } from "next/navigation";
import { getAppContext } from "@/server/app";
import { currentReader } from "@/server/readers/page-session";
import { buttonStyle, inputStyle } from "../_components/styles";

export const dynamic = "force-dynamic";

type Search = { sent?: string; error?: string };

export default async function SignInPage({ searchParams }: { searchParams: Promise<Search> }) {
  if (await currentReader()) redirect("/");
  const { sent, error } = await searchParams;
  const basePath = getAppContext().config.basePath;

  return (
    <main style={{ maxWidth: 420, margin: "0 auto", padding: "48px 16px" }}>
      <h1 style={{ fontSize: 24, margin: "0 0 8px" }}>Morning Brief</h1>
      {sent ? (
        <>
          <p role="status" data-testid="link-sent" style={{ margin: "0 0 16px" }}>
            Check your email. If this address has been invited, a sign-in link is on its way. It works once and
            expires in 15 minutes.
          </p>
          <a href={`${basePath}/sign-in`}>Use a different email</a>
        </>
      ) : (
        <>
          <p style={{ margin: "0 0 24px", color: "var(--muted)" }}>
            Sign in with your email. We&apos;ll send you a link, no password needed.
          </p>
          {error === "link" && (
            <p data-testid="sign-in-error" style={{ margin: "0 0 16px" }}>
              That sign-in link has expired or was already used. Ask for a new one below.
            </p>
          )}
          {error === "email" && (
            <p data-testid="sign-in-error" style={{ margin: "0 0 16px" }}>
              Enter a valid email address.
            </p>
          )}
          <form method="post" action={`${basePath}/api/auth/magic-link`} style={{ display: "grid", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Email</span>
              <input type="email" name="email" autoComplete="email" inputMode="email" required style={inputStyle} />
            </label>
            <button type="submit" style={buttonStyle}>
              Email me a sign-in link
            </button>
          </form>
        </>
      )}
    </main>
  );
}
