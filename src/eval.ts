/**
 * Eval harness — the "show, don't tell."
 *
 * Runs the finish classifier over real labeled cards from tcg-lister, scores it,
 * streams every classification into PostHog AI observability (one trace per card,
 * tagged with the label + whether it was right), fires summary product-analytics
 * events, and writes a confusion-matrix report you can hand to anyone.
 *
 *   npm run eval
 */

import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { classifyFinish, createClient, createPostHog } from "./classifier.js";
import { countByLabel } from "./data.js";
import { getDataSource } from "./source.js";
import { computeMetrics, renderReport, type Result } from "./report.js";

const PER_CLASS = Number(process.env.EVAL_PER_CLASS || "15");
const CONCURRENCY = Number(process.env.EVAL_CONCURRENCY || "4");
const DISTINCT_ID = "finish-eval";

async function pool<T, R>(items: T[], limit: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

async function main() {
  const runTag = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const source = getDataSource();
  const samples = await source.load(PER_CLASS);
  if (!samples.length) {
    console.error("No labeled samples found. Check DATA_SOURCE / R2 creds / tcg-lister data.");
    process.exit(1);
  }
  console.log(`Source: ${source.name}. Evaluating ${samples.length} cards (${JSON.stringify(countByLabel(samples))}) with concurrency ${CONCURRENCY}...`);

  const posthog = createPostHog();
  const client = createClient(posthog);

  const results = await pool(samples, CONCURRENCY, async (s, i) => {
    const traceId = randomUUID();
    let result: Result;
    try {
      const buf = await source.image(s);
      const c = await classifyFinish(client, buf, {
        distinctId: DISTINCT_ID,
        traceId,
        properties: { run: runTag, card_id: s.cardId, label: s.label },
      });
      result = {
        sample: s,
        label: s.label,
        predicted: c.finish,
        confidence: c.confidence,
        reasoning: c.reasoning,
        correct: c.finish === s.label,
      };
    } catch (e) {
      result = {
        sample: s,
        label: s.label,
        predicted: s.label, // neutral; flagged via reasoning
        confidence: 0,
        reasoning: `ERROR: ${(e as Error).message}`,
        correct: false,
      };
    }
    // Eval verdict as a product-analytics event, linked to the same trace.
    posthog.capture({
      distinctId: DISTINCT_ID,
      event: "finish_eval_item",
      properties: {
        run: runTag,
        $ai_trace_id: traceId,
        card_id: s.cardId,
        card_name: s.cardName,
        label: result.label,
        predicted: result.predicted,
        correct: result.correct,
        confidence: result.confidence,
      },
    });
    console.log(`  [${i + 1}/${samples.length}] ${result.correct ? "ok " : "MISS"} ${result.label}->${result.predicted} ${s.cardName || s.cardId || ""}`);
    return result;
  });

  const metrics = computeMetrics(results);
  posthog.capture({
    distinctId: DISTINCT_ID,
    event: "finish_eval_run",
    properties: {
      run: runTag,
      total: metrics.total,
      accuracy: metrics.accuracy,
      per_class: metrics.perClass,
    },
  });

  const report = renderReport(metrics, results, runTag);
  mkdirSync("reports", { recursive: true });
  const path = join("reports", `eval-${runTag}.md`);
  writeFileSync(path, report);

  await posthog.shutdown();
  console.log(`\nAccuracy: ${(metrics.accuracy * 100).toFixed(1)}%  ->  ${path}`);
  console.log("Traces in PostHog: AI observability, filter feature=finish-classifier run=" + runTag);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
