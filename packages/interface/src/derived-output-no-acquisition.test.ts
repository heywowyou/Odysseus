import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Plan 050 closure proof: work derived from stored evidence (report
 * regeneration, renormalization, outreach drafts and previews, prospect
 * archive/restore, and reuse of an older compatible audit) can never start
 * website acquisition.
 *
 * The test follows every runtime import, static or dynamic, from each derived
 * entry point through this package. It fails if that closure reaches a
 * module that acquires a website (the audit stage, a job runner, the job
 * queue, the prospecting fetchers or the scan-launch route), imports a
 * scanner symbol outside the non-acquisition allowlist, or imports the
 * store's job producer. Dependency-cruiser cannot express this across
 * packages: every workspace import resolves to the scanner's barrel, which
 * reaches the crawler by construction.
 */

const SRC = path.dirname(fileURLToPath(import.meta.url));

const DERIVED_ENTRY_POINTS = {
  'report regeneration': ['pipeline/make-report-ready.ts', 'pipeline/regenerate-reports.ts'],
  renormalization: ['pipeline/renormalize-audit.ts'],
  'outreach drafts and previews': [
    'outreach/draft-runtime.ts',
    'outreach/assemble-outreach-draft.ts',
    'outreach/publish-preview-v2.ts',
  ],
  'archive/restore and audit reuse routes': ['routes/prospect-hub.ts', 'routes/audits.ts'],
} as const;

/** In-package modules that acquire a website or enqueue work that does. */
const ACQUISITION_MODULES = [
  /^pipeline\/audit-stage\.ts$/,
  /^queue\/pipeline\/run-[^/]+\.ts$/,
  /^queue\/job-queue\.ts$/,
  /^prospecting\//,
  /^routes\/scans\.ts$/,
];

/** Scanner runtime symbols that neither fetch nor browse a website. Every
 *  other scanner runtime import (crawlSite, scanSite, scanPage, renderDiff,
 *  runAxe, runLighthouse, the checks, robots and CrUX fetchers) is refused. */
const SCANNER_NON_ACQUISITION = new Set([
  'buildAuditDir',
  'getArtifactsRoot',
  'buildArtifactBucketKey',
  'buildAuditArtifactBucketPrefix',
  'buildAuditTimestampDir',
  'parseAuditTimestampDir',
  'readOdysseusBuildId',
  'ensureEnvLoaded',
  'findWorkspaceRoot',
  'UNLIMITED_MAX_PAGES',
  // Prints the locally rendered report HTML to PDF; the report page loads
  // no website (report-stage.ts).
  'launchBrowser',
  // Read the persisted Plan 059 evidence graph and hash stored findings;
  // none of them fetches (report-quality-evidence.ts, audit-evidence-quality.ts).
  'readApprovedAuditEvidence',
  'readAuditEvidenceSnapshot',
  'readEvidenceQualityAssessment',
  'confirmedFindingsDigest',
  'hasAssessedEvidenceGraph',
  'APPROVED_AUDIT_EVIDENCE_PATH',
  'AUDIT_EVIDENCE_SNAPSHOT_PATH',
  'EVIDENCE_QUALITY_ASSESSMENT_PATH',
]);

/** The store's only scan-job producer. */
const STORE_JOB_PRODUCERS = new Set(['createJob']);

interface ModuleImports {
  local: string[];
  runtimeNames: Map<string, string[]>;
}

function parseImports(relative: string): ModuleImports {
  const file = path.join(SRC, relative);
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest);
  const local: string[] = [];
  const runtimeNames = new Map<string, string[]>();
  const addRuntime = (specifier: string, names: string[]) => {
    if (specifier.startsWith('.')) {
      const resolved = path
        .relative(SRC, path.resolve(path.dirname(file), specifier))
        .replace(/\.js$/, '.ts');
      const candidate = existsSync(path.join(SRC, resolved))
        ? resolved
        : resolved.replace(/\.ts$/, '/index.ts');
      local.push(candidate);
      return;
    }
    runtimeNames.set(specifier, [...(runtimeNames.get(specifier) ?? []), ...names]);
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      if (clause?.isTypeOnly) return;
      const names: string[] = [];
      if (clause?.name) names.push('default');
      const bindings = clause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          if (!element.isTypeOnly) names.push((element.propertyName ?? element.name).text);
        }
      } else if (bindings && ts.isNamespaceImport(bindings)) {
        names.push('*');
      }
      if (clause === undefined || names.length > 0) {
        addRuntime(node.moduleSpecifier.text, names);
      }
    } else if (
      ts.isExportDeclaration(node) &&
      !node.isTypeOnly &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      addRuntime(node.moduleSpecifier.text, ['*']);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      addRuntime(node.arguments[0].text, ['*']);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { local, runtimeNames };
}

function closureOf(entries: readonly string[]): Map<string, ModuleImports> {
  const seen = new Map<string, ModuleImports>();
  const pending = [...entries];
  while (pending.length > 0) {
    const next = pending.pop()!;
    if (seen.has(next)) continue;
    const imports = parseImports(next);
    seen.set(next, imports);
    pending.push(...imports.local);
  }
  return seen;
}

function violationsOf(closure: Map<string, ModuleImports>): string[] {
  const violations: string[] = [];
  for (const [module, imports] of closure) {
    if (ACQUISITION_MODULES.some((pattern) => pattern.test(module))) {
      violations.push(`${module} is an acquisition module`);
    }
    for (const name of imports.runtimeNames.get('@odysseus/scanner') ?? []) {
      if (!SCANNER_NON_ACQUISITION.has(name)) {
        violations.push(`${module} imports ${name} from @odysseus/scanner`);
      }
    }
    for (const name of imports.runtimeNames.get('@odysseus/store') ?? []) {
      if (STORE_JOB_PRODUCERS.has(name) || name === '*') {
        violations.push(`${module} imports ${name} from @odysseus/store`);
      }
    }
  }
  return violations;
}

describe('derived output cannot start website acquisition', () => {
  it.each(Object.entries(DERIVED_ENTRY_POINTS))(
    '%s reaches no acquisition module, scanner acquisition symbol or job producer',
    (_label, entries) => {
      const closure = closureOf(entries);
      expect(closure.size).toBeGreaterThanOrEqual(entries.length);
      expect(violationsOf(closure)).toEqual([]);
    },
  );

  it('lets a Full scan perform no operator side effect: no preview publish, mailbox draft or send', () => {
    const closure = closureOf(['queue/pipeline/run-full-audit-job.ts']);
    expect(closure.size).toBeGreaterThan(10);
    const sideEffects = [...closure.keys()].filter((module) => module.startsWith('outreach/'));
    expect(sideEffects).toEqual([]);
    const storeSideEffects = [...closure.values()].flatMap((imports) =>
      (imports.runtimeNames.get('@odysseus/store') ?? []).filter((name) =>
        /^(?:open|publish|record|create|send|transition|mark|save|persist|upsert|insert)\w*(?:Outreach|Outcome|Preview|Draft)/.test(
          name,
        ),
      ),
    );
    expect(storeSideEffects).toEqual([]);
  });

  it('flags an acquisition edge, so the empty lists above are not vacuous', () => {
    // The job runners and the scan route are real acquisition paths.
    expect(violationsOf(closureOf(['queue/pipeline/run-full-audit-job.ts']))).not.toEqual([]);
    expect(violationsOf(closureOf(['routes/scans.ts']))).toContain(
      'routes/scans.ts is an acquisition module',
    );
    expect(violationsOf(closureOf(['pipeline/audit-stage.ts']))).toEqual(
      expect.arrayContaining([expect.stringMatching(/imports \w+ from @odysseus\/scanner$/)]),
    );
  });
});
