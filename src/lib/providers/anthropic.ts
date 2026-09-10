import Anthropic from "@anthropic-ai/sdk";
import { modelSupportsEffort } from "../modelSettingsShared";
import { CanonicalMessage, CanonicalToolCall, ProviderAdapter, ProviderCallResult } from "./types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TEXT_DECODABLE_PREFIXES = ["text/", "application/json"];
function isImage(mediaType: string): boolean {
  return mediaType.startsWith("image/");
}
function isTextDecodable(mediaType: string): boolean {
  return TEXT_DECODABLE_PREFIXES.some((p) => mediaType.startsWith(p));
}

// Attached API docs / flow descriptions become real content blocks -- PDFs
// and images go in as Anthropic document/image blocks (so the model actually
// reads diagrams/screenshots, not just a filename), plain-text files get
// decoded and inlined into the text block.
function userContentBlocks(m: CanonicalMessage): string | Anthropic.ContentBlockParam[] {
  const attachments = m.attachments ?? [];
  if (attachments.length === 0) {
    return m.text ?? "";
  }

  const blocks: Anthropic.ContentBlockParam[] = [];
  let inlineText = "";

  for (const att of attachments) {
    if (att.mediaType === "application/pdf") {
      blocks.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: att.base64 },
      });
    } else if (isImage(att.mediaType)) {
      blocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: att.mediaType as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
          data: att.base64,
        },
      });
    } else if (isTextDecodable(att.mediaType)) {
      try {
        const text = Buffer.from(att.base64, "base64").toString("utf-8");
        inlineText += `\n\n--- Attached file: ${att.name} ---\n${text}\n--- end ${att.name} ---`;
      } catch {
        inlineText += `\n\n[Could not decode attached file: ${att.name}]`;
      }
    } else {
      inlineText += `\n\n[Attached file "${att.name}" (${att.mediaType}) -- unsupported type, not included]`;
    }
  }

  blocks.push({ type: "text", text: (m.text ?? "") + inlineText });
  return blocks;
}

// Marks the tail of an array as a prompt-cache breakpoint (Anthropic reuses
// the cached prefix up to here on the next call). The system prompt, tools,
// and full message history are IDENTICAL or a pure superset from one
// tool-call round to the next within a turn -- without this, every single
// round re-sends and re-bills the entire growing history at full price,
// which is exactly what turned one Phase 8 expansion into a $8.86, 1.7M-token
// bill. Anthropic allows up to 4 such breakpoints per request; one each on
// system/tools/history-tail is well under that and covers the three things
// that actually stay stable (or only grow) call-to-call.
function withCacheBreakpoint<T extends object>(items: T[]): T[] {
  if (items.length === 0) return items;
  const idx = items.length - 1;
  const last = { ...items[idx], cache_control: { type: "ephemeral" as const } } as T;
  return [...items.slice(0, idx), last];
}

function toAnthropicMessages(history: CanonicalMessage[]): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = [];
  for (const m of history) {
    if (m.role === "user") {
      messages.push({ role: "user", content: userContentBlocks(m) });
    } else if (m.role === "assistant") {
      const blocks: Anthropic.ContentBlockParam[] = [];
      if (m.text) blocks.push({ type: "text", text: m.text });
      for (const tc of m.toolCalls ?? []) {
        blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input });
      }
      messages.push({ role: "assistant", content: blocks });
    } else if (m.role === "tool") {
      const blocks: Anthropic.ToolResultBlockParam[] = (m.toolResults ?? []).map((tr) => ({
        type: "tool_result",
        tool_use_id: tr.toolCallId,
        content: tr.content,
      }));
      messages.push({ role: "user", content: blocks });
    }
  }
  return messages;
}

export const anthropicAdapter: ProviderAdapter = {
  provider: "anthropic",
  async callOnce({ model, effort, systemPrompt, history, tools }): Promise<ProviderCallResult> {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set. Add it to .env.local before starting a conversation.");
    }

    const anthropicTools: Anthropic.Tool[] | undefined = tools
      ? withCacheBreakpoint(
          tools.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.schema as Anthropic.Tool.InputSchema,
          }))
        )
      : undefined;

    // The full tool-call history within one turn only ever grows (each round
    // appends, never edits, earlier ones) -- cache its tail so the next round
    // reuses everything before it instead of re-billing the whole thing.
    const anthropicMessages = toAnthropicMessages(history);
    if (anthropicMessages.length > 0) {
      const lastIdx = anthropicMessages.length - 1;
      const last = anthropicMessages[lastIdx];
      const blocks: Anthropic.ContentBlockParam[] =
        typeof last.content === "string" ? [{ type: "text", text: last.content }] : [...last.content];
      anthropicMessages[lastIdx] = { ...last, content: withCacheBreakpoint(blocks) };
    }

    // Streaming, not .create() -- the Anthropic SDK refuses a non-streaming
    // request outright once max_tokens is high enough that generation might
    // run past 10 minutes ("Streaming is required for operations that may
    // take longer than 10 minutes"), which a full PRD's tool-call argument
    // genuinely can. .finalMessage() collects the stream into the exact same
    // Message shape .create() would have returned, so nothing below this
    // needs to change.
    const stream = client.messages.stream({
      model,
      // A full PRD's entire markdown text has to fit inside a single
      // save_prd_markdown/create_google_doc tool-call argument -- 4096 was
      // nowhere near enough and silently truncated those calls mid-argument.
      // Bumped again from 32000: Phase 8's repo-grounded Failure/Timeout
      // requirement makes full PRDs noticeably longer, and a "high"-effort
      // call's own reasoning tokens also eat into this ceiling before the
      // tool-call JSON is even started.
      max_tokens: 64000,
      // The skill + system-map + app-override text is identical on literally
      // every call this app ever makes -- caching it means only the first
      // call of a conversation pays full price for it.
      system: withCacheBreakpoint([{ type: "text", text: systemPrompt }]),
      messages: anthropicMessages,
      ...(anthropicTools ? { tools: anthropicTools } : {}),
      ...(effort && modelSupportsEffort(model) ? { output_config: { effort } } : {}),
    });
    const response = await stream.finalMessage();

    const toolCalls: CanonicalToolCall[] = response.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
      .map((b) => ({ id: b.id, name: b.name, input: b.input as Record<string, unknown> }));

    // Anthropic's own docs: "Total input tokens in a request is the
    // summation of input_tokens, cache_creation_input_tokens, and
    // cache_read_input_tokens" -- reading only input_tokens (as this used to)
    // silently drops almost the entire request the moment prompt caching
    // actually hits, since a cache-read turn can report input_tokens as low
    // as single digits. That showed up as a real turn's cost/token badge
    // reading "2 tokens" instead of the ~1.5M it actually processed. This
    // undercounts true dollar cost slightly the other way (a cache-read
    // token is billed well below the full input rate, and this still prices
    // it at the flat input rate in pricing.ts), but that's a conservative
    // overstatement, not a near-total silent loss like the bug it replaces.
    const totalInputTokens =
      (response.usage.input_tokens ?? 0) +
      (response.usage.cache_creation_input_tokens ?? 0) +
      (response.usage.cache_read_input_tokens ?? 0);

    if (response.stop_reason === "max_tokens") {
      // Even at 32000 this is a real signal, not a false alarm -- surface it
      // as visible text rather than silently returning a truncated tool call
      // or reply.
      const truncationNote =
        "\n\n[Response was cut off at the token limit -- if a tool call above looks incomplete, retry it, splitting the content into smaller pieces if it's very long.]";
      return {
        text:
          response.content
            .filter((b): b is Anthropic.TextBlock => b.type === "text")
            .map((b) => b.text)
            .join("\n\n") + truncationNote,
        toolCalls: [],
        usage: { inputTokens: totalInputTokens, outputTokens: response.usage.output_tokens },
      };
    }
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n\n");

    return {
      text,
      toolCalls,
      usage: { inputTokens: totalInputTokens, outputTokens: response.usage.output_tokens },
    };
  },
};
