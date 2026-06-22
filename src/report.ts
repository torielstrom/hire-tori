/** Confusion matrix, per-class precision/recall, and a shareable markdown report. */

import { FINISHES, type Finish, type LabeledSample } from "./types.js";

export interface Result {
  sample: LabeledSample;
  label: Finish;
  predicted: Finish;
  confidence: number;
  reasoning: string;
  correct: boolean;
}

export interface Metrics {
  total: number;
  correct: number;
  accuracy: number;
  matrix: Record<Finish, Record<Finish, number>>; // matrix[actual][predicted]
  perClass: Record<Finish, { precision: number; recall: number; support: number }>;
}

export function computeMetrics(results: Result[]): Metrics {
  const matrix = blankMatrix();
  for (const r of results) matrix[r.label][r.predicted]++;

  const perClass = {} as Metrics["perClass"];
  for (const f of FINISHES) {
    const tp = matrix[f][f];
    const support = FINISHES.reduce((s, p) => s + matrix[f][p], 0);
    const predicted = FINISHES.reduce((s, a) => s + matrix[a][f], 0);
    perClass[f] = {
      precision: predicted ? tp / predicted : 0,
      recall: support ? tp / support : 0,
      support,
    };
  }
  const correct = results.filter((r) => r.correct).length;
  return {
    total: results.length,
    correct,
    accuracy: results.length ? correct / results.length : 0,
    matrix,
    perClass,
  };
}

export function renderReport(m: Metrics, results: Result[], runTag: string): string {
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const L = (s: string) => s.padEnd(9);

  let md = `# Finish classifier — eval report\n\n`;
  md += `_Run \`${runTag}\` · ${m.total} real labeled cards from tcg-lister · model \`${process.env.CLAUDE_MODEL || "claude-sonnet-4-6"}\`_\n\n`;
  md += `**Overall accuracy: ${pct(m.accuracy)}** (${m.correct}/${m.total})\n\n`;

  md += `## Confusion matrix (rows = actual, cols = predicted)\n\n`;
  md += `| actual ↓ \\ pred → | ${FINISHES.map(L).join(" | ")} |\n`;
  md += `|---|${FINISHES.map(() => "---").join("|")}|\n`;
  for (const a of FINISHES) {
    md += `| **${L(a)}** | ${FINISHES.map((p) => L(String(m.matrix[a][p]))).join(" | ")} |\n`;
  }

  md += `\n## Per-class\n\n| finish | precision | recall | support |\n|---|---|---|---|\n`;
  for (const f of FINISHES) {
    const c = m.perClass[f];
    md += `| ${f} | ${pct(c.precision)} | ${pct(c.recall)} | ${c.support} |\n`;
  }

  const misses = results.filter((r) => !r.correct);
  md += `\n## Misclassifications (${misses.length})\n\n`;
  if (!misses.length) {
    md += `_None — clean sweep._\n`;
  } else {
    md += `| card | actual | predicted | conf | model's reasoning |\n|---|---|---|---|---|\n`;
    for (const r of misses) {
      md += `| ${r.sample.cardName || r.sample.cardId || "?"} | ${r.label} | ${r.predicted} | ${r.confidence.toFixed(2)} | ${r.reasoning.replace(/\|/g, "/")} |\n`;
    }
  }
  md += `\n> Open these traces in PostHog → AI observability (filter \`feature = finish-classifier\`, \`run = ${runTag}\`) to see each generation, its tokens, latency, and cost.\n`;
  return md;
}

function blankMatrix(): Record<Finish, Record<Finish, number>> {
  const m = {} as Record<Finish, Record<Finish, number>>;
  for (const a of FINISHES) {
    m[a] = {} as Record<Finish, number>;
    for (const p of FINISHES) m[a][p] = 0;
  }
  return m;
}
