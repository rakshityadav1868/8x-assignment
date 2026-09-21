import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { HttpError } from "@/lib/server/errors";

/** Model is fixed by the spec; env override exists only for local experimentation. */
export const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

const g = globalThis as unknown as { __fanthomAnthropic?: Anthropic };

export function anthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new HttpError(503, "llm_failed", "ANTHROPIC_API_KEY is not configured");
  g.__fanthomAnthropic ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 120_000 });
  return g.__fanthomAnthropic;
}

export class LlmError extends HttpError {
  constructor(message: string) {
    super(502, "llm_failed", message);
    this.name = "LlmError";
  }
}

function textOf(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** Pull the JSON object out of a model reply (tolerates ```json fences and surrounding prose). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object found in model output");
  return JSON.parse(body.slice(start, end + 1));
}

const JSON_RULES =
  "Respond with a single JSON object only — no markdown fences, no commentary before or after. " +
  "Use exactly the keys described. All *_ms fields are integer milliseconds.";

export interface GenerateOptions {
  maxTokens?: number;
}

/**
 * Ask Claude for JSON matching `schema`. Validates with zod; on invalid output retries once,
 * feeding the validation error back. Throws `LlmError` (502 llm_failed) when both attempts fail.
 */
export async function generateJSON<S extends z.ZodType>(
  schema: S,
  system: string,
  user: string,
  opts: GenerateOptions = {},
): Promise<z.output<S>> {
  const client = anthropic();
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: user }];
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: opts.maxTokens ?? 4096,
      system: `${system}\n\n${JSON_RULES}`,
      messages,
    });
    const text = textOf(res);
    try {
      const parsed = schema.safeParse(extractJson(text));
      if (parsed.success) return parsed.data;
      lastError = parsed.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
    messages.push(
      { role: "assistant", content: text || "(empty)" },
      {
        role: "user",
        content: `That output was invalid (${lastError}). Return ONLY the corrected JSON object, nothing else.`,
      },
    );
  }
  throw new LlmError(`Model returned invalid JSON: ${lastError}`);
}

/** Stream plain text deltas from Claude. */
export async function* streamText(
  system: string,
  messages: Anthropic.MessageParam[],
  opts: GenerateOptions = {},
): AsyncGenerator<string> {
  const stream = anthropic().messages.stream({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 1500,
    system,
    messages,
  });
  for await (const ev of stream) {
    if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") yield ev.delta.text;
  }
}
