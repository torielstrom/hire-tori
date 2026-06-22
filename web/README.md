# The "hire me" microsite

A single static page (`index.html` + `styles.css` + `app.js`), instrumented with PostHog —
including a live panel that mirrors exactly what it's sending to your ChaseDex project.

## Preview locally

```bash
# from the repo root
python3 -m http.server -d web 8000   # then open http://localhost:8000
# or:  npx serve web
```

## Deploy (Cloudflare Pages — uses your existing wrangler login, no token)

```bash
npx wrangler pages deploy web --project-name=hire-tori
```

First run creates the `hire-tori` Pages project and gives you a `*.pages.dev` URL; add a
custom domain (e.g. `hire.chasedex.com` or a standalone domain) in the Cloudflare dashboard.
You can also drag the `web/` folder into the Cloudflare Pages dashboard if you prefer.

## Notes

- PostHog key is your **public** ChaseDex client key (same one already on chasedex.com) — safe
  to ship in the browser.
- Events captured: `$pageview` (auto), `section_viewed`, `cta_clicked`. View them in
  [PostHog → Activity](https://us.posthog.com/project/294937/activity/explore) or build a funnel
  (`section_viewed: hero` → `cta_clicked: email`) to see who actually reaches "hire me."
- The live panel is honest: it shows the real events, and the opt-out link calls
  `posthog.opt_out_capturing()`.
