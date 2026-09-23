import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Plan 050 closure proof: the scan-producer inventory. It enumerates every
 * runtime producer of a new job across the workspace sources and pins the
 * list. Ordinary dashboard work may create only `quick-check` or
 * `full-audit`. The one other producer is classified below. A new producer,
 * or a new job type on an existing one, fails this test until it is added
 * here and classified deliberately.
 */

const PACKAGES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '__golden__') continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) files.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith('.d.ts'))
      files.push(full);
  }
  return files;
}

const WORKSPACE_SOURCES = readdirSync(PACKAGES_DIR)
  .map((pkg) => path.join(PACKAGES_DIR, pkg, 'src'))
  .filter((dir) => {
    try {
      return statSync(dir).isDirectory();
    } catch {
      return false;
    }
  })
  .flatMap(sourceFiles);

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
}

function relative(file: string): string {
  return path.relative(PACKAGES_DIR, file).split(path.sep).join('/');
}

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

interface Producer {
  file: string;
  type: string;
}

/** Every `createJob(...)` call, with the source text of its `type`. */
function createJobProducers(): Producer[] {
  const producers: Producer[] = [];
  for (const file of WORKSPACE_SOURCES) {
    const source = parse(file);
    walk(source, (node) => {
      if (
        !ts.isCallExpression(node) ||
        !ts.isIdentifier(node.expression) ||
        node.expression.text !== 'createJob'
      ) {
        return;
      }
      const input = node.arguments[1];
      const typeProperty =
        input && ts.isObjectLiteralExpression(input)
          ? input.properties.find(
              (property): property is ts.PropertyAssignment =>
                ts.isPropertyAssignment(property) &&
                ts.isIdentifier(property.name) &&
                property.name.text === 'type',
            )
          : undefined;
      producers.push({
        file: relative(file),
        type: typeProperty?.initializer.getText(source) ?? '<unknown>',
      });
    });
  }
  return producers.sort((a, b) => a.type.localeCompare(b.type));
}

describe('scan-producer inventory', () => {
  it('has one job producer, the guarded single and batch launch path', () => {
    expect(createJobProducers()).toEqual([
      {
        file: 'interface/src/routes/scans.ts',
        type: 'canonicalJobTypeForScanIntent(type)',
      },
    ]);
  });

  it('types the dashboard launch path to Quick check and Full scan only', () => {
    const source = parse(path.join(PACKAGES_DIR, 'interface/src/routes/scans.ts'));
    const aliases = new Map<string, string>();
    walk(source, (node) => {
      if (ts.isTypeAliasDeclaration(node)) {
        aliases.set(node.name.text, node.type.getText(source));
      }
    });
    expect(aliases.get('LaunchableScanType')).toBe("'quick-check' | 'full-audit'");

    const intents = parse(path.join(PACKAGES_DIR, 'store/src/scan-intents.ts'));
    let body = '';
    walk(intents, (node) => {
      if (ts.isFunctionDeclaration(node) && node.name?.text === 'canonicalJobTypeForScanIntent') {
        body = node.body?.getText(intents) ?? '';
      }
    });
    // The launch type passes through unchanged: no remapping to a retired
    // type can hide here.
    expect(body.replace(/\s+/g, ' ')).toBe('{ return intent; }');
  });

  it('writes new job documents only through createJob in the store', () => {
    const writers: string[] = [];
    for (const file of WORKSPACE_SOURCES.filter((f) => relative(f).startsWith('store/src/'))) {
      const source = parse(file);
      walk(source, (node) => {
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          ['create', 'insertOne', 'insertMany'].includes(node.expression.name.text)
        ) {
          const receiver = node.expression.expression.getText(source);
          if (/\bJob(?:Model)?\b|createJobModel\(/.test(receiver)) {
            writers.push(`${relative(file)}:${receiver}.${node.expression.name.text}`);
          }
        }
      });
    }
    expect([...new Set(writers)]).toEqual(['store/src/jobs.ts:JobModel.create']);
  });

  it('builds no dashboard object with a retired or batch-only scan type', () => {
    const offenders: string[] = [];
    for (const file of WORKSPACE_SOURCES.filter((f) =>
      relative(f).startsWith('interface/src/dashboard/'),
    )) {
      const source = parse(file);
      walk(source, (node) => {
        if (
          ts.isPropertyAssignment(node) &&
          ts.isIdentifier(node.name) &&
          node.name.text === 'type' &&
          ts.isStringLiteral(node.initializer) &&
          ['prospecting', 'prospecting-audit', 'outreach-full-scan'].includes(node.initializer.text)
        ) {
          offenders.push(`${relative(file)}: type ${node.initializer.text}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it('sees the whole workspace, so the pinned lists above are not vacuous', () => {
    const packages = new Set(WORKSPACE_SOURCES.map((file) => relative(file).split('/')[0]));
    for (const pkg of ['core', 'scanner', 'llm', 'store', 'report', 'interface', 'cli']) {
      expect(packages).toContain(pkg);
    }
    expect(WORKSPACE_SOURCES.length).toBeGreaterThan(300);
  });
});
