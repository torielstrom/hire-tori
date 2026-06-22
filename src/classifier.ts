/**
 * Finish classifier — the centerpiece.
 *
 * Reads a Pokemon card photo with Claude vision and decides normal / holo / reverse.
 * Every call is wrapped by PostHog's AI SDK, so it lands in PostHog AI observability
 * as one `$ai_generation` under a trace we control — tagged with the card, the
 * prediction, and (in eval mode) the ground-truth label. That is the whole pitch:
 * you don't read about the model, you watch it think in the product.
 */

import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Anthropic } from "@posthog/ai"; // PostHog-wrapped Anthropic client
import { PostHog } from "posthog-node";
import sharp from "sharp";
import type { Classification, Finish } from "./types.js";

const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";

const SYSTEM = `You are a Pokemon TCG grading assistant. From a photo of one card, decide its
FOIL FINISH (the physical foil treatment, not the rarity text). IMPORTANT: these are scans
taken under direct lighting, so the whole card often shows GLARE / reflection that is NOT
foil. Judge by foil PATTERN and TEXTURE, never by brightness alone.

Definitions:
- "normal": no holographic foil pattern anywhere. The card may still look glossy or have a
  bright reflective streak from the scanner light — plain reflection is NOT foil. This is the
  most common finish; choose it unless you can see an actual foil pattern.
- "holo": the ARTWORK / illustration itself carries a holographic sheen — rainbow/prismatic
  sparkle or mirror-foil INSIDE the picture window.
- "reverse": the artwork is clearly matte/non-foil, AND the rest of the card (border, body,
  text box) shows a distinct, STRUCTURED foil sparkle pattern — cracked-ice / dotted / starry
  holographic texture — not merely a bright reflective sheen.

Rules:
- Separate foil from glare: uniform brightness, a single reflective streak, or overall gloss
  across the whole card is GLARE, not foil → that alone is "normal".
- Require a visibly patterned/holographic texture before choosing holo or reverse.
- Do NOT default to reverse. If you see only generic shine with no patterned foil, choose normal.
- Lower confidence when lighting glare makes the foil pattern hard to confirm.
Always call the report_finish tool. Be honest about uncertainty.`;

const TOOL = {
  name: "report_finish",
  description: "Report the detected foil finish of the card.",
  input_schema: {
    type: "object" as const,
    properties: {
      finish: { type: "string", enum: ["normal", "holo", "reverse"] },
      confidence: { type: "number", description: "0 to 1" },
      reasoning: { type: "string", description: "one sentence of visual evidence" },
    },
    required: ["finish", "confidence", "reasoning"],
  },
};

export function createPostHog(): PostHog {
  const key = process.env.POSTHOG_API_KEY;
  if (!key) throw new Error("POSTHOG_API_KEY not set");
  return new PostHog(key, { host: process.env.POSTHOG_HOST || "https://us.i.posthog.com" });
}

export function createClient(posthog: PostHog): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, posthog });
}

async function toBase64Jpeg(image: Buffer | string): Promise<string> {
  const raw = typeof image === "string" ? await readFile(image) : image;
  // Max long-edge px (IMAGE_MAX_PX). Higher preserves foil micro-texture at more cost;
  // Anthropic downscales above ~1568 anyway. quality 90 keeps the sparkle pattern.
  const maxPx = Number(process.env.IMAGE_MAX_PX || "768");
  const buf = await sharp(raw)
    .rotate()
    .resize(maxPx, maxPx, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
  return buf.toString("base64");
}

export interface ClassifyOpts {
  /** Stable id for the person/run in PostHog. */
  distinctId?: string;
  /** Group this generation under a known trace; default a fresh one per card. */
  traceId?: string;
  /** Extra properties to attach to the trace (e.g. card_id, label, correct). */
  properties?: Record<string, unknown>;
}

export async function classifyFinish(
  client: Anthropic,
  image: Buffer | string,
  opts: ClassifyOpts = {},
): Promise<Classification> {
  const data = await toBase64Jpeg(image);
  const traceId = opts.traceId || randomUUID();

  const resp = await client.messages.create({
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
    // --- PostHog AI observability wiring ---
    posthogDistinctId: opts.distinctId || "finish-classifier",
    posthogTraceId: traceId,
    posthogProperties: { feature: "finish-classifier", model: MODEL, ...opts.properties },
  } as any);

  const block = (resp.content as any[]).find((b) => b.type === "tool_use");
  if (!block) throw new Error("Model did not return a finish classification");
  const input = block.input as { finish: Finish; confidence: number; reasoning: string };
  return { finish: input.finish, confidence: input.confidence, reasoning: input.reasoning };
}
