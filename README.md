# Reading the foil — a finish classifier, instrumented in PostHog

I want to be PostHog's Developer Marketer for AI observability. So instead of
describing the product, I built a real feature for my own Pokémon pipeline — card
**finish detection** — and instrumented it end-to-end in PostHog AI observability.

I run [ChaseDex](https://chasedex.com) — a Pokémon TCG app, a card-scanning tool
(tcg-lister), and the data pipeline behind them. My scanner already identifies *which*
card you photographed. It couldn't tell the **finish** — normal vs **holo** (foil on
the art) vs **reverse holo** (foil everywhere *but* the art) — and finish is what
decides the price: `price_normal` vs `price_holofoil` vs `price_reverse_holo`.

So I built a vision-LLM that reads finish from a card photo, and I wired it through
**PostHog AI observability.** Every classification is a trace you can open and watch:
the image in, the model's reasoning, tokens, latency, cost. Then I **evaluated it
against my real labeled scans** and let PostHog show me exactly where it fails.

That's the pitch for AI observability — built, not slide-decked.

## What this does

| Piece | File | What it is |
|------|------|------------|
| Classifier | `src/classifier.ts` | Claude vision → `{finish, confidence, reasoning}`, wrapped by `@posthog/ai` so each call is one `$ai_generation` trace |
| Eval harness | `src/eval.ts` | Runs it over real labeled cards, scores it, streams traces + verdicts to PostHog, writes a confusion-matrix report |
| Report | `reports/eval-*.md` | Accuracy, confusion matrix, and every miss with the model's own reasoning |
| Prod drop-in | `integration/tcg-lister/finishClassifier.ts` | The same thing, ready to wire into the live scan pipeline (`scan.ts:108`) to auto-pick the price variant |

The eval data is **real**: tcg-lister retains every committed scan as a labeled sample
(`training_samples.printing` + the photo), so this measures the model on cards I
actually scanned — not synthetic data.

## Run it

```bash
npm install
cp .env.example .env     # add ANTHROPIC_API_KEY; PostHog + tcg-lister path are prefilled
npm run eval             # evaluates EVAL_PER_CLASS cards per finish, writes a report
```

Then open **PostHog → AI observability** and filter `feature = finish-classifier`.
Each card is a trace; the run summary lands as a `finish_eval_run` event.

Quick single-card test:

```bash
npm run classify -- "/path/to/a/card.jpg"
```

## Why finish is the interesting class

`holo` and `normal` are usually easy. **`reverse` is the hard one** — on a low-glare
photo the foil cue can vanish, and that's precisely the kind of failure mode AI
observability exists to surface. The report calls it out; the traces let me see why;
the fix is a prompt/threshold change I can measure. That loop *is* the product.

## Would you call an LLM on every scan in production? No — and that's the point

At scale you'd distill this into a small model you own (cheap, fast, offline) and keep
the LLM only as a **fallback for low-confidence cards**. This demo is the step you take
*first*: it sets the accuracy ceiling, can auto-label and QA training data, and becomes
the teacher for the smaller model. AI observability is how you watch the LLM half of
that hybrid — and the eval harness here re-scores your own model unchanged (swap the
`predict()`, keep the report). Honest about the roadmap; real about the tooling.

---

_The 3D-printer agent that started this experiment is parked in `archive/` — same
PostHog AI-observability wiring, different surface._

— Tori Elstrom
