# Evidence and reporting

## Evidence standard

Record enough evidence for a fresh fixer to reproduce the problem without private
data:

- run mode, commit, route, language, viewport, and starting state;
- the operator action and visible response;
- sanitized network status/body shape and timing;
- relevant server/worker log event;
- persisted or artifact state before and after;
- reload/fresh-session result;
- expected behavior and operator impact;
- source file and line that likely own the behavior, when identified.

Prefer text over screenshots because it stays searchable. Use a screenshot only
when layout, hierarchy, clipping, or visual state is the evidence. Redact or avoid
private client information.

Separate observation from diagnosis. A likely root cause is useful, but do not
weaken a reproducible operator failure because the exact code cause is uncertain.

## Severity

- **P1:** blocks or falsely reports success on a core job, loses/corrupts state,
  risks an unintended external action, or leaves no safe recovery.
- **P2:** substantial friction, hidden capability, inconsistent state, or a dead
  end with a workaround.
- **P3:** clarity, polish, accessibility, responsiveness, or consistency that does
  not materially block the job.

Repeated low-level symptoms caused by one root defect become one finding. Distinct
operator failures with independent fixes remain separate.

## Ledger

The canonical ledger is `docs/product/dashboard-ux-audit.md`. Preserve its history
and identifiers. Add one run-history row and a concise dated run section containing:

- mode and exact data-safety boundary;
- pages and journeys covered in each language;
- proof-chain outcomes for every core journey;
- new, still-open, fixed, and regressed findings;
- coverage gaps, retained test records/artifacts, and test drafts;
- whether parity was reached.

For each finding use the existing register shape:

```markdown
### UX-nnn (P1) Short title
- Status: OPEN. First seen: run N. Last seen: run N.
- Where: route, page state, language.
- Evidence: observable behavior, proof-chain break, and file:line at this HEAD.
- Suggested UX fix: desired operator outcome, not an implementation prescription.
- Issue: #nnn (or "none").
```

Classify ledger entries as NEW, STILL OPEN, FIXED, or REGRESSION. Verify fixes by
repeating the original journey, including persistence/reload. Moving or hiding the
symptom does not count. Reopen a regressed finding under its original UX id.

## GitHub handoff

Read `docs/agents/issue-tracker.md`. Search open and closed issues by UX id and root
cause before writing. File one issue per new verified defect with `needs-triage`
and severity in the title. Link the UX id in the issue and the issue in the ledger.
Include sanitized reproduction, impact, proof-chain evidence, likely owner paths,
and the desired UX outcome.

Close an issue only after the original operator journey proves the fix. If GitHub
access fails, mark `Issue: none` plus the failure in the run section and continue.

## Verification and handoff

Run `pnpm run docs:check` after editing the ledger. Commit only the ledger and any
audit-owned evidence explicitly intended for the repository. Do not commit local
runtime data, screenshots containing client information, credentials, logs, or
the session file. Do not push.

The final chat report leads with:

1. whether core work was actually completable;
2. new/regressed P1s and their broken proof-chain link;
3. the three highest-leverage fixes;
4. coverage gaps and any retained records, artifacts, or drafts;
5. trend against the prior run and parity, when earned.
