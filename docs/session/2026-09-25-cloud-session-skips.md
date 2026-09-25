# Cloud session 2026-09-25: steps skipped for lack of access

The GitHub-issues cleanup (issues #477 to #533, branch
`claude/github-issues-cleanup-w0y05g`) ran in a cloud container. It had no
production server, no production database, no GitHub Actions run of this
branch, no browser session on the live dashboard and no provider consoles.
Every code change is committed. The steps below needed one of those, so they
were skipped and are left for the operator. Delete this file once each one is
done or dropped.

| Issue | Skipped step | Why it could not run here | What to do |
| --- | --- | --- | --- |
| #526 | Re-verify the dashboard UX ledger live | No browser session on the production dashboard | Run the next UX sweep and mark each ledger item FIXED or REGRESSED against its closed GitHub issue. |
| #533 | Export the first campaign's funnel | Optional since trade-off 121 dropped the experiment | If wanted, around 2026-12-10 run `node packages/cli/dist/index.js outreach-funnel --json` on the server and keep the output. |
