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
  isValidSiren,
  type AuditManifest,
  type ObligationAssessment,
  type OperatorProfile,
  type Provenanced,
  type SirenMismatch,
} from '@odysseus/core';
import { lookupOperatorProfile } from '../sirene/sirene-cache.js';

/** siren keeps its own provenance (where the SIREN value itself came
 *  from) separate from the other fields' provenance (why they could not
 *  be resolved), since a lookup failure says nothing about whether the
 *  SIREN value itself is trustworthy. */
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

export async function runObligationStage(
  manifest: AuditManifest,
  connection: Connection,
  manualSiren?: string,
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
    return assessObligations(
      unresolvedProfile('', 'crawl:no-mentions-legales-siren', 'crawl:no-mentions-legales-siren'),
    );
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
      return attachProvenance(
        assessObligations(unresolvedProfile(effectiveSiren, `siren:${sirenSource}`, `sirene-lookup:${lookup.status}`)),
      );
    }

    const profile: OperatorProfile = {
      ...lookup.profile,
      siren: { ...lookup.profile.siren, source: `siren:${sirenSource}` },
    };

    if (!manifest.siteSignals) {
      return attachProvenance(assessObligations(profile));
    }

    return attachProvenance(
      assessObligations(profile, {
        hasTransactionalFlow: manifest.siteSignals.hasTransactionalFlow,
        transactionalFlowEvidence: manifest.siteSignals.transactionalFlowEvidence,
      }),
    );
  } catch {
    // Any unexpected failure (e.g. Mongo unreachable) must not block the
    // rest of the audit - degrade to undetermined the same as a known
    // Sirene failure mode.
    return attachProvenance(
      assessObligations(unresolvedProfile(effectiveSiren, `siren:${sirenSource}`, 'sirene-lookup:api-unreachable')),
    );
  }
}
