# CEDIMS Antislop Audit & Hardening Prompt

A ready-to-paste prompt for a Claude Code session on this repository. It drives all six installed `antislop` skills (`.claude/skills/antislop*`) together, in the order that matches how CEDIMS is actually built, so the system gets audited and improved as one pass instead of six disconnected ones.

Copy everything in the fenced block below into a Claude Code session opened on this repository.

---

```
You have antislop installed in this repo (.claude/skills/antislop, antislop-ui,
antislop-copywriting, antislop-human, antislop-layoutmobile, antislop-code) and
a DESIGN.md at the repo root that already states this system's real identity,
palette, typography, and ENERGY/RHYTHM/MOTION dials. Read DESIGN.md and
.claude/skills/antislop/SKILL.md (the core) before anything else.

Context you must hold through this whole session: CEDIMS (Smart E-VISION) is a
live DepEd government compliance and document-monitoring system for Calapan
East District, used by teachers, master teachers, school heads, and a district
supervisor, some on low-end Android devices with unreliable connectivity. It
is not a marketing site and not a fresh build: treat every finding as a change
to a shipped system, not a rewrite.

Use Mode 2 (After): audit first, do not change anything yet. Produce a
numbered findings list in `anti-slop/audit-001-YYYY-MM-DD.md` (today's date),
one entry per finding, each citing the antislop rule (R-XX) or skill checklist
item it violates and a one-line reason. Priority follows the core's tier
mapping: Hard Gate = HIGH, Purpose-Gate = MEDIUM, Quality Locks = LOW. Stop
after the findings list and wait for me to approve which numbers to fix;
untouched numbers stay untouched.

Run the skills over these areas, in this order, and say which skill produced
each finding:

1. antislop-human, over every route under src/routes/dashboard/* and
   src/routes/auth/*, plus src/lib/components: verify contrast (use
   contrast-check.py, don't eyeball it) on every text/background and
   status-badge pairing in both the light and dark theme tokens in
   src/app.css, confirm keyboard reachability and visible focus on every
   interactive dashboard control (tables, filters, upload dropzone, calendar,
   modals), and confirm empty/loading/error states exist and are perceivable
   (not color-only) for every data view — analytics, monitoring, archive,
   load, calendar.

2. antislop-ui, over the same dashboard routes plus the landing page
   (src/routes/+page.svelte if present) and src/lib/components/charts: this
   is compliance data, so R-17/R-38 matter most here — flag any stat card,
   chart, delta, or activity feed that could be showing an invented or
   placeholder number as if it were real compliance data (a fabricated
   "94% compliant" is worse here than on a landing page, because someone
   might act on it). Also check the "Default Dashboard Shell" and "Stat
   Cards With Invented Numbers" patterns specifically against
   dashboard/analytics and dashboard/monitoring. Confirm every nav item
   and button across dashboard/admin, dashboard/settings, dashboard/upload
   has a real destination or behavior (R-24, R-26) given how many route
   folders exist under src/routes.

3. antislop-layoutmobile, over the same dashboard routes and the upload
   flow specifically (src/routes/dashboard/upload, the QR verify page at
   src/routes/verify/[hash]): this app ships a PWA with file_handlers and a
   share_target aimed at /dashboard/upload, so phones are a real, intended
   entry point, not an edge case. Check tables and charts collapse instead
   of overflowing at phone widths, tap targets on dashboard actions and the
   calendar meet 44px, and the mobile keyboard never covers the upload or
   login form fields.

4. antislop-copywriting, over user-facing strings in src/routes and
   src/lib/components (labels, empty-state text, error messages, button
   text, notification copy), and separately over docs/UserHandbook.md,
   docs/UserManual_Concise.md, and any chatbot response templates under
   chatbot/: flag buzzwords, generic CTAs, fabricated claims, and any
   auto-generated tone that doesn't match a government instructional
   document. Do not flag or rewrite quoted DepEd forms, official
   terminology (DLL, ISP, ISR), or the district's own institutional voice.

5. antislop-code, over src/lib (actions, utils, stores, models, config)
   and chatbot/train_intent_classifier.py: strip decorative/AI-slop
   comments, keep everything explaining OCR extraction quirks, offline
   sync/conflict handling, RLS or Supabase policy assumptions, and QR
   verification logic. Never touch code, only comments.

Two things to fold into the findings regardless of which skill catches
them first, because they matter most for a compliance system specifically:
- Every empty/zero/no-data state in analytics, monitoring, and archive must
  be visually and textually distinct from "100% compliant" or "nothing
  outstanding" — an ambiguous empty state in this system risks being read
  as a real compliance signal.
- Anything in the admin or settings dashboards that looks interactive but
  isn't wired up yet needs a visible "Coming soon" label and a code TODO,
  not a silent dead control (R-26), since these are the screens district
  staff rely on operationally.

When the findings list is ready, stop. After I approve specific numbers,
fix only those, then run the Delivery Gate from the antislop core and the
relevant skill checklists (antislop-human, antislop-ui, antislop-layoutmobile,
antislop-copywriting, antislop-code) on the changed files only, and report
PASS/FAIL per item with evidence, per R-35 (what you actually ran or
clicked through, not an assumption).
```

---

## Why this ordering

`antislop-human` runs first because accessibility failures (contrast, keyboard traps, silent empty states) are the ones a compliance system's own users are most likely to hit and least likely to report. `antislop-ui` runs second because it's the layer most exposed to R-17/R-38 (fabricated numbers) risk specific to a monitoring dashboard. `antislop-layoutmobile` follows because the PWA manifest (`share_target`, `file_handlers` both pointed at `/dashboard/upload`) shows phone use is a designed path here, not an afterthought. `antislop-copywriting` and `antislop-code` run last because they're the lowest-risk, easiest-to-approve-piecemeal changes, and they benefit from already knowing which screens the earlier passes flagged as load-bearing.

## Re-running this later

This prompt is safe to re-run after future feature work: change "audit-001" to the next number, and mention in the prompt which routes or components are new since the last audit so the pass stays scoped instead of re-auditing the whole app every time.
