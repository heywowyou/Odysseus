import { describe, expect, it } from 'vitest';
import { assessObligations } from './assessObligations.js';
import { ARTICLE_47_REGIME_ID } from './regimes.js';
import type { OperatorProfile, Provenanced } from '../types/entity.js';
import type { SiteSignals } from '../types/compliance.js';

const RETRIEVED_AT = new Date('2026-01-01T00:00:00Z');

function provenance<T>(value: T, source = 'sirene-api'): Provenanced<T> {
  return { value, source, retrievedAt: RETRIEVED_AT };
}

interface ProfileOverrides {
  siren?: string;
  effectifCode?: string | null;
  effectifSource?: string;
  turnover?: number | null;
}

function buildProfile(overrides: ProfileOverrides): OperatorProfile {
  const effectifCode = overrides.effectifCode === undefined ? '02' : overrides.effectifCode;
  return {
    siren: provenance(overrides.siren ?? '732829320'),
    denomination: provenance('Test Company'),
    naf: provenance('62.01Z'),
    legalForm: provenance('SAS'),
    effectifBand:
      effectifCode === null
        ? provenance(null, overrides.effectifSource ?? 'sirene-lookup:api-unreachable')
        : provenance(
            { code: effectifCode, label: `Band ${effectifCode}` },
            overrides.effectifSource ?? 'sirene-api',
          ),
    turnover: provenance(overrides.turnover ?? null),
  };
}

const withFlow: SiteSignals = { hasTransactionalFlow: true, transactionalFlowEvidence: [] };
const withoutFlow: SiteSignals = { hasTransactionalFlow: false, transactionalFlowEvidence: [] };

describe('assessObligations', () => {
  it('is out_of_scope when both SME exemption conditions hold (micro-exempt)', () => {
    const profile = buildProfile({ effectifCode: '02', turnover: 500_000 });
    const result = assessObligations(profile, withFlow);
    expect(result.status).toBe('out_of_scope');
    expect(result.basis[0]?.facts).toContainEqual({
      kind: 'sme-exemption',
      effectifCode: '02',
      turnoverEur: 500_000,
    });
  });

  it('is in_scope by headcount alone', () => {
    const profile = buildProfile({ effectifCode: '22', turnover: null });
    const result = assessObligations(profile, withFlow);
    expect(result.status).toBe('in_scope');
    expect(result.basis[0]?.facts).toContainEqual({
      kind: 'effectif-band',
      code: '22',
      label: 'Band 22',
    });
  });

  it('is in_scope by turnover alone with a low headcount band', () => {
    const profile = buildProfile({ effectifCode: '01', turnover: 3_000_000 });
    const result = assessObligations(profile, withFlow);
    expect(result.status).toBe('in_scope');
    expect(result.basis[0]?.facts).toContainEqual({
      kind: 'turnover',
      amountEur: 3_000_000,
      thresholdEur: 2_000_000,
    });
  });

  it('is out_of_scope for lack of transactional flow despite a high headcount band', () => {
    const profile = buildProfile({ effectifCode: '22', turnover: null });
    const result = assessObligations(profile, withoutFlow);
    expect(result.status).toBe('out_of_scope');
    expect(result.basis[0]?.facts).toContainEqual({ kind: 'no-transactional-flow' });
  });

  // Issue #42 (Villas Foch, real audit ff95ff97): a five-star hotel whose
  // booking controls carry no href attribute at all left
  // hasTransactionalFlow=false with nothing else recorded, resolved
  // out_of_scope, and silently withheld the EAA reference from a client
  // who does take bookings. A detector-resolved negative with unresolved
  // booking signals must resolve inconclusive, not clean.
  it('resolves likely_in_scope with an inconclusive fact when the detector recorded unresolved booking controls', () => {
    const profile = buildProfile({ effectifCode: '22', turnover: null });
    const inconclusive: SiteSignals = {
      hasTransactionalFlow: false,
      transactionalFlowEvidence: [],
      transactionalFlowAmbiguities: [
        {
          selector: 'a.item__booking-link',
          pageUrl: 'https://www.villasfoch.fr/fr/chambres-et-suites',
          matchedVia: ['class'],
          detail: 'Booking-intent control matched via class; no crawlable destination.',
        },
      ],
    };
    const result = assessObligations(profile, inconclusive);
    expect(result.status).toBe('likely_in_scope');
    expect(result.basis[0]?.facts).toContainEqual({ kind: 'transactional-flow-inconclusive' });
    expect(result.basis[0]?.facts).not.toContainEqual({ kind: 'no-transactional-flow' });
  });

  it('resolves likely_in_scope when a followed booking link came back undetermined', () => {
    const profile = buildProfile({ effectifCode: '22', turnover: null });
    const inconclusive: SiteSignals = {
      hasTransactionalFlow: false,
      transactionalFlowEvidence: [],
      transactionalFlowRedirectChecks: [
        {
          pageUrl: 'https://example.com/',
          linkUrl: 'https://unknown-engine.example/book',
          resolution: 'undetermined',
          detail:
            'Destination page matches neither the origin page identifying text nor a multi-property search UI.',
        },
      ],
    };
    const result = assessObligations(profile, inconclusive);
    expect(result.status).toBe('likely_in_scope');
    expect(result.basis[0]?.facts).toContainEqual({ kind: 'transactional-flow-inconclusive' });
  });

  it('keeps a clean negative when the only redirect checks resolved marketplace', () => {
    const profile = buildProfile({ effectifCode: '22', turnover: null });
    const cleanNegative: SiteSignals = {
      hasTransactionalFlow: false,
      transactionalFlowEvidence: [],
      transactionalFlowRedirectChecks: [
        {
          pageUrl: 'https://example.com/',
          linkUrl: 'https://www.booking.com/hotel/fr/example.html',
          resolution: 'marketplace',
          detail: 'www.booking.com is a known third-party booking marketplace; not followed.',
        },
      ],
    };
    const result = assessObligations(profile, cleanNegative);
    expect(result.status).toBe('out_of_scope');
    expect(result.basis[0]?.facts).toContainEqual({ kind: 'no-transactional-flow' });
  });

  it('keeps the SME exemption decisive even with unresolved booking signals', () => {
    const profile = buildProfile({ effectifCode: '02', turnover: 500_000 });
    const inconclusive: SiteSignals = {
      hasTransactionalFlow: false,
      transactionalFlowEvidence: [],
      transactionalFlowAmbiguities: [
        {
          selector: 'a.reservation',
          pageUrl: 'https://example.com/',
          matchedVia: ['class'],
          detail: 'Booking-intent control matched via class; no crawlable destination.',
        },
      ],
    };
    const result = assessObligations(profile, inconclusive);
    expect(result.status).toBe('out_of_scope');
  });

  // item 0.1 (La Corniche pass, real bug: a report declared a 5-star
  // hotel with a live booking widget "Hors champ" on the basis of "absence
  // de parcours de réservation"). Confirms the acceptance check stated in
  // report-feedback-la-corniche.md: a non-exempt profile can never come
  // out out_of_scope while any transactional-path evidence is present,
  // regardless of which detector produced it.
  it('is never out_of_scope for a non-exempt profile when transactional-flow evidence is present, whatever its kind', () => {
    const profile = buildProfile({ effectifCode: '22', turnover: null });
    const withBookingIframe: SiteSignals = {
      hasTransactionalFlow: true,
      transactionalFlowEvidence: [
        {
          kind: 'booking-iframe',
          selector: 'iframe[src]',
          pageUrl: 'https://lacoorniche.com/',
          detail: 'Booking/reservation widget embedded as an iframe from widget.thefork.com',
          providerUrl: 'https://widget.thefork.com/4c1aa87c-f07e-43b7-9710-77b72a83b66a',
        },
      ],
    };
    const result = assessObligations(profile, withBookingIframe);
    expect(result.status).not.toBe('out_of_scope');
  });

  it('is undetermined when no SIREN was ever found', () => {
    const profile = buildProfile({ siren: '' });
    const result = assessObligations(profile, withFlow);
    expect(result.status).toBe('undetermined');
    expect(result.basis[0]?.facts).toContainEqual({ kind: 'siren-missing' });
  });

  it('is undetermined when the Sirene lookup fails', () => {
    const profile = buildProfile({
      effectifCode: null,
      effectifSource: 'sirene-lookup:api-unreachable',
    });
    const result = assessObligations(profile, withFlow);
    expect(result.status).toBe('undetermined');
    expect(result.basis[0]?.facts).toContainEqual({
      kind: 'sirene-lookup-failed',
      reason: 'api-unreachable',
    });
  });

  it('triggers article 47 independently of the EAA result', () => {
    const profile = buildProfile({ effectifCode: '00', turnover: 260_000_000 });
    const result = assessObligations(profile, withoutFlow);
    expect(result.status).toBe('in_scope');
    const article47Basis = result.basis.find((b) => b.regimeId === ARTICLE_47_REGIME_ID);
    expect(article47Basis).toBeDefined();
    expect(article47Basis?.facts).toContainEqual({
      kind: 'turnover',
      amountEur: 260_000_000,
      thresholdEur: 250_000_000,
    });
  });

  it('is callable with only a profile, for a future headcount-only prospecting filter (acceptance criterion 9)', () => {
    const exemptProfile = buildProfile({ effectifCode: '02', turnover: 500_000 });
    expect(assessObligations(exemptProfile).status).toBe('out_of_scope');

    const notExemptProfile = buildProfile({ effectifCode: '22', turnover: null });
    expect(assessObligations(notExemptProfile).status).toBe('likely_in_scope');
  });
});
