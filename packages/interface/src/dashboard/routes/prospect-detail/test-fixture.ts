/** A fully populated prospect, for the page's characterization test and its
 *  panels' tests (issue #532). */

import type { ProspectActionability, ProspectHubDetail } from './types';

export const PROSPECT: ProspectHubDetail = {
  prospectId: 'prospect-1',
  sector: 'hotel',
  name: 'Hôtel Fixture',
  websites: [
    {
      url: 'https://fixture.example/',
      registrableDomain: 'fixture.example',
      kind: 'own',
      primary: true,
    },
    {
      url: 'https://old.fixture.example/',
      registrableDomain: 'fixture.example',
      kind: 'own',
      primary: false,
    },
  ],
  commune: 'NICE',
  department: '06',
  status: 'audited',
  hotel: { stars: 3, rooms: 24, groupStatus: 'independent' },
  emails: [
    { address: 'contact@fixture.example', origin: 'site-discovery' },
    { address: 'resa@fixture.example', origin: 'operator' },
  ],
  lastActivityAt: '2026-09-20T10:00:00.000Z',
  siren: '552100554',
  tradingName: 'Fixture',
  legalName: 'Fixture SAS',
  notes: 'Rappeler en octobre',
  outreachLanguage: 'fr',
  stakeholders: [{ name: 'Jeanne Dupont', position: 'Directrice' }],
  fieldOrigins: { name: 'atout-france', siren: 'operator' },
  audits: [
    {
      auditId: 'audit-1',
      siteUrl: 'https://fixture.example/',
      kind: 'audit',
      scanIntent: 'full-audit',
      startedAt: '2026-09-18T10:00:00.000Z',
      finishedAt: '2026-09-18T11:00:00.000Z',
    },
  ],
  previews: [
    {
      previewId: 'preview-1',
      status: 'live',
      publishedAt: '2026-09-19T10:00:00.000Z',
      publicExpiresAt: '2026-10-19T10:00:00.000Z',
      url: 'https://odysseusaudit.com/apercu/token-1',
    },
  ],
  contactSuggestion: {
    address: 'info@fixture.example',
    sourceUrl: 'https://fixture.example/contact',
  },
  events: [
    {
      eventId: 'event-1',
      type: 'prospect-created',
      actor: 'operator',
      at: '2026-09-10T10:00:00.000Z',
      payload: { origin: 'directory' },
    },
    {
      eventId: 'event-2',
      type: 'status-changed',
      actor: 'system',
      at: '2026-09-18T12:00:00.000Z',
      payload: {},
    },
  ],
  work: {
    items: [],
    recommendation: { action: 'create-first-email', href: '/prospects/prospect-1#emails' },
    auditState: 'qualifying',
    qualifyingAuditId: 'audit-1',
    dataVersionState: 'current',
    websiteSuppressed: false,
    emailSuppressed: false,
  },
  thread: {
    threadId: 'thread-1',
    state: 'e1-drafted',
    currentTouch: 1,
    stateEnteredAt: '2026-09-20T10:00:00.000Z',
    touches: [],
    updatedAt: '2026-09-20T10:00:00.000Z',
  },
  drafts: [
    {
      draftId: 'draft-1',
      touch: 1,
      status: 'created',
      subject: 'Une question pour votre établissement',
      body: 'Bonjour,\nUne question.',
      recipient: 'contact@fixture.example',
      mailboxUrl: 'https://mail.google.com/mail/u/0/#drafts',
      language: 'fr',
      previewUrl: 'https://odysseusaudit.com/apercu/token-1',
      createdAt: '2026-09-20T10:00:00.000Z',
    },
  ],
};

export const ACTIONABILITY: ProspectActionability = {
  actions: {
    preview: { state: 'available' },
    'first-email': { state: 'available' },
    'follow-up': { state: 'blocked', reason: 'follow-up-not-due' },
  },
};
