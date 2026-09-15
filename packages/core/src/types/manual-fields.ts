/**
 * Operator-supplied pre-report enrichment for an audit. Deliberately not
 * part of AuditManifest/manifest.json: the manifest is pure scanner
 * output, and these facts are DB-only input layered on top after a scan,
 * editable freely with no rescan required (see CLAUDE.md's manual-input-
 * layer milestone). Distinct from the pre-scan JobOptionsSnapshot fields
 * (seeds, exclusions, maxPages, bookingEngineUrl, and the original
 * scan-time siren/transactionalFlow override), which invalidate the crawl
 * and therefore live on the job, not the audit.
 *
 * None of these fields feed assessObligations() as a legal input except
 * siren, which reuses the exact same checksum-validate-then-resolve path
 * obligation-stage.ts already has for the pre-scan siren option. sector
 * and revenueBand only ever influence which reference-stat citation a
 * report shows (packages/report), never the in_scope/out_of_scope status
 * itself - see the milestone's rule 1.
 */

import type { StatSector } from '../reference-stats/types.js';
import type { SiteSignalOverride } from './compliance.js';

export type FieldProvenance = 'detected' | 'operator';

export interface ProvenancedField<T> {
  value: T;
  provenance: FieldProvenance;
}

export interface AuditManualFields {
  siren?: ProvenancedField<string>;
  /** The page on the audited site where the operator has personally
   *  confirmed the SIREN/RCS/TVA is displayed. Distinct question from
   *  "do we know the SIREN" (siren above): resolves the
   *  lcen-mentions-legales-missing finding only when set, since that
   *  finding is about what the site itself publishes, not what the
   *  operator separately knows. See packages/report's
   *  lcen-resolution.ts. */
  sirenSourceUrl?: ProvenancedField<string>;
  raisonSociale?: ProvenancedField<string>;
  nomCommercial?: ProvenancedField<string>;
  sector?: ProvenancedField<StatSector>;
  revenueBand?: ProvenancedField<string>;
  declarationContactEmail?: ProvenancedField<string>;
  recipientName?: ProvenancedField<string>;
  /** A post-scan, operator-verified correction to the transactional-flow
   * detector. The reason is mandatory here even though the scan-time CLI
   * override remains backward-compatible with an omitted reason: this
   * durable dashboard edit changes report legality context after evidence
   * collection, so it must leave an auditable explanation. */
  transactionalFlowOverride?: SiteSignalOverride & { reason: string };
  updatedAt: Date;
}
