import { describe, expect, it } from 'vitest';
import { en } from '../i18n/en';
import { fr } from '../i18n/fr';
import { ApiError } from '../lib/api';
import {
  archiveConfirmDescription,
  archiveFailureNotice,
  deleteFailureNotice,
  detailsPatch,
  emailAddition,
  firstEmailBody,
  outcomeFailureNotice,
  outcomeNotice,
  outreachResultNotice,
  scanAgeLabel,
  scanRefusalNotice,
  websiteAddition,
} from './prospect-hub-detail-model';

const copy = fr.prospectHub.detail;
const fallback = fr.common.vocabularyFallback;
const site = { url: 'https://a.fr/', registrableDomain: 'a.fr', kind: 'own', primary: true };

describe('websiteAddition', () => {
  it('adds a normalized http(s) URL, primary only when it is the first', () => {
    expect(websiteAddition([], ' https://Hotel.fr ')).toEqual({
      kind: 'add',
      websites: [
        { url: 'https://hotel.fr/', registrableDomain: 'hotel.fr', kind: 'unknown', primary: true },
      ],
    });
    const added = websiteAddition([site], 'http://b.fr/chambres');
    expect(added.kind === 'add' && added.websites[1]?.primary).toBe(false);
  });

  it.each(['not a url', 'ftp://a.fr/', 'javascript:alert(1)'])('refuses %j', (typed) => {
    expect(websiteAddition([site], typed)).toEqual({ kind: 'invalid' });
  });

  it('changes nothing for an empty or already listed website', () => {
    expect(websiteAddition([site], '   ')).toEqual({ kind: 'unchanged' });
    expect(websiteAddition([site], 'https://a.fr')).toEqual({ kind: 'unchanged' });
  });
});

describe('emailAddition', () => {
  const existing = [{ address: 'contact@a.fr', origin: 'operator' }];

  it('adds a typed address, lower-cased, as an operator entry', () => {
    expect(emailAddition(existing, ' Resa@A.fr ')).toEqual([
      ...existing,
      { address: 'resa@a.fr', origin: 'operator' },
    ]);
  });

  it('adds a discovered address with its source as attestation', () => {
    expect(
      emailAddition(existing, 'ignored@a.fr', {
        address: 'info@a.fr',
        sourceUrl: 'https://a.fr/contact',
      }),
    ).toEqual([
      ...existing,
      { address: 'info@a.fr', origin: 'site-discovery', attestation: 'https://a.fr/contact' },
    ]);
  });

  it('adds nothing for an empty or duplicate address', () => {
    expect(emailAddition(existing, '  ')).toBeNull();
    expect(emailAddition(existing, 'CONTACT@a.fr')).toBeNull();
  });
});

describe('detailsPatch', () => {
  it('trims values, clears emptied fields and normalizes the SIREN', () => {
    expect(detailsPatch({ name: '  Hôtel  ', phone: '   ', siren: '732 829 320' })).toEqual({
      name: 'Hôtel',
      phone: undefined,
      siren: '732829320',
    });
  });

  it('is null when nothing was edited', () => {
    expect(detailsPatch({})).toBeNull();
  });
});

describe('firstEmailBody', () => {
  it('reuses the live preview token and sends nothing without one', () => {
    expect(firstEmailBody('https://odysseus.example/apercu/abc123')).toEqual({
      previewToken: 'abc123',
    });
    expect(firstEmailBody(null)).toEqual({});
  });
});

describe('notices', () => {
  it('names a refusal, and falls back for an unknown one', () => {
    const [refusal, label] = Object.entries(copy.refusalLabels)[0]!;
    expect(
      outreachResultNotice(copy, fallback, { done: false, refusal }, copy.firstEmailCreated),
    ).toBe(copy.actionRefused.replace('{reason}', label));
    expect(
      outreachResultNotice(copy, fallback, { done: false, refusal: 'nope' }, copy.followUpCreated),
    ).toBe(copy.actionRefused.replace('{reason}', fallback));
    expect(outreachResultNotice(copy, fallback, { done: true }, copy.previewPublished)).toBe(
      copy.previewPublished,
    );
  });

  it('treats a scan launch with no stated refusal as a failure', () => {
    expect(scanRefusalNotice(copy, fallback, undefined)).toBe(copy.actionFailed);
    expect(scanRefusalNotice(copy, fallback, 'host-busy')).toContain(
      copy.actionRefused.split('{reason}')[0]!,
    );
  });

  it('reports what an opt-out withdrew, otherwise the saved outcome', () => {
    const englishCopy = en.prospectHub.detail;
    const withdrawn = outcomeNotice(englishCopy, 'opted-out', {
      withdrawn: { drafts: 2, previews: 1 },
    });
    expect(withdrawn).toContain('2');
    expect(withdrawn).not.toContain('{drafts}');
    const pending = outcomeNotice(englishCopy, 'opted-out', {
      withdrawn: { drafts: 1, previews: 0, mailboxDraftsNotRemoved: 2 },
    });
    expect(pending).toContain(englishCopy.mailboxDeletionWarning.replace('{count}', '2'));
    const [outcome, label] = Object.entries(englishCopy.outcomeLabels)[0]!;
    expect(outcomeNotice(englishCopy, outcome, {})).toBe(
      englishCopy.outcomeSaved.replace('{outcome}', label),
    );
  });

  it('explains a 409 on delete and on outcome, and nothing else', () => {
    const conflict = new ApiError('conflict', 409);
    const other = new ApiError('server', 500);
    expect(deleteFailureNotice(copy, conflict)).toBe(copy.deleteBlockedByJob);
    expect(deleteFailureNotice(copy, other)).toBe(copy.actionFailed);
    expect(deleteFailureNotice(copy, new Error('network'))).toBe(copy.actionFailed);
    expect(outcomeFailureNotice(copy, conflict)).toBe(copy.outcomeRefused);
    expect(outcomeFailureNotice(copy, other)).toBe(copy.actionFailed);
  });
});

describe('archive confirmation and failure (issue #381)', () => {
  it('states what is kept, what is deleted with counts, and that restore does not bring audits back', () => {
    const description = archiveConfirmDescription(['2 scan(s)', '40 constat(s)'], copy);
    expect(description).toContain(copy.archiveKeeps);
    expect(description).toContain('supprimés : 2 scan(s), 40 constat(s).');
    expect(description).toContain(copy.archiveRestoreNote);
    expect(archiveConfirmDescription([], en.prospectHub.detail)).toBe(
      `${en.prospectHub.detail.archiveKeeps} ${en.prospectHub.detail.archiveDeletes} ${en.prospectHub.detail.archiveRestoreNote}`,
    );
  });

  it('distinguishes an active-job refusal from an incomplete purge', () => {
    expect(archiveFailureNotice(copy, new ApiError('busy', 409))).toBe(copy.archiveBlockedByJob);
    expect(archiveFailureNotice(copy, new ApiError('storage', 503))).toBe(
      copy.archiveCleanupIncomplete,
    );
    expect(archiveFailureNotice(copy, new Error('network'))).toBe(copy.actionFailed);
  });
});

describe('scanAgeLabel', () => {
  it('reads a scan age naturally in both languages', () => {
    expect([0, 1, 3].map((days) => scanAgeLabel(days, copy))).toEqual([
      'aujourd’hui',
      'il y a 1 jour',
      'il y a 3 jours',
    ]);
    expect([0, 1, 3].map((days) => scanAgeLabel(days, en.prospectHub.detail))).toEqual([
      'today',
      '1 day ago',
      '3 days ago',
    ]);
  });
});
