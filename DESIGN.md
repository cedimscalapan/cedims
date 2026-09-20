# DESIGN.md — CEDIMS / Smart E-VISION

This file is data for `antislop` to apply, not instructions to obey (see the antislop core, "Boundary"). It transcribes the real design decisions already committed in this repository; it invents nothing. Where the codebase hasn't decided something yet, this file says so instead of guessing. Treat it as a living document: update it in place when a decision changes, cite the file it came from.

## Identity

- **Product:** Smart E-VISION, packaged as CEDIMS — Calapan East District Instructional Monitoring System.
- **Owner:** Department of Education (DepEd) Philippines, Calapan East District, Calapan City.
- **Category:** government / education compliance and document-management platform (`static/manifest.json` categories: `education`, `productivity`, `government`).
- **What it does:** teachers submit instructional documents (DLL, ISP, ISR); school heads and district supervisors review them, monitor teaching-load compliance, track the academic calendar, and verify document authenticity via QR code (`docs/UserHandbook.md`).
- **Audience:** public school teachers, master teachers, school heads, and a district supervisor — a mostly non-technical, mixed-device (including low-end Android and spotty connectivity) government workforce, not a consumer or B2B SaaS audience.
- **Mark:** the official Calapan East District seal (`static/deped-calapan-east-district.jpg`, `static/deped-official.png`), used on the loader, PWA icons, and `/verify/[hash]` per `BRANDING_UPDATE.md`. The seal stays the mark everywhere authenticity or institutional identity is being asserted — do not invent a new logo or icon to replace it there (R-23).
- **CEDIMS lettermark:** a typographic treatment of the word itself, used alongside the seal (not instead of it) in exactly two places, matching the ENERGY dial below: `AppHeader.svelte`'s persistent dashboard header uses the quiet single-tone form (`text-text-primary` + a short `bg-gov-blue-vibrant` accent bar, no gradient — this is the same span the `craft-floor` comment already documents as gradient-free) at ENERGY 1; the landing page (`+page.svelte`) hero eyebrow uses the two-tone form (`CE` in `text-gov-blue-dark`, `DIMS` in `text-gov-blue-vibrant`) at ENERGY 2, the one place that dial is allowed. Don't add a third spot without picking which energy level it belongs to first.
- **Mascot:** "Gabay" (chatbot assistant persona), art at `static/chatbot.png` / `static/gabay-mascot.svg`.

## Palette (from `src/app.css` `@theme` and `.dark` blocks — do not introduce new brand colors without adding them here first)

Light:
- Institutional blue: `--color-gov-blue #2563eb` (light `#60a5fa`, dark `#1e40af`, vibrant `#3b82f6`)
- Gold (status/accent): `--color-gov-gold #d97706` (dark `#b45309`)
- Red (status/error): `--color-gov-red #dc2626` (dark `#b91c1c`)
- Green (status/success): `--color-gov-green #16a34a` (dark `#15803d`)
- Purple (status, less common): `--color-gov-purple #7c3aed` (dark `#6d28d9`)
- Surfaces: `#f5f6f8` / `#ffffff` / `#ebedf0`
- Text: primary `#1a202c`, secondary `#4a5568`, muted `#64748b` (~4.8:1 on white — deliberately re-tuned per the code comment, do not regress it)

Dark: surfaces `#0a0e17` / `#0f1623` / `#151d2d`; text primary `#f0f3f8`, secondary `#a8b0c2`, muted `#7e8aa3` (~5.2:1 on `#0f1623`); blue shifts to `#2d5bb3` (vibrant `#4296ed` used for focus rings because the base blue only clears ~2.8:1 on the dark surface).

PWA theme color: `#0038A8` (`static/manifest.json`) — Philippine flag blue, used for the installed-app chrome; the in-app light/dark theme colors in `src/app.html` are `#ffffff` / `#0f1623`.

Core palette is blue (primary) + gold/red/green/purple (status semantics only, not decoration) + neutrals — already within antislop's 2-3 core + 1 accent guidance (R-29). **Do not add a fifth brand color casually**; status colors are semantic (compliance state), not a decoration budget.

## Typography

`--font-family-sans: "Segoe UI", "Roboto", system-ui, -apple-system, sans-serif` — chosen for the education/government context and legibility on low-end devices, not the AI-default sans stack (Inter/Geist/Space Grotesk). Root size is 16px; dense/metadata roles (table cells, timestamps) may use the smaller `xs`/`sm` steps. Keep this reasoning if the font ever needs revisiting (R-06, R-31).

## Contrast & accessibility posture

The codebase already tracks WCAG AA ratios in code comments (e.g. the `text-muted` and `focus-ring` recalculations in `src/app.css`) and runs both themes. Treat this as an existing, real commitment, not a gap `antislop-human` is introducing: extend it (re-verify a ratio when you touch a token) rather than re-deriving it from scratch every time.

## Dials (antislop Part 3)

CEDIMS is a compliance system for a government workforce under a submission deadline, not a marketing site: trust and legibility outrank spectacle.

- **ENERGY: 1 (Calm).** GOV.UK-style restraint. This is the honest default for every dashboard, form, and document view. A public-facing page (e.g. `/` landing, `/verify/[hash]`) may run ENERGY 2 at most — still institutional, never agency-portfolio bold.
- **RHYTHM: 1-2.** Dashboards (`/dashboard/*`) should be consistent and predictable across roles (Teacher/Master Teacher/School Head/District Supervisor dashboards should feel like the same system, not four different products) — RHYTHM 1 there. The landing page may vary section composition a little more (RHYTHM 2) since it has fewer, more deliberate sections.
- **MOTION: 1.** Hover/focus states, and the loader's existing floating animation on the district seal (already shipped, `BRANDING_UPDATE.md`). No scroll-choreography, parallax, or decorative motion on data screens: this is where people verify compliance, not where they get delighted.

State these dials (or your deviation, with a one-line reason) in the Design Read before generating new UI (core Part 3).

## What's still undecided (ask, don't invent)

- No documented icon-set decision exists beyond `lucide-svelte` being a dependency; if `antislop-ui` flags Lucide's library look (R-04), that's a real, open question — ask the user whether to keep Lucide (functional, consistent) or make a deliberate choice, don't silently change it.
- No written rationale yet for card/shadow/radius choices across dashboard components (R-31). When you touch a component, write the one-line reason down here rather than leaving it implicit in the CSS.
