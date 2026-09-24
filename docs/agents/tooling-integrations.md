# Tooling integrations

This is the implementation register for the ten repository/tooling
recommendations reviewed in September 2026. A recommendation counts as
implemented only when the named repository seam exists; external account
credentials remain opt-in and are never committed.

| Recommendation | Status | Implementation |
| --- | --- | --- |
| dependency-cruiser | Implemented | `.dependency-cruiser.cjs`, `pnpm run architecture:check`, CI/pre-push |
| Renovate | Implemented, local only | `renovate.json` policy, `pnpm run deps:check` (Docker, `local` platform) |
| Trivy | Implemented | CI filesystem/image scans, SBOM, `.trivyignore.yaml` |
| Sentry | Implemented, opt-in | metadata-only job telemetry sink behind `SENTRY_DSN` |
| fast-check | Implemented | deterministic property-test support and core property suites |
| IBM Equal Access | Implemented as secondary CI checker | `deploy/equal-access-ci.sh`, `.achecker.yml`, CI |
| Langfuse | Implemented, opt-in | metadata-only LLM OTLP sink behind explicit Langfuse env vars |
| Semgrep Community Edition | Implemented | pinned custom-rule CI + positive/negative fixtures |
| restic | Implemented, operator-configured | encrypted backup/check/restore-drill scripts + runbook |
| Context7 | Implemented, opt-in | official project MCP in `.mcp.json`, disabled by default |

## Operating rule

These tools support the product; none becomes a second source of domain truth.
Security/telemetry integrations remain fail-open for application correctness
unless a plan explicitly makes a local validation gate blocking. Secrets and
client content follow the existing privacy rules. Tool upgrades are handled
through the same pinned/version-reviewed dependency policy as the rest of the
repository.
