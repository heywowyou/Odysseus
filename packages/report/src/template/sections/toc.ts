import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, sheet } from '../html-utils.js';
import { computeSectionNumbers, sectionTitle, type SectionId } from '../section-registry.js';

/** `includedIds` is whichever of the 14 SECTION_IDS actually rendered a
 *  `<section>` in the body (render-html.ts's renderBody decides this
 *  once and passes the same set to both this function and every
 *  numbered section's own header) - report-feedback-palais-gallien.md
 *  item 2: a section suppressed for having no content (observations.ts,
 *  when nothing was diverted) must disappear from the TOC too, not just
 *  the body, and every later row must renumber to stay contiguous rather
 *  than leaving a gap or a dead anchor. */
export function renderToc(strings: ReportStrings, includedIds: ReadonlySet<SectionId>): string {
  const numbers = computeSectionNumbers(includedIds);
  // Narrative groups, plan 018 step 3; the trailing split into methodology,
  // appendix, then glossary is plan 024's glossary-last reversal. Labels and
  // membership bind to the
  // canonical tocGroups data in docs/report/design/report-mockup-standalone.flat.html
  // (the reference template's TOC loop iterates the same data); ids are the
  // mockup's display positions mapped back to stable registry ids via
  // docs/report/report-design-system.md's section table. Rows inside a group
  // stay in registry order, and every group keeps only the ids actually
  // included, so a suppressed section drops its whole row, not its group.
  //
  // Issue #49: section-14 (Prochaines étapes) used to sit in the decisions-
  // and-actions group because that is its narrative role, but the body
  // renders it after every evidence section (registry order: it sits between
  // section-10 and the legal reference), so its live ordinal is always the
  // largest of the numbered middle sections. Listing it in an early group
  // made the TOC read 4, 5, 6, 12, then 7, 8, 9 - both the section numbers
  // and the page numbers ran backwards across the group boundary, on the
  // first navigational page of a paid deliverable. Group membership now
  // follows document order: the row closes the evidence group, which keeps
  // every ordinal monotonic top to bottom. The mockup's own tocGroups data
  // still carries the old membership (n: '12' inside Décisions et actions);
  // it needs the same one-row move the next time that file is touched.
  const groups: Array<{ label: string; ids: readonly SectionId[] }> = [
    {
      label: strings.toc.executiveContextGroupLabel,
      ids: ['section-00', 'section-01', 'section-03'],
    },
    {
      label: strings.toc.decisionsActionsGroupLabel,
      ids: ['section-04', 'section-05', 'section-05b'],
    },
    {
      label: strings.toc.detailedEvidenceGroupLabel,
      ids: [
        'section-06',
        'section-07',
        'section-08',
        'section-09',
        'section-15',
        'section-10',
        'section-14',
      ],
    },
    { label: strings.toc.legalReferenceGroupLabel, ids: ['section-02'] },
    {
      label: strings.toc.methodVocabularyGroupLabel,
      ids: ['section-11'],
    },
    { label: strings.toc.technicalAppendixGroupLabel, ids: ['section-12'] },
    { label: strings.toc.glossaryGroupLabel, ids: ['section-13'] },
  ];
  const rows = groups
    .map(({ label: groupLabel, ids }) => {
      const rowsInGroup = ids
        .filter((id) => includedIds.has(id))
        .map((id) => {
          const label = sectionTitle(id, strings);
          return `
        <div style="display:flex;align-items:baseline;gap:var(--space-3);padding:var(--space-3) 0;background:linear-gradient(to right,transparent,var(--color-divider) 0,var(--color-divider) 100%,transparent) no-repeat bottom/100% 1px">
          <span class="n" style="font-size:12px;color:var(--color-accent-300);width:22px;flex:none">${numbers.get(id)}</span>
          <a href="#${id}" class="toc-row" style="flex:1;font-size:14.5px;color:inherit;text-decoration:none">${escapeHtml(label)}</a>
        </div>
      `;
        });
      if (rowsInGroup.length === 0) return '';
      return `<h5 style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;color:var(--color-accent-300);margin:var(--space-8) 0 var(--space-1)">${escapeHtml(groupLabel)}</h5>${rowsInGroup.join('')}`;
    })
    .join('');

  return sheet(
    `
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:var(--space-2)">
      <h6 style="color:var(--color-accent-300);margin:0">${escapeHtml(strings.toc.eyebrow)}</h6>
    </div>
    <h2 style="margin-bottom:var(--space-6)">${escapeHtml(strings.toc.heading)}</h2>
    ${rows}
  `,
    'sheet-standalone',
  );
}
