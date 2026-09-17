# Plan 066: Operator security, privacy and browser isolation

> **Executor instructions**: harden the operator application and artifact lifecycle around the trust boundaries created by Plans 058/059. Treat every scanned site as hostile, every report/evidence artifact as confidential, every browser renderer as untrusted code execution, and every destructive/approval command as race-sensitive. Do not add enterprise IAM or microservices without need; close the concrete risks in the current single-operator product.

## Status

- **Priority**: P1
- **Effort**: L/XL depending on production Chromium sandbox support.
- **Depends on**: Plan 060 and current auth/security-header/session/artifact infrastructure for the isolation/preflight work. Later stale-command/audit-trail hardening consumes Plan 061; final promotion consumes the 058/059 durable ownership contracts.
- **Coordinates with**: 058/059 implementation, 061 command safety, 062 candidate delivery, 065 diagnostics, deployment runbook.
- **Production gate**: Plan-059 acquisition and Plan-058 browser/PDF execution must not be production-promoted until their browser isolation requirement is satisfied.
- **Category**: security, privacy, untrusted content, artifact access, browser isolation, audit trail.
- **Final review state**: repository-wide design review plus repeated convergence passes; the final fresh pass produced no additional substantive architectural change. Freeze speculative design and let implementation/evaluation evidence drive later amendments.

---

# 1. Purpose

The current app has meaningful baseline protections:

- private operator dashboard with password/session guard in production;
- refusal to bind non-loopback without configured authentication;
- same-origin protections/security headers;
- React rendering rather than arbitrary HTML injection;
- private artifact-store patterns;
- explicit telemetry privacy limits;
- scanner public-network/robots identity work.

But the live deployment deliberately runs Chromium with `--no-sandbox` in the
same app container that receives production secrets. Trade-off 92 records this
as an accepted historical risk. Plan 059 now raises browser isolation to a
quality/security preflight, and Plan 058 also performs browser/PDF rendering of
confidential report content.

The accepted old risk must therefore be resolved before the new quality
pipelines are promoted, not grandfathered into them.

---

# 2. Threat model

Protect against:

- malicious scanned HTML/JS/CSS/media;
- prompt-injection strings copied from sites;
- SSRF/private-network/metadata access through scanner/navigation/subresources;
- browser renderer compromise reaching app credentials/filesystem;
- XSS/HTML injection in dashboard views;
- bidi/control-character spoofing in displayed evidence;
- malicious/oversized URLs and selectors;
- unauthorized candidate/evidence/report access;
- leaked signed/object URLs;
- stale-tab destructive/approval races;
- cross-site mutation requests;
- session leakage/fixation;
- sensitive data in logs/telemetry/errors;
- orphaned confidential objects after archive/delete;
- stale workers publishing after cancellation/deploy;
- mixed-version workers violating current state.

The product is currently single-operator. Insider/multi-role authorization is
out of scope until that changes.

---

# 3. Binding decisions

1. **Scanned website content is untrusted data everywhere.**
2. **No scanned markup is rendered as active dashboard markup.**
3. **Plan-059 network target policy is the scanner network authority.** The dashboard does not weaken it through “advanced options”.
4. **Browser isolation is a production gate.** `--no-sandbox` beside all production secrets is not an acceptable final state for 058/059.
5. **Prefer restoring a supported Chromium sandbox in the existing deployment if the host/container can prove it works.** Add a separate constrained browser worker only if the production platform cannot provide an approved sandbox/equivalent boundary.
6. **Do not create microservices by default.** Isolation is a security boundary, not an architectural fashion.
7. **If a separate browser worker is required, it receives only the minimum task data/credentials needed for browser work, never the app's database/mailbox/object-store master secrets.**
8. **Report/evidence candidates remain private and authenticated.** Object keys/unguessable URLs are not authorization.
9. **Operator approval/destructive commands are server-rechecked and stale-state protected by 061.**
10. **Single-operator password/session auth remains the authorization model.** Do not add roles/organizations.
11. **Telemetry/logging remains content-minimized.**
12. **Security failure is explicit and fail-closed for quality promotion.**
13. **Archive/delete must reconcile confidential object cleanup without deleting the records needed to retry a failed cleanup.**
14. **No LLM decides whether a URL/action is safe.**

---

# 4. Current security seams

Review and preserve:

- `packages/interface/src/server.ts` bind refusal and auth guard;
- `packages/interface/src/auth/*` session/login/rate-limit behavior;
- `packages/interface/src/security-headers.ts`;
- `packages/interface/src/http-utils.ts` same-origin/JSON mutation checks;
- `packages/interface/src/artifacts/*`;
- `packages/scanner/src/browser.ts` deployment browser arguments;
- `deploy/compose.yaml` secret/environment/container boundary;
- Plan-059 `NetworkTargetPolicy` and browser isolation preflight;
- Plan-058 private candidate/content-addressed object lifecycle;
- telemetry/LLM privacy rules.

Do not duplicate these mechanisms in a new “security service”.

---

# 5. Browser isolation decision tree

## 5.1 First choice: prove sandboxed Chromium in the current deployment

Build a production-equivalent preflight that verifies:

- Chromium starts without `--no-sandbox`;
- required namespace/seccomp/container features work;
- renderer sandbox is actually enabled;
- app functionality/scans/PDF render remain correct;
- process runs least privilege;
- no unnecessary Linux capabilities;
- bounded memory/CPU/pids;
- browser profile/temp storage is isolated and cleaned;
- page context receives no application secrets;
- 059 network egress enforcement covers browser requests;
- PDF/report browser execution has network disabled or tightly restricted when external access is unnecessary.

If this passes on the actual Hostinger runtime, remove `--no-sandbox` from
production and record the verified isolation fingerprint.

## 5.2 If platform sandbox cannot be proven: constrained browser execution boundary

Use one purpose-built browser worker boundary for scanner/render tasks rather
than arbitrary service decomposition.

Requirements:

- no database URI;
- no Gmail/mailbox credentials;
- no dashboard password/session secret;
- no general object-store write credentials;
- no unrelated provider API keys;
- read/write only task-scoped ephemeral input/output;
- authenticated local/internal task channel;
- strict request size/schema;
- bounded CPU/memory/pids/time;
- read-only root filesystem where practical;
- tmpfs/ephemeral browser profile;
- scanner browser egress restricted by Plan-059 public-target policy;
- report/PDF browser egress disabled by default;
- worker cannot directly promote evidence/report state;
- app verifies returned artifact digests before accepting them;
- worker crash is an ordinary retryable attempt, not authority loss.

A separate worker is an approved equivalent isolation boundary only after fault
and escape-oriented tests prove these properties.

## 5.3 Ownership dependency

The **decision/preflight** in sections 5.1-5.2 must happen early enough to gate
058/059 production promotion. If the result requires a separate browser worker,
do not switch production execution to that worker while correctness still
depends on process-local report locks: land the relevant 058/059 durable
leases/epochs and 061 command ownership first or in the same gated migration.

---

# 6. Scanner network boundary

Plan 059 owns the exact implementation. Application integration must ensure:

- start URL, redirects, DNS resolution and browser subresources all use the
  public-network policy;
- HTTP/HTTPS only;
- credentials in URL refused;
- loopback/private/link-local/metadata/reserved targets blocked;
- IPv4/IPv6 alternate forms handled;
- DNS rebinding/redirect destinations revalidated;
- advanced scan options cannot disable the boundary;
- robots/UA/politeness policy remains effective during retry;
- shared-vendor/host scheduling does not imply permission to broaden scope.

The dashboard displays a typed security/policy refusal and a safe correction
path; there is no “force crawl anyway” control for unsafe network targets.

---

# 7. Untrusted-content rendering

## 7.1 Dashboard

All website-derived strings render as inert text through React/default escaping.

For high-risk display values such as title, selector, URL, snippet and detected
identity:

- strip or visibly escape unsafe control characters that can spoof layout;
- handle bidi controls so visual order cannot impersonate a different URL/name;
- bound displayed length;
- preserve a safe copy/full-detail path where evidence needs the exact value;
- never place raw value into `dangerouslySetInnerHTML`;
- never create `srcDoc` with active site content;
- never interpret scanner text as Markdown/HTML without an approved sanitizer.

If a preview must render HTML, keep the current sandboxed isolated preview
pattern and a strict source/contract. Do not reuse it for arbitrary scanned HTML.

## 7.2 URL links

Before creating a clickable external link from scanned data:

- parse/normalize;
- permit only intended schemes;
- display the destination host;
- use safe `rel`/target behavior;
- never embed credentials;
- do not treat clickability as scanner authorization.

Internal artifact/download links use server-generated opaque routes, not raw
bucket keys.

---

# 8. Prompt-injection boundary

Preserve current LLM rules:

- deterministic scanners own findings;
- scanned content is delimited/untrusted;
- raw HTML is not sent wholesale;
- model output cannot alter evidence truth/capabilities/action safety.

For any new operator-assistance feature, require a separate plan before scanned
content can instruct a model with application privileges.

Plan 058 critics/reviewers may consume only the bounded artifacts defined by
that plan. They cannot call application mutations because a report says to.

---

# 9. Confidential report/evidence artifacts

## 9.1 Access

Candidate/evidence/report routes:

- require the operator session;
- use server-side authorization/resolution;
- use `Cache-Control: no-store` for confidential candidate/diagnostic
  responses where browser/proxy caching is unnecessary;
- never expose permanent public object URLs;
- validate object digest against expected record before serving when the owning
  plan requires exact-byte integrity.

Client delivery after promotion follows Plan 058's active-bundle route and
immutable objects; it still must use the intended authenticated/client delivery
boundary, not a candidate URL.

## 9.2 Object store

- bucket remains private;
- least-privilege credentials per process/boundary;
- content-addressed objects never become public by predictable key;
- metadata/logs do not print signed credentials;
- read-back digest verification for 058/059 roots;
- archive/delete enumerates and removes the full subject-owned object set
  according to current canonical purge semantics;
- cleanup failure preserves the durable references required to retry.

## 9.3 Retention/backups

Update backup/restore procedures for new content-addressed evidence/report
objects:

- database references and object bytes are restored as a coherent set;
- restore drill verifies digest/read-back;
- retention does not silently delete an active report/evidence root;
- archive/purge semantics are not undone by backup restore without an explicit
  recovery operation.

Do not create indefinite copies solely for debugging.

---

# 10. Session and request security

Keep current single-user model, then verify/harden:

- session cookie `HttpOnly`, `Secure` in HTTPS production and appropriate
  `SameSite`;
- session rotation on login;
- logout invalidation;
- bounded expiry;
- login rate limiting;
- no session/token in URL;
- same-origin mutation enforcement;
- accepted content types bounded;
- body/request size limits appropriate to operator commands;
- return-to login paths are same-origin/local only;
- CSP/frame/referrer/content-type headers remain on success and error.

If current code already satisfies an item, prove it with tests rather than
rewriting it.

No CSRF token framework is required if same-origin + SameSite + content-type
checks are demonstrably sufficient for this architecture; add one only if the
threat review finds a concrete gap.

---

# 11. Command authorization and audit trail

For these classes, persist a concise operator event:

- report bundle approval;
- requested correction;
- evidence operator resolution;
- cancellation/supersession;
- retry/new epoch;
- identity/manual override;
- archive;
- permanent delete;
- restore;
- scan launch/reorder where history is operationally useful.

Event contains:

- actor (`operator` in current single-user product);
- action code;
- subject/run/artifact refs;
- timestamp;
- prior/new state revision/digest where relevant;
- reason code if the action required one.

Do not persist confidential report prose or full form bodies merely for an
audit trail.

Existing prospect events remain the owner for prospect actions; evidence/report
domains own their own decision lineage. Do not duplicate every event globally.

---

# 12. Destructive actions

Archive/delete must:

1. show server-computed impact count/summary;
2. be blocked before click when active authoritative work exists;
3. recheck under 061 command protocol;
4. cancel nothing implicitly;
5. remove external/mailbox/preview/artifact state in the current safe order;
6. preserve enough durable state to retry a failed cleanup;
7. only delete the final owning record after dependent cleanup succeeded where
   current semantics require it.

Plan 050/current IA archive semantics remain binding: prospect relationship
history survives, audit/report storage is purged.

Do not offer “replace historical scan” as a destructive mutation; create a new
epoch/history entry instead.

---

# 13. Privacy in logs/diagnostics/analytics

Apply 065 redaction requirements plus:

- hash or omit contact values from operational metrics;
- do not log request bodies for prospect/report commands;
- strip query tokens/signed parameters before URL logging;
- no raw prompt/model response;
- no candidate PDF text;
- no screenshot pixels uploaded to generic telemetry;
- no arbitrary scanned snippet.

Use IDs/digests/reason codes for correlation.

If a developer needs confidential content for a one-off diagnosis, use an
explicit local/operator-controlled artifact inspection path, not broader
production logging.

---

# 14. Build/deployment boundaries

## 14.1 Mixed versions

The standard production topology remains one application release at a time.
If a separate browser worker is introduced:

- worker and app expose a narrow protocol version;
- app refuses incompatible worker versions;
- tasks include owning run epoch/token/digest;
- returned results are accepted only if ownership is still current;
- rolling mixed-version behavior is not assumed safe unless explicitly tested.

## 14.2 Deployment gate

Before production promotion of 058/059:

- browser isolation preflight green;
- scanner network egress tests green;
- candidate/evidence artifact privacy tests green;
- stale-worker promotion tests green;
- backup/restore drill updated;
- security headers/session tests green.

The deploy guard continues to refuse ordinary redeploy with active work unless
explicit override.

---

# 15. Security test matrix

## Browser isolation

- renderer sandbox preflight;
- compromised-page simulation cannot read injected app secret canary;
- browser profile isolation across pages/runs;
- worker crash/restart;
- resource exhaustion bounds;
- report renderer has no unnecessary external network;
- scanner browser cannot reach loopback/private/metadata target.

## Untrusted content

Fixtures containing:

- `<script>`;
- event-handler HTML;
- malformed URL;
- `javascript:` URL;
- credential URL;
- bidi controls;
- zero-width/control chars;
- huge selector/URL;
- prompt-injection text;
- `[object Object]`-style render-lint trigger.

Assert inert dashboard display and no privileged action/network effect.

## Auth/session/request

- unauthenticated control/artifact access denied;
- login fixation/rotation;
- expired session returns to intended local path;
- cross-origin mutation refused;
- invalid content type/body size refused;
- open redirect via return path refused;
- error responses retain security headers.

## Artifacts

- private candidate cannot be fetched anonymously;
- wrong audit/candidate ID cannot cross-read another artifact;
- digest mismatch fails;
- stale/superseded candidate cannot promote;
- archive/delete cleanup retries safely;
- signed/object URL absent from logs.

## Command races

- stale approval token;
- stale delete/archive;
- cancelled lease late write;
- two tabs approve/retry simultaneously;
- mixed-version worker result.

---

# 16. Accessibility/security intersection

Security UI must remain accessible:

- password/login errors associated to fields;
- no CAPTCHA dependence unless attack evidence requires it;
- session-expiry recovery preserves intended route;
- destructive confirmation works by keyboard;
- security-policy blocks have human copy plus technical code;
- external-link destination is understandable;
- control-character sanitization does not silently change the copied evidence
  without offering exact safe detail when required.

---

# 17. Migration

## Phase A — tests and preflight

1. Add browser-isolation capability/preflight to production-equivalent smoke.
2. Add network/private-target browser tests from Plan 059.
3. Add untrusted-display/artifact/session security tests.
4. Add explicit candidate no-store/auth checks.

## Phase B — sandbox resolution

5. Attempt and verify supported Chromium sandbox in current app container.
6. If successful, remove `--no-sandbox` and update runbook/trade-off.
7. If not, implement the constrained browser execution boundary from section 5.2.
8. Only then promote 058/059 browser-dependent production paths.

## Phase C — application hardening

9. Introduce safe untrusted-text/URL presentation helpers where repeated risks
   exist; do not create a general rendering framework.
10. Add command audit events.
11. Harden candidate/evidence routes/cache/privacy.
12. Update backup/retention/archive cleanup for new object graphs.

## Phase D — deployment proof

13. Run production-like security/fault suite.
14. Run restore drill.
15. Verify standard deploy and forced-recovery path.
16. Record the final accepted isolation profile in canonical trade-offs/runbook.

---

# 18. Fail-closed conditions

Do not production-promote the new evidence/report pipelines when:

- Chromium isolation preflight fails or is unknown;
- scanner public-network enforcement is not active for browser subresources;
- report renderer can unnecessarily reach arbitrary external networks;
- browser process has broad production secrets without an approved sandbox/
  equivalent boundary;
- candidate/evidence artifact route can be accessed outside intended auth;
- digest/read-back integrity required by 058/059 fails;
- stale worker ownership is ambiguous;
- a destructive command cannot prove active-work safety;
- an untrusted-content path requires active HTML rendering without a proven
  sandbox/sanitizer contract.

---

# 19. Explicitly rejected alternatives

- Keeping `--no-sandbox` beside all secrets because the dashboard is private.
- Adding Kubernetes/microservices merely to claim isolation.
- Giving a browser worker the app's entire `.env`.
- Trusting unguessable object keys as authorization.
- Rendering scanned HTML directly in the dashboard.
- Using an LLM to decide whether a target URL is safe.
- A “force unsafe scan” button.
- Public candidate report links.
- Dumping report/site content into logs/Sentry.
- Enterprise RBAC/SSO before there is more than one operator/account need.
- Deleting database references before object cleanup, making orphan recovery impossible.
- Silent sanitization that destroys exact evidence without an exact-detail path.

---

# 20. Definition of done

Plan 066 is implemented when:

1. production browser execution satisfies a verified sandbox or approved equivalent isolation profile;
2. the current `--no-sandbox`/all-secrets risk is removed from the promoted 058/059 path;
3. Plan-059 public-network policy covers navigation, redirects, DNS and browser subresources;
4. report rendering has no unnecessary arbitrary network access;
5. website-derived content is inert in every migrated dashboard/report-control surface;
6. candidate/evidence/report artifacts are private, authenticated, cache-safe and digest-verified where required;
7. stale/destructive/approval commands are protected by 061 server rechecks;
8. operator security-sensitive actions have bounded domain-owned audit lineage;
9. telemetry/logging/privacy canary tests show no forbidden content leakage;
10. session/same-origin/security-header behavior is regression-tested;
11. archive/delete/backup/restore semantics cover the new content-addressed object graphs safely;
12. stale/mixed-version browser workers cannot promote or overwrite current evidence/reports;
13. production-like security/fault tests and restore rehearsal pass before pipeline promotion.
