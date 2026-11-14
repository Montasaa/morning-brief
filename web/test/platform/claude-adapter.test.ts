// The real Claude adapter, checked against a stand-in fetch (no network).
import { describe, expect, it } from "vitest";
import { realOutsideServices } from "@/server/outside";
import { claudeService } from "@/server/outside/claude";

type Call = { url: string; init: RequestInit };

function message(content: unknown[], stop_reason = "end_turn") {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content,
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 20 },
  };
}

/** A fetch that answers each call with the next canned body (or status). */
function scriptedFetch(...replies: { status?: number; body: unknown }[]): { calls: Call[]; fetch: typeof fetch } {
  const calls: Call[] = [];
  return {
    calls,
    fetch: (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      const reply = replies[Math.min(calls.length - 1, replies.length - 1)]!;
      return new Response(JSON.stringify(reply.body), {
        status: reply.status ?? 200,
        headers: { "content-type": "application/json", "request-id": "req_1" },
      });
    }) as typeof fetch,
  };
}

const searchAnswer = message([
  { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: { query: "hodeidah port talks" } },
  {
    type: "web_search_tool_result",
    tool_use_id: "srvtoolu_1",
    caller: { type: "direct" },
    content: [
      { type: "web_search_result", url: "https://example.com/a", title: "A", encrypted_content: "x", page_age: null },
    ],
  },
  { type: "server_tool_use", id: "srvtoolu_2", name: "web_fetch", input: { url: "https://example.com/wire/hodeidah" } },
  {
    type: "web_fetch_tool_result",
    tool_use_id: "srvtoolu_2",
    caller: { type: "direct" },
    content: {
      type: "web_fetch_result",
      url: "https://example.com/wire/hodeidah",
      retrieved_at: null,
      content: { type: "document", title: "Wire report", citations: null, source: { type: "text", media_type: "text/plain", data: "..." } },
    },
  },
  { type: "text", text: "The talks ", citations: null },
  {
    type: "text",
    text: "resumed on Friday.",
    citations: [
      { type: "web_search_result_location", url: "https://example.com/a", title: "A", cited_text: "resumed", encrypted_index: "e" },
    ],
  },
]);

describe("Claude adapter", () => {
  it("asks Claude with the key from the environment, web search and fetch, and returns the answer and its links", async () => {
    const { calls, fetch } = scriptedFetch({ body: searchAnswer });
    const claude = claudeService({ apiKey: "sk-ant-test", fetch });

    const reply = await claude.complete({
      purpose: "ask",
      system: "Answer about the Item.",
      messages: [{ role: "user", content: "What happened?" }],
      webSearch: true,
    });

    expect(reply.text).toBe("The talks resumed on Friday.");
    expect(reply.citations).toEqual([
      { title: "A", url: "https://example.com/a" },
      { title: "Wire report", url: "https://example.com/wire/hodeidah" },
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toMatch(/^https:\/\/api\.anthropic\.com\/v1\/messages/);
    const headers = new Headers(calls[0]!.init.headers);
    expect(headers.get("x-api-key") ?? headers.get("authorization")).toContain("sk-ant-test");
    expect(headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body).toMatchObject({
      model: "claude-opus-5-5",
      system: "Answer about the Item.",
      messages: [{ role: "user", content: "What happened?" }],
      thinking: { type: "adaptive" },
      fallbacks: "default",
    });
    expect(body.tools.map((t: { type: string }) => t.type)).toEqual(["web_search_20260209", "web_fetch_20260209"]);
  });

  it("sends no tools when web search is not asked for", async () => {
    const { calls, fetch } = scriptedFetch({ body: message([{ type: "text", text: "Hi.", citations: null }]) });

    const reply = await claudeService({ apiKey: "k", fetch }).complete({ purpose: "x", messages: [{ role: "user", content: "?" }] });

    expect(reply).toEqual({ text: "Hi.", citations: [] });
    expect(JSON.parse(String(calls[0]!.init.body)).tools).toBeUndefined();
  });

  it("continues a turn the server paused during a long search", async () => {
    const paused = message([{ type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: { query: "q" } }], "pause_turn");
    const { calls, fetch } = scriptedFetch({ body: paused }, { body: message([{ type: "text", text: "Done.", citations: null }]) });

    const reply = await claudeService({ apiKey: "k", fetch }).complete({
      purpose: "ask",
      messages: [{ role: "user", content: "?" }],
      webSearch: true,
    });

    expect(reply.text).toBe("Done.");
    expect(calls).toHaveLength(2);
    const second = JSON.parse(String(calls[1]!.init.body));
    expect(second.messages.map((m: { role: string }) => m.role)).toEqual(["user", "assistant"]);
  });

  it("throws when Claude declines or the API refuses, without putting the key in the error", async () => {
    const declined = scriptedFetch({ body: message([], "refusal") });
    await expect(
      claudeService({ apiKey: "sk-ant-secret", fetch: declined.fetch }).complete({ purpose: "ask", messages: [{ role: "user", content: "?" }] }),
    ).rejects.toThrow(/declined/);

    const refused = scriptedFetch({ status: 400, body: { type: "error", error: { type: "invalid_request_error", message: "bad" } } });
    const sending = claudeService({ apiKey: "sk-ant-secret", fetch: refused.fetch, maxRetries: 0 }).complete({
      purpose: "ask",
      messages: [{ role: "user", content: "?" }],
    });
    await expect(sending).rejects.toThrow();
    await expect(sending).rejects.not.toThrow(/sk-ant-secret/);
  });

  it("is used only when ANTHROPIC_API_KEY is set", async () => {
    const request = { purpose: "ask", messages: [{ role: "user" as const, content: "?" }] };

    await expect(realOutsideServices({}).claude.complete(request)).rejects.toThrow(/not connected/);
    // With the key set, the adapter is wired in (calling it would reach the network, which tests forbid).
    await expect(realOutsideServices({ ANTHROPIC_API_KEY: "sk-ant-x" }).claude.complete(request)).rejects.toMatchObject({
      cause: expect.objectContaining({ message: expect.stringMatching(/Real network call/) }),
    });
  });
});
