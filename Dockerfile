# Odysseus deploy image: multi-stage, final base node:24-bookworm-slim.
# Four stages: deps (manifests + full pnpm install), build (full source +
# tsc/vite build), prod-deps (production dependencies of the CLI and the
# workspace packages it runs, nothing else), runtime (those dependencies,
# the built packages and the few source files read at run time, plus
# Playwright Chromium; a non-root user runs `odysseus serve`).
#
# Issue #528: the runtime used to copy the whole build workspace, so vitest,
# eslint, typescript, jsdom, the Next.js site's dependencies, every fixture
# and every compiled test shipped in the container that holds every secret
# next to an unsandboxed Chromium (trade-off 92).

# pnpm is never fetched from a floating tag: corepack reads the exact
# version and hash pinned in package.json's packageManager field.
FROM node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS deps
WORKDIR /app
# Manifests first, so pnpm install's layer cache survives unrelated source
# changes. Every workspace importer must be present (including
# fixtures/spa-demo and packages/site) or --frozen-lockfile fails.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc .pnpmfile.cjs ./
COPY fixtures/spa-demo/package.json fixtures/spa-demo/package.json
COPY packages/cli/package.json packages/cli/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/interface/package.json packages/interface/package.json
COPY packages/llm/package.json packages/llm/package.json
COPY packages/report/package.json packages/report/package.json
COPY packages/scanner/package.json packages/scanner/package.json
COPY packages/site/package.json packages/site/package.json
COPY packages/store/package.json packages/store/package.json
# Chromium is a runtime-stage concern; downloading it here would add
# hundreds of megabytes to a layer that only needs npm packages.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN corepack enable && pnpm install --frozen-lockfile

FROM node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app ./
COPY . .
# Same build the CI uses: the CLI and everything it depends on, in
# dependency order, including the dashboard's vite build into
# packages/interface/dist/public.
RUN pnpm --filter @odysseus/cli... run build

# Compiled tests are not runtime code.
RUN find packages -path '*/dist/*' -name '*.test.*' -delete

FROM node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS prod-deps
WORKDIR /app
COPY --from=deps /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/.npmrc /app/.pnpmfile.cjs ./
COPY --from=deps /app/fixtures/spa-demo/package.json fixtures/spa-demo/package.json
COPY --from=deps /app/packages packages
RUN find packages -name node_modules -prune -exec rm -rf {} +
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
# `@odysseus/cli...` is the CLI and every workspace package it depends on;
# --prod leaves out every devDependency, the site and the fixtures.
RUN corepack enable && pnpm install --prod --frozen-lockfile --filter '@odysseus/cli...'

FROM node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6
WORKDIR /app
# findWorkspaceRoot locates the runtime by pnpm-workspace.yaml, and every
# path the packages resolve (dist/public, the artifacts root) hangs off it.
COPY --from=prod-deps /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=prod-deps /app/node_modules node_modules
COPY --from=prod-deps /app/packages packages
COPY --from=build /app/packages/cli/dist packages/cli/dist
COPY --from=build /app/packages/core/dist packages/core/dist
COPY --from=build /app/packages/interface/dist packages/interface/dist
COPY --from=build /app/packages/llm/dist packages/llm/dist
COPY --from=build /app/packages/report/dist packages/report/dist
COPY --from=build /app/packages/scanner/dist packages/scanner/dist
COPY --from=build /app/packages/store/dist packages/store/dist
# The report inlines its stylesheets and fonts from src at render time.
COPY --from=build /app/packages/report/src/styles packages/report/src/styles
COPY --from=build /app/packages/report/src/fonts packages/report/src/fonts
# Maintenance scripts run inside the container (`node /app/scripts/...`),
# and the runbook's in-container PDF check renders this one fixture.
COPY --from=build /app/scripts scripts
COPY --from=build /app/fixtures/test-audits/small-site fixtures/test-audits/small-site

# Issue #58: .git is excluded from the build context (.dockerignore), so the
# runtime cannot derive a commit the way a developer checkout does, and every
# report rendered here used to print the literal word "unknown" to the client.
# The commit is known to whoever builds the image, so it is stamped in as a
# build argument. Empty is the honest default for an unstamped local build:
# readOdysseusBuildId then falls through to its git path, and to the sentinel
# only if that fails too.
ARG ODYSSEUS_BUILD_ID=""
ENV ODYSSEUS_BUILD_ID=${ODYSSEUS_BUILD_ID}

# Same reasoning, for the build timestamp /api/meta reports alongside the
# commit (issue: expose build/revision metadata). Empty by default; the
# metadata endpoint reports null rather than a guessed value when unset.
ARG ODYSSEUS_BUILT_AT=""
ENV ODYSSEUS_BUILT_AT=${ODYSSEUS_BUILT_AT}

# Chromium lands in a fixed, world-readable path, installed as root BEFORE
# dropping to the runtime user so both the browser and its apt system deps
# are present. Called via node directly: the runtime stage needs no package
# manager, and this avoids a second corepack pnpm fetch.
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
RUN node packages/scanner/node_modules/playwright/cli.js install --with-deps chromium

# The base image's npm, npx and corepack are never run here, and the npm CLI
# bundles its own dependencies, which the release gate's image scan flagged
# (brace-expansion, ip-address, tar; 2026-09-25). Removing them leaves nothing
# to patch.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

# Artifacts live in a volume so audit output survives image upgrades and is
# the one thing a backup must capture.
ENV ODYSSEUS_ARTIFACTS_ROOT=/data/artifacts
RUN groupadd --gid 10001 odysseus \
    && useradd --uid 10001 --gid odysseus --create-home odysseus \
    && mkdir -p /data/artifacts \
    && chown -R odysseus:odysseus /data/artifacts
VOLUME /data/artifacts

USER odysseus
EXPOSE 4600
# No Chromium sandbox flags are baked in: rootless container deployments
# pass them at runtime via ODYSSEUS_CHROMIUM_EXTRA_ARGS (see deploy/compose.yaml).
CMD ["node", "packages/cli/dist/index.js", "serve"]
