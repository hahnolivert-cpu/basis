import type { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { jsonNoStore, safeMessage } from "@/lib/http";
import { buildFinancialContext } from "@/lib/assistant/context";

// Streams a plain-text response (not SSE) — the client reads the fetch body
// as a stream and appends chunks as they arrive, same idea as ChatGPT's
// typing effect, without needing an SSE parser on either side.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SYSTEM_PREAMBLE = `You are the financial assistant embedded in Ascentic, Oliver's personal net worth and portfolio tracker. You can see his real financial data below — use it to answer questions about his net worth, holdings, spending, and portfolio composition. You can also discuss investment strategy, portfolio theory, and specific stocks/companies/markets using your own knowledge.

You are not a licensed financial advisor. For decisions that turn on his specific tax situation, legal structure, or that a fiduciary should weigh in on, say so plainly and suggest he consult one — but don't caveat every response with a disclaimer, and don't refuse to discuss strategy, allocation, or analysis in general terms.

Be direct and concise. Reference his actual numbers when relevant instead of speaking in generalities. If a question needs data this snapshot doesn't have (e.g. a specific past transaction), say so rather than guessing.`;

type ChatMessage = { role: "user" | "assistant"; content: string };

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return jsonNoStore({ error: "ANTHROPIC_API_KEY not set" }, { status: 503 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonNoStore({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 503 });
  }

  let body: { messages?: ChatMessage[] };
  try {
    body = await request.json();
  } catch {
    return jsonNoStore({ error: "Body must be JSON" }, { status: 400 });
  }

  const messages = (body.messages ?? []).filter(
    (m): m is ChatMessage => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim().length > 0
  );
  if (messages.length === 0) {
    return jsonNoStore({ error: "messages is required" }, { status: 400 });
  }

  let context: string;
  try {
    context = await buildFinancialContext();
  } catch (e) {
    context = `Financial data is temporarily unavailable (${safeMessage(e)}) — answer general questions, but tell the user you can't see his current portfolio/spending right now.`;
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      try {
        const stream = anthropic.messages.stream({
          model: "claude-opus-5",
          max_tokens: 2048,
          system: `${SYSTEM_PREAMBLE}\n\n${context}`,
          messages,
        });
        stream.on("text", (delta) => controller.enqueue(encoder.encode(delta)));
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") {
          controller.enqueue(encoder.encode("I can't help with that one. Try rephrasing, or ask something else."));
        }
        controller.close();
      } catch (e) {
        controller.enqueue(encoder.encode(`\n\n[Error: ${safeMessage(e)}]`));
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
