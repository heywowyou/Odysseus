import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const requiredPaths = [
  '.editorconfig',
  '.prettierignore',
  '.prettierrc.json',
  '.claude/settings.json',
  '.codex/hooks.json',
  'AGENTS.md',
  'CLAUDE.md',
  'docs/agents/coding-conventions.md',
  'docs/agents/documentation-map.md',
  'docs/agents/handoff.md',
  'docs/agents/model-prompting.md',
  'docs/agents/plan-quality-gates.md',
  'docs/agents/session-template.md',
  'eslint.config.mjs',
];
const errors = [];

for (const relativePath of requiredPaths) {
  if (!existsSync(resolve(repoRoot, relativePath))) {
    errors.push(`Missing required agent document: ${relativePath}`);
  }
}

function collectMarkdownFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = resolve(directory, entry.name);
    const relativeEntryPath = relative(repoRoot, entryPath).replaceAll('\\', '/');
    if (
      entry.name === '.git' ||
      entry.name === '.agents' ||
      entry.name === '.zcode' ||
      entry.name === 'node_modules' ||
      relativeEntryPath === '.claude/worktrees' ||
      relativeEntryPath.startsWith('.claude/worktrees/')
    ) {
      continue;
    }
    if (entry.isDirectory()) {
      files.push(...collectMarkdownFiles(entryPath));
    } else if (entry.name.endsWith('.md')) {
      files.push(entryPath);
    }
  }
  return files;
}

const markdownFiles = collectMarkdownFiles(repoRoot);
const markdownLinkPattern = /\[[^\]]*\]\(([^)]+)\)/g;

for (const markdownPath of markdownFiles) {
  const contents = readFileSync(markdownPath, 'utf8');
  for (const match of contents.matchAll(markdownLinkPattern)) {
    let target = match[1].trim();
    if (target.startsWith('<') && target.endsWith('>')) {
      target = target.slice(1, -1);
    }
    if (/^(?:https?:|mailto:|#)/.test(target)) {
      continue;
    }
    target = decodeURIComponent(target.split('#')[0]);
    if (!target) {
      continue;
    }
    const resolvedTarget = resolve(dirname(markdownPath), target);
    if (!existsSync(resolvedTarget)) {
      errors.push(
        `Broken local Markdown link in ${markdownPath.slice(repoRoot.length + 1)}: ${match[1]}`,
      );
    }
  }
}

for (const [entryPoint, maxBytes] of [
  ['AGENTS.md', 16 * 1024],
  ['CLAUDE.md', 16 * 1024],
]) {
  const fullPath = resolve(repoRoot, entryPoint);
  if (existsSync(fullPath) && statSync(fullPath).size > maxBytes) {
    errors.push(`${entryPoint} exceeds the 16 KiB lean entry-point limit.`);
  }
}

for (const entryPoint of ['AGENTS.md', 'CLAUDE.md']) {
  const fullPath = resolve(repoRoot, entryPoint);
  if (existsSync(fullPath) && !readFileSync(fullPath, 'utf8').includes('Default to action')) {
    errors.push(
      `${entryPoint} must preserve the local reversible-work "Default to action" contract.`,
    );
  }
}

const claudeSettingsPath = resolve(repoRoot, '.claude/settings.json');
if (existsSync(claudeSettingsPath)) {
  const settings = JSON.parse(readFileSync(claudeSettingsPath, 'utf8'));
  if (Array.isArray(settings.permissions?.ask) && settings.permissions.ask.length > 0) {
    errors.push(
      '.claude/settings.json must not add project-level ask gates for reversible local edits.',
    );
  }
  if (settings.hooks && Object.keys(settings.hooks).length > 0) {
    errors.push('.claude/settings.json must not install ambient project-wide hooks.');
  }
}

const codexHooksPath = resolve(repoRoot, '.codex/hooks.json');
if (existsSync(codexHooksPath)) {
  const hooks = JSON.parse(readFileSync(codexHooksPath, 'utf8')).hooks ?? {};
  if (Object.keys(hooks).length > 0) {
    errors.push('.codex/hooks.json must not install ambient project-wide hooks.');
  }
}

const explicitOnlySkills = [
  '.agents/skills/implement/SKILL.md',
  '.agents/skills/improve/SKILL.md',
  '.agents/skills/research/SKILL.md',
  '.agents/skills/prototype/SKILL.md',
  '.agents/skills/dashboard-ux-audit/SKILL.md',
  '.agents/skills/public-website-audit/SKILL.md',
  '.agents/skills/scan-report-audit/SKILL.md',
  '.agents/skills/client-report-finalizer/SKILL.md',
  '.agents/skills/impeccable/SKILL.md',
];
for (const skillPath of explicitOnlySkills) {
  const fullPath = resolve(repoRoot, skillPath);
  if (!existsSync(fullPath)) {
    errors.push(`Missing workflow-changing skill: ${skillPath}`);
    continue;
  }
  const contents = readFileSync(fullPath, 'utf8');
  const frontmatterMatch = contents.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  const frontmatter = frontmatterMatch?.[1] ?? '';
  if (!/^disable-model-invocation:\s*true\s*$/m.test(frontmatter)) {
    errors.push(`${skillPath} changes the normal workflow and must remain explicit-only.`);
  }
}

const gitignore = readFileSync(resolve(repoRoot, '.gitignore'), 'utf8');
if (!gitignore.split(/\r?\n/).includes('/docs/session/current-session.md')) {
  errors.push('The optional ephemeral current-session log must remain gitignored.');
}

const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
for (const scriptName of [
  'check',
  'docs:check',
  'plans:check',
  'format',
  'format:check',
  'lint',
  'typecheck',
]) {
  if (!packageJson.scripts?.[scriptName]) {
    errors.push(`package.json must define the shared ${scriptName} script.`);
  }
}

if (existsSync(resolve(repoRoot, 'advisor-plans'))) {
  errors.push('The retired advisor-plans/ directory must not come back; plans live in plans/.');
}
for (const removedLedger of ['plans/findings.md', 'plans/report-findings.md']) {
  if (existsSync(resolve(repoRoot, removedLedger))) {
    errors.push(`${removedLedger} is a retired finding ledger.`);
  }
}
const plansIndexPath = resolve(repoRoot, 'plans/README.md');
if (!existsSync(plansIndexPath)) {
  errors.push('plans/README.md must exist: it is the single index of executable plans.');
} else {
  // Every executor is routed here, so its context cost is paid every session.
  // Narrative belongs in the plan file or its archive, not in a status cell.
  const plansIndexMaxBytes = 24 * 1024;
  const plansIndexMaxRowChars = 400;
  if (statSync(plansIndexPath).size > plansIndexMaxBytes) {
    errors.push('plans/README.md exceeds its 24 KiB index limit; move narrative into the plans.');
  }
  readFileSync(plansIndexPath, 'utf8')
    .split(/\r?\n/)
    .forEach((line, index) => {
      if (line.startsWith('|') && line.length > plansIndexMaxRowChars) {
        errors.push(
          `plans/README.md:${index + 1} table row exceeds ${plansIndexMaxRowChars} characters; keep status to one sentence plus a link.`,
        );
      }
    });
}
const advisorPlansReference = /advisor-plans\//;
const migrationRecordPath = resolve(repoRoot, 'plans/archive/015-consolidate-work-tracking.md');
for (const markdownPath of markdownFiles) {
  if (markdownPath === resolve(repoRoot, 'docs/session/current-session.md')) continue;
  if (markdownPath === migrationRecordPath) continue;
  if (advisorPlansReference.test(readFileSync(markdownPath, 'utf8'))) {
    errors.push(`${relative(repoRoot, markdownPath)} still references advisor-plans/.`);
  }
}

if (errors.length > 0) {
  for (const error of errors) process.stderr.write(`${error}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Agent documentation check passed (${markdownFiles.length} Markdown files).\n`,
  );
}
