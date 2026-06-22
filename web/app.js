// Instrumentation + the live "what PostHog just captured" mirror.
// Every event shown in the panel is the same event sent to PostHog — no theater.

(function () {
  const list = document.getElementById("ph-events");
  const panel = document.getElementById("ph-panel");

  function show(event, props) {
    if (!list) return;
    const li = document.createElement("li");
    const detail = props && Object.keys(props).length
      ? " " + JSON.stringify(props)
      : "";
    li.innerHTML = "<b>" + event + "</b>" + detail.replace(/[<>]/g, "");
    list.prepend(li);
    while (list.children.length > 8) list.removeChild(list.lastChild);
  }

  function track(event, props) {
    try { window.posthog && window.posthog.capture(event, props); } catch (e) {}
    show(event, props || {});
  }

  // The pageview PostHog autocaptures — surface it so the panel isn't empty.
  show("$pageview", { path: location.pathname });

  // Each section that scrolls into view fires once.
  const seen = new Set();
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        const name = e.target.getAttribute("data-section");
        if (e.isIntersecting && name && !seen.has(name)) {
          seen.add(name);
          track("section_viewed", { section: name });
        }
      });
    }, { threshold: 0.5 });
    document.querySelectorAll("[data-section]").forEach((el) => io.observe(el));
  }

  // CTA clicks.
  document.querySelectorAll("[data-cta]").forEach((el) => {
    el.addEventListener("click", () => track("cta_clicked", { cta: el.getAttribute("data-cta") }));
  });

  // Honest opt-out.
  const optout = document.getElementById("ph-optout");
  if (optout) {
    optout.addEventListener("click", (e) => {
      e.preventDefault();
      try { window.posthog && window.posthog.opt_out_capturing(); } catch (e2) {}
      if (panel) panel.classList.add("hidden");
    });
  }
})();
