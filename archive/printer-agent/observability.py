"""PostHog wiring.

Two things happen here:
1. We build PostHog's *wrapped* Anthropic client. Every `messages.create` call it
   makes is auto-captured as an `$ai_generation` event in PostHog AI observability,
   grouped under whatever `posthog_trace_id` we pass. One natural-language command =
   one trace, with each tool-use round-trip as a generation inside it.
2. We expose `capture()` so the agent can also fire normal product-analytics events
   (print_started, print_paused, ...) — the same PostHog, the other product. The
   whole point of the demo: market AI observability *by living inside it.*
"""

from __future__ import annotations

import os

from posthog import Posthog
from posthog.ai.anthropic import Anthropic


def get_posthog() -> Posthog:
    api_key = os.environ.get("POSTHOG_API_KEY")
    if not api_key:
        raise RuntimeError("POSTHOG_API_KEY not set (your PostHog project API key)")
    return Posthog(
        project_api_key=api_key,
        host=os.environ.get("POSTHOG_HOST", "https://us.i.posthog.com"),
        enable_exception_autocapture=True,
    )


def get_llm_client(posthog: Posthog) -> Anthropic:
    """PostHog-instrumented Anthropic client. Identical API to anthropic.Anthropic,
    plus posthog_trace_id / posthog_distinct_id / posthog_properties kwargs on create()."""
    return Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"], posthog_client=posthog)
