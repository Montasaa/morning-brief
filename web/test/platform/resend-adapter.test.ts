// The real Resend adapter, checked against a stand-in fetch (no network).
import { describe, expect, it } from "vitest";
import { realOutsideServices } from "@/server/outside";
import { resendEmailService } from "@/server/outside/resend";

type Call = { url: string; init: RequestInit };

function recordingFetch(status = 200): { calls: Call[]; fetch: typeof fetch } {
  const calls: Call[] = [];
  return {
    calls,
    fetch: (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify(status < 300 ? { id: "email_1" } : { message: "nope" }), { status });
    }) as typeof fetch,
  };
}

describe("Resend email adapter", () => {
  it("posts the email to the Resend API with the key from the environment", async () => {
    const { calls, fetch } = recordingFetch();
    const email = resendEmailService({ apiKey: "re_test_key", from: "Morning Brief <brief@example.com>", fetch });

    await email.send({ to: "sara@example.com", subject: "Sign in", text: "Open https://x", html: "<p>Open</p>" });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.resend.com/emails");
    expect(calls[0]!.init.method).toBe("POST");
    expect(new Headers(calls[0]!.init.headers).get("authorization")).toBe("Bearer re_test_key");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      from: "Morning Brief <brief@example.com>",
      to: ["sara@example.com"],
      subject: "Sign in",
      text: "Open https://x",
      html: "<p>Open</p>",
    });
  });

  it("throws when Resend refuses, without putting the key in the error", async () => {
    const { fetch } = recordingFetch(422);
    const email = resendEmailService({ apiKey: "re_secret", from: "brief@example.com", fetch });

    const sending = email.send({ to: "sara@example.com", subject: "s", text: "t" });

    await expect(sending).rejects.toThrow(/Resend refused the email \(422\)/);
    await expect(sending).rejects.not.toThrow(/re_secret/);
  });

  it("is used only when RESEND_API_KEY and EMAIL_FROM are set", async () => {
    const unset = realOutsideServices({});

    await expect(unset.email.send({ to: "a@example.com", subject: "s", text: "t" })).rejects.toThrow(/not connected/);
    // With both set, the adapter is wired in (sending would reach the network, which tests forbid).
    const set = realOutsideServices({ RESEND_API_KEY: "re_x", EMAIL_FROM: "brief@example.com" });
    await expect(set.email.send({ to: "a@example.com", subject: "s", text: "t" })).rejects.toThrow(/Real network call/);
  });
});
