/**
 * DROP-IN for tcg-lister — production finish detection in the real scan pipeline.
 *
 * This is written against tcg-lister's structure so it can be copied in as-is.
 *
 * INSTALL
 *   1. cp this file to:  tcg-lister/src/server/services/finishClassifier.ts
 *   2. add deps:         npm i @posthog/ai posthog-node  (sharp + @anthropic-ai/sdk already present)
 *   3. set env:          ANTHROPIC_API_KEY, POSTHOG_API_KEY, POSTHOG_HOST
 *   4. wire it in at     tcg-lister/src/server/routes/scan.ts  (see WIRING below)
 *
 * WIRING (scan.ts, right after matchCard returns ~line 108):
 *
 *     const match = await matchCard(ocr, { setIdHint, pattern, imagePath: pp.path });
 *  +  const finish = await classifyFinish(pp.path, {
 *  +    cardId: match.card?.id ?? null,
 *  +    cardName: match.card?.name ?? null,
 *  +  });
 *  +  // finish.finish selects the price column: price_normal | price_holofoil | price_reverse_holo
 *     const scanId = recordScan({ sessionId, pair, result: match, imageSha1 });
 *
 * The operator can still override in the review UI; treat finish as a smart default.
 */

import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Anthropic } from "@posthog/ai";
import { PostHog } from "posthog-node";
import sharp from "sharp";

export type Finish = "normal" | "holo" | "reverse";
export interface FinishResult {
  finish: Finish;
  confidence: number;
  reasoning: string;
  costUsd?: number;
}

const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";

// One shared PostHog + wrapped Anthropic client for the server process.
let _posthog: PostHog | null = null;
let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) {
    _posthog = new PostHog(process.env.POSTHOG_API_KEY!, {
      host: process.env.POSTHOG_HOST || "https://us.i.posthog.com",
    });
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY!, posthog: _posthog });
  }
  return _client;
}

const SYSTEM = `You are a Pokemon TCG grading assistant. Decide a card's FOIL FINISH from a photo:
- "holo": the ARTWORK is foil/shiny.
- "reverse": everything EXCEPT the artwork is foil.
- "normal": no foil; flat matte.
Foil reads as glare/rainbow shimmer/reflective streaks. No visible foil -> "normal", lower confidence.
Always call report_finish.`;

const TOOL = {
  name: "report_finish",
  description: "Report the detected foil finish.",
  input_schema: {
    type: "object" as const,
    properties: {
      finish: { type: "string", enum: ["normal", "holo", "reverse"] },
      confidence: { type: "number" },
      reasoning: { type: "string" },
    },
    required: ["finish", "confidence", "reasoning"],
  },
};

export async function classifyFinish(
  imagePath: string,
  meta: { cardId: string | null; cardName: string | null },
): Promise<FinishResult> {
  const raw = await readFile(imagePath);
  const data = (await sharp(raw).rotate().resize(768, 768, { fit: "inside" }).jpeg({ quality: 85 }).toBuffer()).toString("base64");

  const resp = await client().messages.create({
    model: MODEL,
    max_tokens: 400,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: "tool", name: "report_finish" },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data } },
          { type: "text", text: "Classify this card's foil finish." },
        ],
      },
    ],
    posthogDistinctId: "tcg-lister-scan",
    posthogTraceId: randomUUID(),
    posthogProperties: { feature: "finish-classifier", surface: "tcg-lister", card_id: meta.cardId, card_name: meta.cardName },
  } as any);

  const block = (resp.content as any[]).find((b) => b.type === "tool_use");
  if (!block) throw new Error("No finish classification returned");
  const input = block.input as FinishResult;
  return { finish: input.finish, confidence: input.confidence, reasoning: input.reasoning };
}

/** Call on server shutdown so the last events flush. */
export async function shutdownFinishClassifier(): Promise<void> {
  if (_posthog) await _posthog.shutdown();
}
