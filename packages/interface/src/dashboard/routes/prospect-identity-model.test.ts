import { describe, expect, it } from 'vitest';
import { en } from '../i18n/en';
import { fr } from '../i18n/fr';
import {
  identityOriginNotes,
  sirenDraftError,
  type ProspectIdentityValues,
} from './prospect-identity-model';

describe('sirenDraftError', () => {
  it('passes an empty draft (the field is optional) and a checksum-valid one', () => {
    expect(sirenDraftError('', en.prospectHub.detail.sirenInvalidError)).toBeNull();
    expect(sirenDraftError('732 829 320', en.prospectHub.detail.sirenInvalidError)).toBeNull();
    expect(sirenDraftError('732829320', fr.prospectHub.detail.sirenInvalidError)).toBeNull();
  });

  it('returns the localized copy for a draft that fails the checksum', () => {
    expect(sirenDraftError('732829321', en.prospectHub.detail.sirenInvalidError)).toBe(
      en.prospectHub.detail.sirenInvalidError,
    );
    expect(sirenDraftError('732829321', fr.prospectHub.detail.sirenInvalidError)).toBe(
      fr.prospectHub.detail.sirenInvalidError,
    );
  });
});

describe('identityOriginNotes', () => {
  const copy = en.prospectHub.detail;
  const identity: ProspectIdentityValues = {
    siren: '732829320',
    tradingName: 'Hôtel du Midi',
    legalName: 'SARL Hôtel du Midi',
  };

  it('labels every stored field whose origin the record knows', () => {
    const notes = identityOriginNotes(
      identity,
      { siren: 'site-discovery', tradingName: 'operator' },
      copy,
      'Unknown',
    );
    expect(notes).toEqual([
      { field: 'siren', note: copy.originLabels['site-discovery'] },
      { field: 'tradingName', note: copy.originLabels['operator'] },
    ]);
  });

  it('skips absent values and fields without recorded origins, in field order', () => {
    const notes = identityOriginNotes(
      { siren: '732829320', legalName: 'SARL Hôtel du Midi' },
      { legalName: 'atout-france' },
      copy,
      'Unknown',
    );
    // siren carries no recorded origin and renders no line; legalName does.
    expect(notes).toEqual([{ field: 'legalName', note: copy.originLabels['atout-france'] }]);
  });

  it('falls back to the vocabulary fallback for an unknown origin code', () => {
    const notes = identityOriginNotes(
      { siren: '732829320' },
      { siren: 'future-origin' },
      copy,
      '—',
    );
    expect(notes).toEqual([{ field: 'siren', note: '—' }]);
  });

  it('renders no lines for a prospect without identity', () => {
    expect(identityOriginNotes({}, {}, copy, 'Unknown')).toEqual([]);
  });
});
