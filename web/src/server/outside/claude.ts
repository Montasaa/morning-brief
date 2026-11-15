// The real Claude adapter: the Messages API through the official SDK.
// ANTHROPIC_API_KEY comes from the environment and is never logged.
//
// - Model: Claude Opus 5.5 with adaptive thinking.
// - `webSearch: true` gives Claude web search plus web fetch (so it can read
//   the links already in the prompt, such as an Item's sources).
// - Citations: the web-search results Claude cites, then the pages it fetched,
//   each link once.
// - Server-side refusal fallbacks are on ("default"): if the model declines for
//   policy reasons, the API retries on its default fallback model. A request
//   the whole chain declines throws.
//
// With `baseURL` set (LLM_BASE_URL, e.g. OpenCode Go's Anthropic-compatible
// endpoint), it sends a plain Messages API call instead: the chosen model, no
// web search or fetch, no adaptive thinking, no fallbacks, and no citations.
import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import type { ClaudeReply, ClaudeService } from "./index";

export const CLAUDE_MODEL = "claude-opus-5-5";
/** The model on an Anthropic-compatible endpoint when ASK_MODEL is not set (OpenCode Go). */
export const COMPATIBLE_MODEL = "claude-haiku-5-5";
/** OpenCode Go asks clients to name themselves rather than send a generic SDK user agent. */
export const USER_AGENT = "morning-brief/3.0";
/** How many times to resume a turn the server paused (long server-tool runs). */
const MAX_CONTINUATIONS = 3;

export interface ClaudeOptions {
  apiKey: string;
  model?: string;
  /**
   * An Anthropic-compatible endpoint (e.g. https://opencode.ai/inference/go/anthropic).
   * Set, the adapter uses only the plain Messages API; unset, it talks to Anthropic.
   */
  baseURL?: string;
  /** Injected for adapter tests; defaults to the global fetch. */
  fetch?: typeof fetch;
  /** SDK retries for 408/409/429/5xx and connection errors. Default 2. */
  maxRetries?: number;
}

type Params = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type Block = Anthropic.Beta.Messages.BetaContentBlock;

export function claudeService(options: ClaudeOptions): ClaudeService {
  const client = new Anthropic({
    apiKey: options.apiKey,
    ...(options.baseURL ? { baseURL: options.baseURL } : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
    maxRetries: options.maxRetries ?? 2,
  });
  if (options.baseURL) return compatibleService(client, options.model ?? COMPATIBLE_MODEL);
  const model = options.model ?? CLAUDE_MODEL;

  return {
    async complete(request) {
      const tools: Params["tools"] = request.webSearch
        ? [
            { type: "web_search_20260209", name: "web_search", max_uses: 5 },
            { type: "web_fetch_20260209", name: "web_fetch", max_uses: 5 },
          ]
        : undefined;
      let messages: Params["messages"] = request.messages.map((m) => ({ role: m.role, content: m.content }));
      const blocks: Block[] = [];

      for (let turn = 0; ; turn++) {
        const response = await client.beta.messages.create({
          model,
          max_tokens: request.maxTokens ?? 16000,
          ...(request.system ? { system: request.system } : {}),
          messages,
          ...(tools ? { tools } : {}),
          thinking: { type: "adaptive" },
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        });
        if (response.stop_reason === "refusal") throw new Error(`Claude declined to answer (${request.purpose})`);
        blocks.push(...response.content);
        if (response.stop_reason !== "pause_turn" || turn >= MAX_CONTINUATIONS) break;
        // Paused mid-search: send the turn back so the server carries on from where it stopped.
        messages = [...messages, { role: "assistant", content: response.content as Anthropic.Beta.Messages.BetaContentBlockParam[] }];
      }
      return replyFrom(blocks);
    },
  };
}

/**
 * The plain Messages API on an Anthropic-compatible endpoint. Each call is its
 * own conversation, so it gets its own session id (x-opencode-session).
 */
function compatibleService(client: Anthropic, model: string): ClaudeService {
  return {
    async complete(request) {
      const response = await client.messages.create(
        {
          model,
          max_tokens: request.maxTokens ?? 16000,
          ...(request.system ? { system: request.system } : {}),
          messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
        },
        { headers: { "user-agent": USER_AGENT, "x-opencode-session": randomUUID() } },
      );
      if (response.stop_reason === "refusal") throw new Error(`The model declined to answer (${request.purpose})`);
      let text = "";
      for (const block of response.content) if (block.type === "text") text += block.text;
      return { text: text.trim(), citations: [] };
    },
  };
}

function replyFrom(blocks: Block[]): ClaudeReply {
  let text = "";
  const cited: { title?: string; url: string }[] = [];
  const fetched: { title?: string; url: string }[] = [];
  for (const block of blocks) {
    if (block.type === "text") {
      text += block.text;
      for (const c of block.citations ?? []) {
        if (c.type === "web_search_result_location") cited.push({ url: c.url, ...(c.title ? { title: c.title } : {}) });
      }
    } else if (block.type === "web_fetch_tool_result" && block.content.type === "web_fetch_result") {
      const title = block.content.content.title;
      fetched.push({ url: block.content.url, ...(title ? { title } : {}) });
    }
  }
  const seen = new Set<string>();
  const citations = [...cited, ...fetched].filter((c) => !seen.has(c.url) && seen.add(c.url));
  return { text: text.trim(), citations };
}
