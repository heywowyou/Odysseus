# Odysseus deploy image: multi-stage, final base node:22-bookworm-slim.
# Three stages: deps (manifests + pnpm install), build (full source +
# tsc/vite build), runtime (whole workspace + Playwright Chromium, then a
# non-root user runs `odysseus serve`).

# pnpm is never fetched from a floating tag: corepack reads the exact
# version and hash pinned in package.json's packageManager field.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
# Manifests first, so pnpm install's layer cache survives unrelated source
# changes. Every workspace importer must be present (including
# fixtures/spa-demo and packages/site) or --frozen-lockfile fails.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
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

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app ./
COPY . .
# Same build the CI uses: the CLI and everything it depends on, in
# dependency order, including the dashboard's vite build into
# packages/interface/dist/public.
RUN pnpm --filter @odysseus/cli... run build

FROM node:22-bookworm-slim
WORKDIR /app
COPY --from=build /app ./

# Chromium lands in a fixed, world-readable path, installed as root BEFORE
# dropping to the runtime user so both the browser and its apt system deps
# are present. Called via node directly: the runtime stage needs no package
# manager, and this avoids a second corepack pnpm fetch.
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
RUN node node_modules/playwright/cli.js install --with-deps chromium

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
