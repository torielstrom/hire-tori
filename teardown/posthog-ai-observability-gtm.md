# GTM teardown — PostHog AI observability

_A go-to-market take for the Developer Marketer (AI observability) role, written by Tori
Elstrom. The companion working demo lives in this repo; the traces it produced are in
PostHog right now._

---

## TL;DR

AI observability is a land-grab happening **inside** an analytics platform PostHog already
owns the developer relationship for. The winning move isn't to out-feature LangSmith on
trace UIs — it's to make the case that **the AI is just another part of your product, and
it belongs in the same tool as the rest of it.** PostHog is the only serious player that
can say that truthfully. Everything below is built around that wedge.

I pressure-tested this by shipping a real feature into my own Pokémon pipeline, instrumenting
it in PostHog AI observability, and using evals to find and diagnose its failure mode. The
narrative at the end ("the loop is the product") is the kind of show-don't-tell content I'd
ship in week one.

---

## 1. The market, in one paragraph

Every team building with LLMs hits the same wall: the app is non-deterministic, "bugs" look
like slightly-wrong prose, and cost balloons invisibly per token. They reach for tooling to
record and inspect every model call — traces, token/cost, latency, and increasingly **evals**
(is the output actually any good?). That category is "AI observability" / "LLM analytics."
It's early, the buyer is a developer, and no one has won it yet.

## 2. The competitive set (and PostHog's wedge)

_Current as of June 2026. The category is hot and consolidating fast — context that helps
PostHog's pitch, not hurts it._

| Player | Status / 2025–26 | Pricing | PostHog's honest counter |
|---|---|---|---|
| **LangSmith** (LangChain) | Raised **$125M Series B, Oct 2025, $1.25B valuation** — a unicorn. Framework-agnostic but pulls hardest for all-in-LangChain shops. | Developer $0 (1 seat, 5k traces); Plus **$39/seat/mo**; Enterprise custom. | Point solution in a silo. PostHog ties the trace to the real user session, the funnel it moved, and an A/B test behind a flag — without leaving the tool. |
| **Langfuse** | OSS darling; open-sourced everything (MIT) in 2025; **acquired by ClickHouse, Jan 2026**; OpenTelemetry-native. | Hobby free (50k units); Core **$29/mo**; Pro **$199/mo**; self-host free. | PostHog is *also* OSS + developer-first, but arrives with analytics, replay, flags, and experiments already attached — and now Langfuse's roadmap serves ClickHouse's agenda, not just developers'. |
| **Helicone** | Proxy/gateway model (YC W23). **Acquired by Mintlify, Mar 2026 — cloud product now in maintenance mode, no new features.** | Hobby free; Pro $79/mo; Team $799/mo (may change under Mintlify). | **Vendor-risk wedge:** a tool in maintenance mode is a dead end. PostHog is independent and building AI observability as a first-class, ongoing product. |
| **Arize / Phoenix** | **$70M Series C, Feb 2025.** Phoenix OSS is the eval-rigor core; Arize AX is the enterprise SaaS. | Phoenix free; AX Pro $50/mo; Enterprise ~$60k/yr (cited). | Built for **ML engineers**, not product engineers shipping features. It tells you how the model behaves, nothing about whether users adopt/convert/retain. |
| **Braintrust** | **$80M Series B, Feb 2026, ~$800M valuation** (ICONIQ, a16z, Greylock). Eval-to-production loop. | Starter $0; Pro **$249/mo**; Enterprise custom. | Standalone AI-only tool, billed separately on data/score volume, disconnected from product impact. PostHog folds eval regressions into the same place you watch users. |
| **Datadog LLM / Agent Observability** | The enterprise "bolt AI onto APM" play (the JD's "billion-dollar competitor"); pushing hard into agent observability. | Usage-based: ~**$8 per 10K LLM spans** (annual; ≈$480/mo at 500K spans) + a free tier. | Datadog correlates AI with *infra*; PostHog correlates it with the *user and the product*. Datadog sells to ops; PostHog sells to the person who built the feature — at a fraction of the price. |

**Two market facts to weaponize:**
1. **Consolidation is underway** (Langfuse→ClickHouse, Helicone→Mintlify). Point tools are
   getting absorbed into bigger agendas. "Pick the platform that's building this as a core
   product, not a feature it acquired" is a real, current message.
2. **Pricing edge is real.** PostHog gives **100k LLM events/month free, then $0.00006/event**
   and is ~10x cheaper than dedicated tools — versus Braintrust's **$249/mo** Pro tier and
   Datadog's usage-based LLM pricing (~$8 per 10K spans, ≈$480/mo at 500K). For startups
   (PostHog's base), that's decisive.

**The one-sentence wedge:** _Every competitor can only see the AI. PostHog sees the AI in the
context of the actual product and the actual user_ — because the same project already has
product analytics, session replay, feature flags, and experiments. You can go from "this
generation was slow/expensive/wrong" to "…and here's the user it happened to, what they did
next, and whether they churned." Nobody else can close that loop.

> Sourced via a 7-agent competitive sweep (June 2026); citations in `teardown/competitor-research.json`.
> Funding/pricing move fast — re-verify before external use.

## 3. Positioning & messaging

- **Category line:** "AI observability that lives where your product already does."
- **For the skeptic (already on LangSmith/Langfuse):** "Keep your traces. But your AI feature
  doesn't live in a vacuum — it lives in a product you're already measuring. Stop stitching
  two tools together."
- **For the greenfield team:** "You're going to need analytics, flags, experiments, and AI
  observability anyway. Start with the one tool that has all four, and instrument once."
- **Anti-pattern to avoid:** competing on trace-viewer aesthetics. That's a feature race
  PostHog doesn't need to win. Compete on *integration of context*, not on the trace UI.

## 4. The launch plan (zero-to-done)

A single launch beat, shippable end-to-end, not a multi-quarter plan:

1. **Hero artifact — a build, not a blog.** An end-to-end "instrument a real AI feature in 15
   minutes" repo + post (this demo is the template). Engineers trust working code over claims.
2. **The wedge demo:** a 90-second clip going from an `$ai_generation` trace → the *same person's*
   session replay and product events. That single motion is the entire pitch; lead with it.
3. **Eval story content:** "We found our AI's failure mode with evals" — a genuinely useful,
   reproducible teardown (mine on finish detection is one; PostHog's own products are others).
4. **Co-marketing:** partner with an AI-dev-tool whose users overlap (an agent framework, a
   vector DB, an eval library) for a joint "instrument X with PostHog" guide. PostHog already
   does co-marketing with dev tools; AI observability is a fresh surface for it.
5. **Beta → adoption:** ship weekly, announce each generation/eval/cost improvement as its own
   small launch (the JD's "multiple launches per quarter"), and instrument the docs+onboarding
   so we can see exactly where developers drop off activating AI observability.

## 5. The GEO / AI-search angle (my specialty)

Developers increasingly discover tools by **asking an LLM**, not Googling. "What should I use
to monitor my LLM app?" is now answered by ChatGPT/Claude/Perplexity — and those answers are
shaped by what's *legible to models*: clear docs, comparison pages, structured "X vs Y" content,
and presence in the training/retrieval corpus. I'd own a deliberate **GEO program** for AI
observability:
- Comparison/alternative pages (`PostHog vs LangSmith`, `Langfuse alternative`) written to be
  cited by models, not just ranked by Google.
- Canonical, code-first docs that an LLM can quote verbatim when a developer asks "how do I
  trace Anthropic calls in PostHog?" (the answer should *be* PostHog's snippet).
- Track it: measure share-of-voice in LLM answers, not just search rank. This is exactly what
  I built at Depot (AI search visibility across ChatGPT/Claude/Perplexity/Kagi).

## 6. Proof: I used the product to find a real bug (the case study)

I built **finish detection** for my Pokémon card pipeline (normal / holo / reverse — which
sets the price) using Claude vision, wrapped in PostHog AI observability, and evaluated it
against real labeled scans. The loop:

| Run | Change | Accuracy | What the data showed |
|---|---|---|---|
| v1 | naive prompt | 42% | Confusion matrix: model shoved everything into `reverse`. Its own reasoning (visible in the traces) showed it equated *scanner glare* with foil. |
| v2 | "glare ≠ foil" prompt | 47% | `normal` recall doubled (20%→40%). The fix landed exactly where the bias was. |
| v3 | full resolution | 53% | `holo` *still* 0% — even at full res. Not a prompt or model problem. |

**The finding:** holo is undetectable from flat scans regardless of prompt or resolution —
foil's holographic pattern only reveals itself under angled light. **Evals didn't just tune a
prompt; they told me the limiting factor is data capture.** That's the entire value
proposition of AI observability in one true story — and it's the kind of content (honest,
reproducible, developer-credible) I'd publish to sell it.

> Traces: PostHog → AI observability → Traces, filter `feature = finish-classifier`.

## 7. How I'd measure the launch

- **Activation:** % of new AI-observability projects that send a 2nd-day trace (the real
  retention signal), instrumented in PostHog itself.
- **The wedge in action:** how many users who adopt AI observability *also* view a linked
  session replay / product insight — proof the integration story is landing.
- **GEO share-of-voice:** citation rate in LLM answers to "best LLM observability tool"
  prompts, tracked over time.
- **Cost-to-value:** time-from-signup-to-first-trace; if it's not minutes, the onboarding is
  the bug.

---

_Honest caveat: competitor capabilities move fast — verify the feature/pricing specifics
before anything ships externally. The positioning (context-integration wedge + GEO) is the
durable part._
