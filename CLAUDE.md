# Show Math — CLAUDE.md

## What This Is

Show Math is a web-based show deal calculator for touring musicians and their teams. It helps artists understand the financial mechanics of show deals, plan ad spend, and analyze tour economics. Built and maintained by Justin (Sounds Good Marketing).

- **Live URL:** showmath.soundsgoodmktg.com
- **Hosting:** Netlify (static site + serverless functions)
- **Domain:** Custom subdomain on soundsgoodmktg.com

## Architecture

Static HTML/CSS/JS frontend with no build step or framework. Netlify serverless functions proxy Claude API calls for AI-powered parsing features. Google Apps Script handles Gmail integration for ticket count parsing.

### Frontend
- Plain HTML/CSS/JS (ES modules)
- Fonts: Jost (headings, labels, UI) + Inter (body, data)
- Brand style: retro beveled aesthetic — black/silver/gold/red palette, 2px borders, outset buttons, minimal border-radius
- The rainbow stripe under the header uses the Sounds Good brand colors

### Backend (Netlify Functions)
- `parse.js` — Parses pasted deal text into structured fields (Claude Sonnet)
- `parse-tour.js` — Parses full deal sheets with multiple shows (Claude Sonnet, 26s timeout, 8000 max tokens)
- `parse-ticket-email.js` — Parses ticket count emails (Claude Haiku)
- `summary.js` — Generates plain-English artist summaries of deal analysis (Claude Sonnet)
- All functions read `ANTHROPIC_API_KEY` from Netlify environment variables

### Gmail Ticket Parser (Google Apps Script)
- Lives in a Google Sheet, not in this repo
- Source file: `gmail-ticket-parser/apps-script.js` (reference copy)
- Searches Gmail for ticket count emails, extracts data from email bodies, attachments (PDF/Excel via Drive API OCR), and download links
- Sends extracted text to the Netlify `parse-ticket-email` function for structured parsing
- Results stored in the Google Sheet across Raw Emails and Parsed Counts tabs

## File Map

```
show-deal-calculator/
├── index.html              — Main app HTML (single page, all three tabs)
├── css/
│   └── styles.css          — All styles, CSS variables for brand palette
├── js/
│   ├── app.js              — App initialization, event listeners, input handling
│   ├── calculator.js        — Core math: payout calculation, break-even, net gain/loss curves, recommendations
│   ├── dealTypes.js         — Deal type definitions (5 types), each with payout formula and backend calculation
│   ├── ui.js                — DOM rendering: results, tables, charts, tooltips
│   ├── storage.js           — localStorage for saved deals
│   └── tour.js              — Tour planner tab: deal sheet parsing, multi-show table
├── netlify/
│   └── functions/
│       ├── parse.js         — Single deal text parser
│       ├── parse-tour.js    — Multi-show deal sheet parser (26s timeout)
│       ├── parse-ticket-email.js — Ticket email parser
│       └── summary.js       — AI summary generator
├── gmail-ticket-parser/
│   └── apps-script.js      — Google Apps Script source (reference copy)
├── netlify.toml             — Netlify deploy config
└── .claude/
    └── launch.json          — Local dev server config for preview
```

## The Five Deal Types

Understanding these is essential — they drive all payout calculations:

1. **Flat Guarantee** — Fixed fee regardless of ticket sales. No backend. Extra tickets only help via merch.
2. **Door Deal** — Artist gets a percentage of ticket revenue from dollar one. No guarantee. Every ticket increases payout linearly.
3. **Guarantee vs % of Gross** — Artist gets the HIGHER of: guarantee OR percentage of gross revenue. Below the backend threshold, artist is on guarantee. Above it, percentage applies to ALL gross (windfall effect).
4. **Guarantee vs % of Net** — Same as vs Gross but expenses are deducted first. Higher backend threshold.
5. **Guarantee + % After Expenses** — Artist gets BOTH the guarantee AND a percentage of revenue above a split point (expenses + optional promoter profit). Standard deal at mid-to-large venues.

Key concept: **Backend** = the ticket count where the percentage-based payout exceeds the guarantee. Below backend, ad spend doesn't increase payout (only merch revenue). This creates the "valley" in the net gain/loss chart where spending on ads deepens the loss before the curve bends upward.

## Feature Status

### Working
- **Single show calculator** — All five deal types, bonus tiers, merch, agent fee, post-settlement adjustments
- **Progressive results** — Deal results appear as inputs are filled; ad analysis section appears when baseline + cost per ticket are set
- **Payout table** — Shows artist payout at every ticket increment from 0 to capacity
- **Key milestones** — Backend threshold and ticket goal with status indicators
- **Break-even analysis** — Ad spend to break even and ad spend to hit ticket goal (displayed above charts)
- **Net Gain/Loss chart** — Interactive canvas chart showing the curve of net gain/loss vs ad spend, with gradient color zones (red loss / green gain), inflection point ("worst loss"), break-even marker, current spend marker, and hover tooltip
- **Tickets vs Ad Spend chart** — Interactive canvas chart with gradient fill, baseline/goal lines, break-even and current spend markers, hover tooltip
- **Scenario comparison** — Side-by-side Without Ads vs With Ads breakdown
- **Recommendation engine** — Contextual advice based on deal structure and ad spend analysis
- **AI summary** — Plain-English artist-friendly summary generated via Claude
- **Parse deal text** — Paste deal details in natural language, AI extracts structured fields
- **Saved deals** — localStorage persistence with sidebar for loading/deleting
- **Settings modal** — API key configuration
- **Tour planner** — Paste multi-show deal sheet, AI parses all shows into a table

### In Progress / Needs Testing
- **Gmail ticket parser** — Attachment extraction (PDF/Excel via Drive API) and download link parsing code is written but needs testing. User needs to:
  1. Copy updated `apps-script.js` to Google Sheets editor
  2. Enable Drive API in the Apps Script project
  3. Run "Reset for Re-Parse" from the custom menu
  4. Run "Parse with Claude"
- **Tour planner** — Timeout fix (26s) is deployed but hasn't been retested with a full ~30 show deal sheet

### Planned
- **Ad Planner** — Third tab. Given show dates and budgets, generates Meta ads campaign plans with phase timing, audience targeting, daily spend, and ad set structure. Spec exists (see project notes). Budget tiers from $70 minimum to $200+, three ad sets (cold conversion, video views, warm conversion) with scaling rules.
- **Meta Ads API integration** — Future: push campaign plans directly into Meta as drafts (MCP tools available)

## Design Decisions

- **"Ads" not "promotion"** — All UI language uses "ads" (e.g., "Without Ads", "With Ads", "Tickets With Ads"). Changed from "promotion" for clarity.
- **"Ticket Goal" not "Venue Expectation"** — More flexible; could be venue capacity, artist's personal target, or any scenario.
- **Progressive rendering** — Results build as inputs are filled rather than gating behind steps or a "calculate" button. The ads section dims when baseline/cost-per-ticket aren't set.
- **No build step** — Plain HTML/JS/CSS keeps deployment simple and the tool accessible. No npm, no bundler.
- **Canvas charts with hover tooltips** — Custom-drawn charts match the brand aesthetic. Interactive crosshair + tooltip shows exact values on hover. Both charts use shared utility functions for consistent styling.
- **Netlify function timeouts** — Per-function config via `exports.config = { maxDuration: 26 }` in the function file itself. Do NOT use `[functions] timeout` in `netlify.toml` — it's invalid and breaks deploys.

## Common Gotchas

- **netlify.toml** — Only use valid Netlify config properties. `[functions] timeout` is not valid and will silently break deploys. Use per-function `exports.config` instead.
- **Canvas cloning** — Never clone canvas elements to reset event listeners; it wipes drawn content. Use AbortController to manage listeners instead.
- **Gmail parser batch size** — Currently set to 100. Higher values risk Apps Script execution time limits (6 min for consumer accounts).
- **Deal sheet parsing** — Large deal sheets (~30 shows) need the extended 26s timeout and 8000 max tokens. Default Netlify timeout is 10s.
- **Chart rendering** — Both charts share utility functions (drawGrid, drawMarkerDot, drawMarkerLabel, setupTooltip). The net gain/loss chart uses `calculateNetGainLossCurve()` from calculator.js. Charts use devicePixelRatio scaling for sharp rendering on retina displays.
