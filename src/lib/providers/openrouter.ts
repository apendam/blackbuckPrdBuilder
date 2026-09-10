import { CanonicalMessage, CanonicalToolCall, ProviderAdapter, ProviderCallResult } from "./types";

const CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";

function isImage(mediaType: string): boolean {
  return mediaType.startsWith("image/");
}

interface OpenAIContentPart {
  type: "text" | "image_url" | "file";
  text?: string;
  image_url?: { url: string };
  file?: { filename: string; file_data: string };
}

interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | OpenAIContentPart[] | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

// Attachments beyond plain text depend on the specific model's declared input
// modalities (OpenRouter's catalog exposes this per model), which this
// adapter doesn't have visibility into at call time -- so images/PDFs are
// sent as best-effort standard OpenAI-format content parts; a model that
// doesn't support them will just ignore or error on that part, same as
// pointing any multimodal request at a text-only model.
function userContent(m: CanonicalMessage): string | OpenAIContentPart[] {
  const attachments = m.attachments ?? [];
  if (attachments.length === 0) {
    return m.text ?? "";
  }

  const parts: OpenAIContentPart[] = [];
  let inlineText = m.text ?? "";

  for (const att of attachments) {
    if (att.mediaType === "application/pdf") {
      parts.push({
        type: "file",
        file: { filename: att.name, file_data: `data:application/pdf;base64,${att.base64}` },
      });
    } else if (isImage(att.mediaType)) {
      parts.push({ type: "image_url", image_url: { url: `data:${att.mediaType};base64,${att.base64}` } });
    } else {
      try {
        const text = Buffer.from(att.base64, "base64").toString("utf-8");
        inlineText += `\n\n--- Attached file: ${att.name} ---\n${text}\n--- end ${att.name} ---`;
      } catch {
        inlineText += `\n\n[Could not decode attached file: ${att.name}]`;
      }
    }
  }

  parts.unshift({ type: "text", text: inlineText });
  return parts;
}

function toOpenAIMessages(systemPrompt: string, history: CanonicalMessage[]): OpenAIMessage[] {
  const messages: OpenAIMessage[] = [{ role: "system", content: systemPrompt }];
  for (const m of history) {
    if (m.role === "user") {
      messages.push({ role: "user", content: userContent(m) });
    } else if (m.role === "assistant") {
      messages.push({
        role: "assistant",
        // OpenAI's own spec allows `content: null` on an assistant message
        // that's pure tool_calls with no text, but not every OpenAI-compatible
        // backend agrees -- Alibaba's Qwen models reject a null content field
        // outright ("The content field is a required field."). An empty
        // string satisfies both.
        content: m.text || "",
        ...(m.toolCalls && m.toolCalls.length > 0
          ? {
              tool_calls: m.toolCalls.map((tc) => ({
                id: tc.id,
                type: "function" as const,
                function: { name: tc.name, arguments: JSON.stringify(tc.input) },
              })),
            }
          : {}),
      });
    } else if (m.role === "tool") {
      // OpenAI-compatible format wants one message per tool result, unlike
      // Anthropic's single user message carrying multiple tool_result blocks.
      for (const tr of m.toolResults ?? []) {
        messages.push({ role: "tool", tool_call_id: tr.toolCallId, content: tr.content });
      }
    }
  }
  return messages;
}

export const openrouterAdapter: ProviderAdapter = {
  provider: "openrouter",
  async callOnce({ model, systemPrompt, history, tools }): Promise<ProviderCallResult> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY is not set. Add it to .env.local to use OpenRouter models.");
    }

    const body: Record<string, unknown> = {
      model,
      messages: toOpenAIMessages(systemPrompt, history),
      // A full PRD's entire markdown text has to fit inside a single
      // save_prd_markdown/create_google_doc tool-call argument -- this was
      // previously left unset (provider default), which silently truncated
      // those calls mid-argument into invalid JSON.
      max_tokens: 64000,
    };
    if (tools) {
      body.tools = tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.schema },
      }));
      body.tool_choice = "auto";
    }

    const res = await fetch(CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://blackbuck.com",
        "X-Title": "Blackbuck PRD Builder",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`OpenRouter request failed: ${res.status} ${errBody}`);
    }

    const data = await res.json();
    const choice = data.choices?.[0];
    if (!choice) {
      throw new Error(`OpenRouter returned no choices: ${JSON.stringify(data)}`);
    }

    const message = choice.message ?? {};
    const usage = data.usage ?? {};
    const providerUsage = {
      inputTokens: usage.prompt_tokens ?? 0,
      outputTokens: usage.completion_tokens ?? 0,
      cost: typeof usage.cost === "number" ? usage.cost : undefined,
    };

    if (choice.finish_reason === "length") {
      // OpenAI-compatible convention for "hit the token limit" -- any tool
      // call in this response may be an argument string cut off mid-JSON.
      // Same reasoning as Anthropic's stop_reason === "max_tokens": don't
      // trust it, surface it as visible text instead.
      const text =
        (typeof message.content === "string" ? message.content : "") +
        "\n\n[Response was cut off at the token limit -- if a tool call above looks incomplete, retry it, splitting the content into smaller pieces if it's very long.]";
      return { text, toolCalls: [], usage: providerUsage };
    }

    const rawToolCalls: {
      id: string;
      function: { name: string; arguments: string };
    }[] = message.tool_calls ?? [];

    const toolCalls: CanonicalToolCall[] = rawToolCalls.map((tc) => {
      try {
        return { id: tc.id, name: tc.function.name, input: JSON.parse(tc.function.arguments) };
      } catch (err) {
        return {
          id: tc.id,
          name: tc.function.name,
          input: {},
          parseError: err instanceof Error ? err.message : "invalid JSON",
        };
      }
    });

    return {
      text: typeof message.content === "string" ? message.content : "",
      toolCalls,
      usage: providerUsage,
    };
  },
};
