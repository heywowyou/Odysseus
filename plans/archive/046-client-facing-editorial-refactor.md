# Plan 046: client-facing editorial refactor

## Context

Odysseus has strong technical and compliance guardrails, but its client-facing French has accumulated three competing voices: consultant prose, audit-engine prose, and legal-defense prose. The preview v2 is the highest-leverage sales surface, while the paid report's opening pages still expose implementation language that belongs in methodology or the technical annex. The public website already has the clearest commercial positioning: Odysseus is a **diagnostic technique**, not an audit RGAA.

This plan aligns the preview, paid report executive pages, proof cards, and public website around one French vocabulary and then makes that voice enforceable through editorial QA. English is adapted only after the French contract is stable.

Plan 045 is an independent dashboard workstream. This plan starts from the post-045 tree and must preserve its report exports and dashboard behavior.

## Binding editorial vocabulary

French client-facing surfaces use these terms consistently:

| Concept | Canonical French | Notes |
|---|---|---|
| Paid service | **diagnostic technique de site web** / **diagnostic technique complet** | Keeps the binding distinction from an audit RGAA. |
| Paid PDF | **rapport de diagnostic** | May mention "audit RGAA" only when explaining what Odysseus is not. |
| Pre-purchase document | **aperçu du diagnostic** | Never "mini-audit" or "audit gratuit". |
| Automated work behind the preview | **analyse préalable** | Distinct from the fresh analysis used for a purchased diagnostic. |
| Distinct detected issue | **constat** | Do not alternate with problème/anomalie/erreur as a counting noun. |
| Severity concept | **gravité** | Not sévérité on prospect/executive surfaces. |
| Severity levels | **Critique · Sérieux · Modéré · Mineur** | One vocabulary across preview and report. |
| Prioritized body of work | **chantier** | A chantier can group several constats. |
| Remediation action | **correction** | Prefer to remédiation in executive/prospect prose. |
| Implementation difficulty | **complexité** | Not effort on executive/prospect surfaces. |
| Implementer | **prestataire technique** | "Service informatique" may remain when the client actually has one. |
| Search visibility | **référencement naturel (SEO)** at first mention, then **référencement naturel** | Avoid bare SEO in executive/prospect headings. |
| AI-assistant visibility | **visibilité dans les assistants IA** | GEO stays technical/glossary vocabulary, not executive/prospect copy. |

The public website remains a standalone package and does not gain a runtime dependency on `@odysseus/core`. This vocabulary is therefore a repository editorial contract, enforced by source/render checks rather than shared imports across the site boundary.

## Voice contract

Client-facing French should read like a consultant explaining measured evidence to a non-technical decision-maker:

- Lead with what the reader can decide or do, then provide evidence.
- Use complete sentences with explicit subjects and verbs in prose blocks.
- Prefer visitor/business consequences that are directly supported by the finding over implementation terminology.
- Keep technical names, tool names, selectors, rule identifiers, crawler mechanics, and scanner vocabulary in methodology/technical surfaces unless needed to state a bounded fact.
- Keep legal qualifications, but write them as normal French rather than visible self-defense.
- Never add unsupported revenue, conversion, legal-scope, deadline, sanction, or compliance conclusions.

## Workstreams

### A. Lock vocabulary and voice

1. Add this contract to the repository and use it as the source for copy decisions.
2. Update the canonical report-preparation fallback question in `core`; the report package must reuse that resolver rather than maintain a second copy.
3. Keep all truth/safety/legal restrictions unchanged.

### B. Rewrite preview v2 French

Rewrite every French string in `packages/report/src/outreach-preview/strings-v2.ts` so the document:

- opens with measured value rather than what the preview withholds;
- describes coverage without talking about counters or scanners;
- uses the canonical gravity vocabulary;
- uses plain-language category names;
- presents the paid product as a diagnostic technique and makes the CTA transactional;
- explains data use without "notre robot" or similarly defensive wording;
- keeps all Article 14 / opt-out substance intact.

Rewrite the deterministic French legal facts block without weakening its prohibition on legal conclusions.

### C. Rewrite paid report executive/front French

Apply a dedicated front-facing French layer to:

- cover;
- opening/context;
- executive summary;
- statistics headings/introduction where they belong to the executive flow;
- priority introductions/labels;
- final synthesis/contact.

Do not rewrite methodology, legal detail, technical evidence, findings appendix, or glossary except where a shared canonical term must be corrected.

### D. Rewrite proof-card French around visitor consequences

Keep the existing reviewed rule-id allowlist and fail-closed behavior. Add a client-facing French resolver that replaces implementation-heavy observations with one-sentence visitor-centered observations while preserving:

- present tense;
- one sentence;
- no fix;
- no legal conclusion;
- no unsupported impact claim;
- no statistic;
- no technical rule identifier.

Existing interface callers should receive the resolved copy without needing Plan 045 route changes.

### E. Align the public website

Without changing its standalone architecture, align French client-facing terminology in the home/offer/meta/chrome surfaces:

- diagnostic technique;
- rapport de diagnostic;
- référencement naturel;
- visibilité dans les assistants IA;
- correction / complexité / constat where applicable.

Preserve the binding statement that Odysseus is not an audit RGAA and does not produce an official conformity rate.

### F. Editorial QA

Add deterministic checks alongside the existing technical guards:

1. Preview runtime lint rejects internal-tool vocabulary and known defensive formulations on the prospect-facing document.
2. Report/source tests inspect only prospect/executive fields, not technical annex prose, for:
   - sentence fragments / known fragment shapes;
   - internal-tool vocabulary such as scanner, robot and outils déterministes;
   - inconsistent severity terminology;
   - excessive defensive formulations;
   - canonical vocabulary drift.
3. Website/source checks enforce the canonical French terms without adding a dependency on core.

The QA must be narrow and deterministic. Do not build a subjective style classifier or globally ban technical words from technical sections.

### G. English only after French locks

Once French copy and QA pass, write idiomatic English from the approved French intent. Do not mechanically translate sentence structure. Preserve all existing legal, factual, and disclosure constraints.

## Out of scope

- Redesigning preview/report layout.
- Rewriting the technical annex or methodology for style alone.
- Changing finding detection, severity assignment, normalization, report facts, or legal-scope logic.
- Any file Plan 045 forbids touching (`findings.ts`, `severity.ts`, `llm-output.ts`, `manifest.ts`, `packages/core/src/normalize/`).
- Changing outreach email sequence copy already locked separately, unless vocabulary QA later identifies a concrete conflict requiring operator review.

## Acceptance criteria

French is locked when:

1. Preview v2 contains no legacy severity labels (`Grave`, `Modérée`, `Mineure`) and no prospect-facing scanner/robot/tool-defense prose.
2. Preview CTA unambiguously orders the paid diagnostic.
3. The paid report's first/executive/final pages read as complete, natural French and contain no `outils déterministes`, `rien n'est inventé/deviné`, or similar trust-defense language.
4. Proof cards use client-facing resolved French while the raw allowlist, legal restrictions, and fail-closed coverage remain intact.
5. Website, preview, and report use the vocabulary contract above on French client-facing surfaces.
6. One canonical generic report question exists in core and both preparation/report rendering consume it.
7. Editorial QA fails on intentionally reintroduced fragment, internal-tool term, legacy severity label, and defensive phrase fixtures.
8. Existing legal/content guards still pass unchanged.
9. English remains unchanged until the French acceptance tests are green; then English receives a separate idiomatic pass.

## Status

**DONE (2026-09-13).** The French client-facing refactor, idiomatic English adaptation, visitor-centered proof cards, public-site alignment, shared generic question, and deterministic editorial QA are complete. The full repository suite passes (443 files, 4,587 tests), including browser and PDF checks. The implementation was merged to `main` as `38c64ea`; the operator accepted closure and requested archival.
