/**
 * Builds an OperatorProfile from the SIREN the scan found and/or a
 * manually supplied one, calls the pure assessObligations, and returns
 * the result. Missing SIREN or a failed Sirene lookup must not block the
 * rest of the audit - both degrade to 'undetermined' rather than
 * throwing or assuming scope, matching the same posture the rest of the
 * pipeline takes toward a single failed scanner pass.
 *
 * Resolving which SIREN to use (extracted, manual, or both) happens
 * entirely here, before assessObligations is ever called - that function
 * has no notion of SIREN provenance, only whether the profile it is
 * given resolves. See @odysseus/core's ObligationAssessment doc comment.
 */

import type { Connection } from 'mongoose';
import {
  assessObligations,
  detectSector,
  isValidSiren,
  type AuditManifest,
  type AuditManifestSiteSignals,
  type ObligationAssessment,
  type OperatorProfile,
  type Provenanced,
  type SirenMismatch,
  type SiteSignalOverrides,
  type SiteSignalResolution,
  type SiteSignals,
} from '@odysseus/core';
import { lookupOperatorProfile } from '../sirene/sirene-cache.js';
import { logger } from '../logger.js';

/** siren keeps its own provenance (where the SIREN value itself came
 *  from) separate from the other fields' provenance (why they could not
 *  be resolved), since a lookup failure says nothing about whether the
 *  SIREN value itself is trustworthy. */
/** Splices the sector classification onto an assessment, computed from
 *  whichever OperatorProfile (resolved or unresolved) produced it - the
 *  same "never set by assessObligations itself" precedent as sirenSource,
 *  see ObligationAssessment.sector's doc comment in @odysseus/core. */
function withSector(assessment: ObligationAssessment, profile: OperatorProfile): ObligationAssessment {
  return { ...assessment, sector: detectSector(profile.naf.value) };
}

/** item 0.1/1.11: only meaningful once a real Sirene lookup has actually
 *  populated the profile - unresolvedProfile's placeholder denomination
 *  ('') would otherwise print as an empty registry input, which is worse
 *  than omitting the snapshot entirely. */
function withRegistrySnapshot(assessment: ObligationAssessment, profile: OperatorProfile): ObligationAssessment {
  if (!profile.denomination.value) return assessment;
  return {
    ...assessment,
    registrySnapshot: {
      denomination: profile.denomination.value,
      effectifBandLabel: profile.effectifBand.value?.label ?? null,
      retrievedAt: profile.siren.retrievedAt,
      source: profile.siren.source,
      ...(profile.turnover.value !== null && profile.turnover.value > 0
        ? { turnoverEur: profile.turnover.value }
        : {}),
    },
  };
}

function unresolvedProfile(siren: string, sirenSource: string, lookupFailureSource: string): OperatorProfile {
  const retrievedAt = new Date();
  const field = <T,>(value: T): Provenanced<T> => ({ value, source: lookupFailureSource, retrievedAt });
  return {
    siren: { value: siren, source: sirenSource, retrievedAt },
    denomination: field(''),
    naf: field(''),
    legalForm: field(''),
    effectifBand: field(null),
    turnover: field(null),
  };
}

interface ResolvedSiren {
  siren: string;
  source: 'extracted' | 'manual';
  mismatch?: SirenMismatch;
}

/**
 * Both present and equal: extracted wins - it is the stronger
 * evidentiary claim (the site vouches for itself), even though the two
 * values agree anyway. Both present and different: manual wins (that is
 * what the operator explicitly asked to audit), and the disagreement is
 * recorded as a mismatch rather than silently resolved either way - it
 * can mean the site is operated by a different legal entity than the one
 * being audited. Only one present: use it, tagged accordingly. Neither:
 * nothing to resolve.
 */
function resolveEffectiveSiren(extracted: string | undefined, manual: string | undefined): ResolvedSiren | undefined {
  if (manual && extracted) {
    if (manual === extracted) return { siren: extracted, source: 'extracted' };
    return { siren: manual, source: 'manual', mismatch: { extractedSiren: extracted, manualSiren: manual } };
  }
  if (manual) return { siren: manual, source: 'manual' };
  if (extracted) return { siren: extracted, source: 'extracted' };
  return undefined;
}

/**
 * Resolves the effective SiteSignals passed to assessObligations, mirroring
 * resolveEffectiveSiren above: a manual override wins whenever present
 * (the auditor is asserting a personally verified fact), the detector's
 * own value otherwise. Unlike the SIREN case there is no "both present
 * and equal, prefer the stronger claim" branch - a manual override that
 * happens to agree with the detector is still recorded as manual, since
 * it was still explicitly asserted.
 *
 * Only 'hasTransactionalFlow' is read from overrides today (the only
 * signal this milestone's UI/CLI surface exposes), but the loop is
 * written generically over overrides' own keys so the next overridable
 * SiteSignals boolean field needs a new map key here, not new branching.
 * detected may be undefined (no scan-derived siteSignals at all, e.g. a
 * pre-milestone-5 manifest) - a manual override still produces a usable
 * SiteSignals in that case, which is the whole point of the escape hatch.
 */
function resolveSiteSignals(
  detected: AuditManifestSiteSignals | undefined,
  overrides: SiteSignalOverrides | undefined,
): {
  siteSignals: SiteSignals | undefined;
  resolutions: Record<string, SiteSignalResolution>;
} {
  const resolutions: Record<string, SiteSignalResolution> = {};

  if (detected) {
    resolutions.hasTransactionalFlow = {
      value: detected.hasTransactionalFlow,
      source: 'detected',
    };
  }

  const override = overrides?.['hasTransactionalFlow'];
  if (override === undefined) {
    return { siteSignals: detected, resolutions };
  }

  const detectedValue = detected?.hasTransactionalFlow;
  if (detectedValue !== undefined && detectedValue !== override.value) {
    // A confirmed fact disagreeing with the detector is itself useful
    // signal for future detector work, per the milestone's design
    // constraints - logged, never used to change the resolved value.
    logger.warn(
      { override: override.value, detected: detectedValue },
      'manual hasTransactionalFlow override disagrees with the detector',
    );
  }

  resolutions.hasTransactionalFlow = {
    value: override.value,
    source: 'manual',
    ...(override.reason !== undefined ? { reason: override.reason } : {}),
    ...(detectedValue !== undefined && detectedValue !== override.value ? { detectedValue } : {}),
  };

  const siteSignals: SiteSignals = {
    hasTransactionalFlow: override.value,
    transactionalFlowEvidence: detected?.transactionalFlowEvidence ?? [],
    ...(detected?.transactionalFlowRedirectChecks !== undefined
      ? {
          transactionalFlowRedirectChecks: detected.transactionalFlowRedirectChecks,
        }
      : {}),
  };

  return { siteSignals, resolutions };
}

export async function runObligationStage(
  manifest: AuditManifest,
  connection: Connection,
  manualSiren?: string,
  siteSignalOverrides?: SiteSignalOverrides,
): Promise<ObligationAssessment> {
  const extractedSiren = manifest.siteSignals?.siren;
  // Trusts the CLI/interface boundary to have already validated this
  // (fail fast there, per the manual-SIREN milestone), but re-checks
  // defensively rather than letting a malformed value reach the Sirene
  // client - if it somehow arrives invalid, treat it as not supplied
  // rather than crash deep in the pipeline.
  const validatedManualSiren = manualSiren !== undefined && isValidSiren(manualSiren) ? manualSiren : undefined;

  const resolved = resolveEffectiveSiren(extractedSiren, validatedManualSiren);

  if (!resolved) {
    const profile = unresolvedProfile('', 'crawl:no-mentions-legales-siren', 'crawl:no-mentions-legales-siren');
    return withSector(assessObligations(profile), profile);
  }

  const { siren: effectiveSiren, source: sirenSource, mismatch: sirenMismatch } = resolved;

  const attachProvenance = (assessment: ObligationAssessment): ObligationAssessment => ({
    ...assessment,
    sirenSource,
    ...(sirenMismatch ? { sirenMismatch } : {}),
  });

  try {
    const lookup = await lookupOperatorProfile(connection, effectiveSiren);

    if (lookup.status !== 'found') {
      // Degrades to undetermined exactly as the extracted-only path
      // already does. Never falls back to the extracted SIREN here: a
      // failed manual lookup is a fact about the manual SIREN, not a
      // reason to silently re-try with a different one the operator did
      // not ask about.
      const profile = unresolvedProfile(effectiveSiren, `siren:${sirenSource}`, `sirene-lookup:${lookup.status}`);
      return withSector(attachProvenance(assessObligations(profile)), profile);
    }

    const profile: OperatorProfile = {
      ...lookup.profile,
      siren: { ...lookup.profile.siren, source: `siren:${sirenSource}` },
    };

    const { siteSignals, resolutions } = resolveSiteSignals(manifest.siteSignals, siteSignalOverrides);

    const assessment = siteSignals ? assessObligations(profile, siteSignals) : assessObligations(profile);

    return withRegistrySnapshot(
      withSector(
        attachProvenance({
          ...assessment,
          ...(Object.keys(resolutions).length > 0 ? { siteSignalResolutions: resolutions } : {}),
        }),
        profile,
      ),
      profile,
    );
  } catch {
    // Any unexpected failure (e.g. Mongo unreachable) must not block the
    // rest of the audit - degrade to undetermined the same as a known
    // Sirene failure mode.
    const profile = unresolvedProfile(effectiveSiren, `siren:${sirenSource}`, 'sirene-lookup:api-unreachable');
    return withSector(attachProvenance(assessObligations(profile)), profile);
  }
}
