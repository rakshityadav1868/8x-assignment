import "server-only";
import { ASK_STREAM_CONTENT_TYPE, type AskStreamEvent } from "@/lib/contracts";
import type { AskRun } from "@/lib/ai/ask";
import type { ChatMessage, Citation } from "@/lib/types";

/**
 * Turns an AskRun into the NDJSON stream from the contract:
 * `start` → `delta`… → `citations` → `done` (or `error`). Persists the assistant message before `done`.
 */
export function askStreamResponse(
  userMessage: ChatMessage,
  run: AskRun,
  saveAssistant: (content: string, citations: Citation[]) => Promise<ChatMessage>,
): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (ev: AskStreamEvent) => controller.enqueue(enc.encode(JSON.stringify(ev) + "\n"));
      send({ type: "start", user_message: userMessage, ai_mode: run.ai_mode });
      let text = "";
      let citations: Citation[] = [];
      try {
        for await (const chunk of run.stream) {
          if (chunk.type === "delta") {
            text += chunk.text;
            send({ type: "delta", text: chunk.text });
          } else {
            citations = chunk.citations;
          }
        }
        send({ type: "citations", citations });
        const message = await saveAssistant(text.trim(), citations);
        send({ type: "done", message, ai_mode: run.ai_mode });
      } catch (err) {
        console.error("[ask] stream failed", err);
        send({ type: "error", error: "Fanthom couldn't finish that answer. Please try again." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": `${ASK_STREAM_CONTENT_TYPE}; charset=utf-8`,
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
