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
| #484, #512, #525, #527, #528 | Deploy the branch | No access to the production server; deploying is a production mutation | After merge, deploy with `deploy/odysseus-deploy.sh`. This ships the rsync exclusions, Caddy compression, the compose file without the scan service, the Node 24 image and the pruned image. |
| #526 | Re-verify the dashboard UX ledger live | No browser session on the production dashboard | Run the next UX sweep and mark each ledger item FIXED or REGRESSED against its closed GitHub issue. |
| #533 | Export the first campaign's funnel | Needs the production database, and the export date has not come yet | Before 2026-12-23, run `node packages/cli/dist/index.js outreach-funnel --json` on the server and keep the output. D2 and D3 remain operator decisions (not an access limit). |
