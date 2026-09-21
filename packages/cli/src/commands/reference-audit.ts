/**
 * `odysseus reference-audit build|publish`: regenerates the permanent example
 * served at /exemple-audit, following the release workflow in
 * deploy/runbook.md.
 *
 * `build` renders a detached, anonymized candidate from one stored audit into
 * a local folder and never touches the public bucket. The operator reads that
 * PDF page by page. `publish` then uploads that exact PDF (digest-checked
 * against build time) and moves the current pointer last. The two steps stay
 * separate so no unreviewed candidate can reach the public URL.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import {
  buildReferenceAuditCandidate,
  createConfiguredReferenceAuditStore,
  loadReferenceAuditSource,
  publishReferenceAuditCandidate,
  type ReferenceAuditCandidateRelease,
} from '@odysseus/interface';
import { connectToMongo, disconnectFromMongo } from '@odysseus/store';

const PDF_FILE = 'reference-audit.pdf';
const HTML_FILE = 'reference-audit.html';
const RELEASE_FILE = 'release.json';

/** release.json is local and private, so it may name the source audit; the
 * public manifest never does. */
interface CandidateReleaseFile extends ReferenceAuditCandidateRelease {
  sourceAuditId: string;
}

function timestampForDirectory(date: Date): string {
  return date
    .toISOString()
    .replace(/\.\d{3}Z$/u, 'Z')
    .replace(/:/gu, '-');
}

function parseCandidateRelease(raw: string): CandidateReleaseFile {
  const value = JSON.parse(raw) as Partial<CandidateReleaseFile>;
  const strings = [
    'pdfSha256',
    'renderedAt',
    'rendererBuild',
    'dataVersion',
    'anonymizerVersion',
    'referenceReleaseVersion',
    'sourceAuditId',
  ] as const;
  if (
    strings.some((key) => typeof value[key] !== 'string') ||
    typeof value.pageCount !== 'number' ||
    typeof value.reportTemplateVersion !== 'number'
  ) {
    throw new Error(`${RELEASE_FILE} is incomplete; rebuild the candidate`);
  }
  return value as CandidateReleaseFile;
}

export function registerReferenceAuditCommand(program: Command): void {
  const reference = program
    .command('reference-audit')
    .description('Regenerate and publish the permanent anonymized example audit (/exemple-audit)');

  reference
    .command('build <artifacts-dir>')
    .description(
      'Render an anonymized reference candidate from a stored Full audit and its selected French ' +
        'analysis. Writes locally only; never rescans and never publishes.',
    )
    .option(
      '--out <dir>',
      'Candidate folder; defaults to <artifacts-dir>/reference-audit-candidates/<timestamp>',
    )
    .action(async (artifactsDir: string, opts: { out?: string }) => {
      const auditDir = path.resolve(artifactsDir);
      let connection: Awaited<ReturnType<typeof connectToMongo>> | undefined;
      try {
        connection = await connectToMongo();
        const source = await loadReferenceAuditSource(connection, auditDir);
        const built = await buildReferenceAuditCandidate(source);
        const outDir = opts.out
          ? path.resolve(opts.out)
          : path.join(
              auditDir,
              'reference-audit-candidates',
              timestampForDirectory(new Date(built.release.renderedAt)),
            );
        await fs.mkdir(outDir, { recursive: true });
        const releaseFile: CandidateReleaseFile = {
          ...built.release,
          sourceAuditId: source.manifest.auditId,
        };
        await fs.writeFile(path.join(outDir, PDF_FILE), built.pdf);
        await fs.writeFile(path.join(outDir, HTML_FILE), built.html, 'utf-8');
        await fs.writeFile(
          path.join(outDir, RELEASE_FILE),
          `${JSON.stringify(releaseFile, null, 2)}\n`,
          'utf-8',
        );
        console.log(
          `Reference candidate built: ${built.release.pageCount} pages, ` +
            `template ${built.release.reportTemplateVersion}, no source identifier leaked.`,
        );
        console.log(`  PDF: ${path.join(outDir, PDF_FILE)}`);
        console.log(
          '  Read it page by page, then publish it with:\n' +
            `  odysseus reference-audit publish ${outDir} --reviewed`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`odysseus reference-audit build: failed for ${auditDir}\n${message}`);
        process.exitCode = 1;
      } finally {
        if (connection) await disconnectFromMongo(connection);
      }
    });

  reference
    .command('publish <candidate-dir>')
    .description(
      'Publish a reviewed candidate to /exemple-audit: upload the digest-addressed PDF, verify ' +
        'the readback, then move the current pointer. The previous version stays stored for rollback.',
    )
    .option('--reviewed', 'confirm the candidate PDF was read page by page and approved', false)
    .action(async (candidateDir: string, opts: { reviewed: boolean }) => {
      const dir = path.resolve(candidateDir);
      try {
        if (!opts.reviewed) {
          throw new Error(
            'Refusing to publish without --reviewed. Read the candidate PDF page by page first.',
          );
        }
        const release = parseCandidateRelease(
          await fs.readFile(path.join(dir, RELEASE_FILE), 'utf-8'),
        );
        const pdf = new Uint8Array(await fs.readFile(path.join(dir, PDF_FILE)));
        const { sourceAuditId: _sourceAuditId, ...candidateRelease } = release;
        const result = await publishReferenceAuditCandidate(createConfiguredReferenceAuditStore(), {
          pdf,
          release: candidateRelease,
        });
        console.log(
          `Published reference ${result.manifest.pdfSha256.slice(0, 12)} ` +
            `(${result.manifest.pageCount} pages, template ${result.manifest.reportTemplateVersion}).`,
        );
        if (result.previousManifest !== null) {
          console.log(`  Previous version kept for rollback: ${result.previousManifest.pdfSha256}`);
        }
        console.log(
          '  Probe https://www.odysseusaudit.com/exemple-audit before sending new Touch-1 drafts.',
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`odysseus reference-audit publish: failed for ${dir}\n${message}`);
        process.exitCode = 1;
      }
    });
}
