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
| #527 | Confirm CI on Node 24 | GitHub Actions has not run on this branch | Open a PR, or push to `main`, and check that CI passes on Node 24. It was only verified locally, with Node 24.21.0 and the built image. |
| #515 | Confirm CI's MongoDB replica set | Same | Check that CI's `docker compose up -d --wait mongo-test` step starts the single-node replica set. |
| #485 | Rotate credentials | No provider console access; credentials are the operator's | Decide whether to rotate the keys that earlier agent sessions held in their environment while browsing prospect sites (database, model, mailbox, buckets, dashboard password). |
| #530 | Check production for live v1 or v2 preview rows | No production database read (the read-only MongoDB MCP failed to connect) | Look for `outreach_previews` rows with `status: live` and `previewContentVersion` `v1` or `v2`. Their public pages keep working, but drafting from them now refuses until they are republished as v3. |
| #526 | Re-verify the dashboard UX ledger live | No browser session on the production dashboard | Run the next UX sweep and mark each ledger item FIXED or REGRESSED against its closed GitHub issue. |
| #533 | Export the first campaign's funnel | Needs the production database, and the export date has not come yet | Before 2026-12-23, run `node packages/cli/dist/index.js outreach-funnel --json` on the server and keep the output. D2 and D3 remain operator decisions (not an access limit). |
