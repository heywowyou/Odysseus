---
version: 1
slug: "packages-interface-src-dashboard-app-tsx"
primary_target: "packages/interface/src/dashboard/App.tsx"
related_targets: []
---

# Surface brief: operator dashboard

Scope: packages/interface/src/dashboard (App shell, routes, components, i18n, theme.css). Primary target: packages/interface/src/dashboard/App.tsx.

Mode: Operate. The single operator completes tasks here: running audits, preparing reports, reviewing previews and drafts. Task completion outranks expression. Consistency over surprise; motion only as state feedback at 150 to 250ms with reduced-motion paths.

Audience: the solo operator, treated as a first-time, non-technical user with no auditing, SEO, or accessibility background. Every label must be understandable on sight, in the operator's own words, without pipeline vocabulary.

Job: run full audits and hotel quick checks, follow their progress, read results, prepare and approve bilingual report drafts, and manage the hotel outreach campaign (drafts, replies, do-not-contact checks, outcomes).

Constraints:
- Bilingual French and English from the centralized i18n files (i18n/en.ts, i18n/fr.ts), always changed together, strings-parity green.
- Single-user, private, password-gated. No multi-tenant patterns.
- Keyboard-first where practical; visible focus everywhere.
- No unexplained internal or pipeline vocabulary in any user-facing label; where a technical term must stay, attach its plain-language InfoTip.
- Accessibility floor: 4.5:1 body-text contrast, visible keyboard focus, complete states (hover, focus, disabled, loading, error, empty), reduced motion respected.
- No new dependency; motion via CSS transitions and the Web Animations API only.
- Dark-only theme is the incumbent, documented decision.

Unresolved decisions (operator, step 5):
- The rename inventory approval (about 128 unclear strings; see the step 5 decision package).
- Placement of the orphaned /vendors page.
