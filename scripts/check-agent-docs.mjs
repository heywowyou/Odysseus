import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const requiredPaths = [
  '.editorconfig',
  '.prettierignore',
  '.prettierrc.json',
  'AGENTS.md',
  'CLAUDE.md',
  'docs/agents/coding-conventions.md',
  'docs/agents/documentation-map.md',
  'docs/agents/handoff.md',
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
    if (entry.name === '.git' || entry.name === '.agents' || entry.name === 'node_modules') {
      continue;
    }
    const entryPath = resolve(directory, entry.name);
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

const agentsPath = resolve(repoRoot, 'AGENTS.md');
if (existsSync(agentsPath) && statSync(agentsPath).size > 24 * 1024) {
  errors.push('AGENTS.md exceeds the project lean-entry-point limit of 24 KiB.');
}

const requiredReferences = [
  ['AGENTS.md', 'CLAUDE.md'],
  ['AGENTS.md', 'docs/agents/documentation-map.md'],
  ['AGENTS.md', 'docs/agents/coding-conventions.md'],
  ['AGENTS.md', 'docs/agents/session-template.md'],
  ['CLAUDE.md', 'docs/agents/handoff.md'],
  ['CLAUDE.md', 'docs/agents/coding-conventions.md'],
  ['CLAUDE.md', 'docs/agents/documentation-map.md'],
];

for (const [documentPath, requiredReference] of requiredReferences) {
  const fullPath = resolve(repoRoot, documentPath);
  if (existsSync(fullPath) && !readFileSync(fullPath, 'utf8').includes(requiredReference)) {
    errors.push(`${documentPath} must reference ${requiredReference}.`);
  }
}

const gitignore = readFileSync(resolve(repoRoot, '.gitignore'), 'utf8');
if (!gitignore.split(/\r?\n/).includes('/docs/session/current-session.md')) {
  errors.push('The ephemeral current-session log must remain gitignored.');
}

const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
for (const scriptName of ['check', 'docs:check', 'format', 'format:check', 'lint', 'typecheck']) {
  if (!packageJson.scripts?.[scriptName]) {
    errors.push(`package.json must define the shared ${scriptName} script.`);
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    process.stderr.write(`${error}\n`);
  }
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Agent documentation check passed (${markdownFiles.length} Markdown files).\n`,
  );
}
