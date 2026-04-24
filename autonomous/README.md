# Autonomous Folder

This folder is the local autonomous operating system for this repo.

## Read Order For Autonomous Sessions
1. `AUTONOMOUS_CONTEXT.md`
2. `PARITY_SCORECARD.md`
3. `NIGHTLY_FOCUS.md` if it exists
4. Then inspect the repo itself

## Purpose Of Each File
- `AUTONOMOUS_CONTEXT.md` — mission, incumbent, user stories, major parity features, and the autonomous product-parity loop
- `PARITY_SCORECARD.md` — lightweight status board for major capabilities (`Missing`, `Partial`, `Robust`, `Unknown`)
- `NIGHTLY_FOCUS.md` — optional temporary steering for tonight's work only
- `RUN_LOG.md` — optional place to append short overnight progress notes

## Canonical Build Lineage
This repo belongs to the Openfront family of products that evolved from the same base skeleton:

- Origin skeleton: `/Users/junaid/code/next-keystone-starter`
- Canonical baseline: `/Users/junaid/code/openfront`
- First strong vertical specialization reference: `/Users/junaid/code/openfront-restaurant`

If you are ever confused about architecture, feature slicing, route placement, or how to model a workflow:

1. compare against `openfront`
2. compare against `openfront-restaurant`
3. compare against the most relevant sibling `openfront-*` repo

## Architectural Rules
- Keep `app/` thin and use it mostly as route wiring.
- Put real business logic in `features/platform/*`, `features/storefront/*`, and `features/keystone/*`.
- Prefer explicit vertical slices over generic dashboard sprawl.
- Use user stories and parity gaps to decide what to build next.

## Integration Rules
- Reuse proven Openfront family patterns when possible.
- For payments and similar cross-cutting concerns, use the canonical Openfront / Openfront Restaurant patterns as references instead of inventing isolated one-off flows.

## Hard Rules For Night Sessions
- Do not run migrations.
- Do not commit.
- If lost or compacted, reread `AUTONOMOUS_CONTEXT.md` and `PARITY_SCORECARD.md` and continue.

## Night Session Operating Rules
- The goal is to build, inspect, refactor, and improve the product codebase overnight.
- The code itself is the ultimate source of truth; use the autonomous markdown files as steering, but verify against the actual code before making assumptions.
- There is no dev server in this autonomous mode. Do not start one and do not depend on one.
- Do not run migrations.
- Do not commit.
- Do not spend time trying to keep a local runtime green if schema or model changes would naturally require migrations later.
- Focus on implementation progress, parity gaps, robustness, and architecture quality.
