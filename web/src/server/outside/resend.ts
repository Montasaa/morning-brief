// The real email adapter: Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email).
// RESEND_API_KEY and EMAIL_FROM come from the environment; the key is never logged.
import type { EmailService } from "./index";

export interface ResendOptions {
  apiKey: string;
  /** The sender, e.g. "Morning Brief <brief@your-domain>", on a domain verified in Resend. */
  from: string;
  /** Injected for adapter tests; defaults to the global fetch. */
  fetch?: typeof fetch;
}

export function resendEmailService(options: ResendOptions): EmailService {
  return {
    async send(message) {
      const doFetch = options.fetch ?? fetch;
      const res = await doFetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${options.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          from: options.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          ...(message.html ? { html: message.html } : {}),
        }),
      });
      if (!res.ok) throw new Error(`Resend refused the email (${res.status})`);
    },
  };
}
