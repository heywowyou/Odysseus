/**
 * The evaluation and filtering ledger of one stored audit (plan 075, after
 * sweep 9). Read-only, like the harness that prints it.
 *
 * Why it exists. Three sweeps found the same kind of defect by hand, weeks
 * after it started: a check that silently did not evaluate a site looks
 * exactly like a clean site. The structured-data check failed on every page
 * of one audit (H7); the Tab walk measured a consent banner instead of the
 * page on four audits (J3), so the absence of `keyboard-trap` there meant
 * nothing; a crawl gate refused a site over its own dead links. And every
 * filter added against a false positive can, in principle, start eating
 * real detections on the next site.
 *
 * So for each audit this reports two things per check, on every run:
 *   - evaluation: on how many analysed pages the check completed, failed,
 *     did not apply, left no record, or ran but could not conclude;
 *   - filtering: for axe, how many raw detections on analysed pages did not
 *     become finding occurrences, per rule.
 * and turns the thin ones into plain alerts. A number is not a verdict:
 * an alert says where to look, the sweep decides.
 */

/** A page-scope check that evaluated fewer than this share of the analysed
 *  pages it applied to is reported. */
export const THIN_EVALUATION_SHARE = 0.5;

/** An axe rule whose raw detections on analysed pages lost more than this
 *  share on the way to findings, over at least MIN_FILTERED_NODES nodes, is
 *  reported. Inactive calendar cells and captcha widgets are expected here;
 *  anything else is a filter to re-check. */
export const HEAVY_FILTER_SHARE = 0.5;
export const MIN_FILTERED_NODES = 20;

function identity(raw) {
  try {
    const url = new URL(raw);
    url.hash = '';
    if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.slice(0, -1);
    }
    if (url.search === '?') url.search = '';
    return url.href;
  } catch {
    return raw;
  }
}

/** The outcome of one check on one page: the scan's explicit record first,
 *  then the result and error fields the registry names. */
function outcomeOf(scan, entry) {
  const explicit = scan.checkOutcomes?.[entry.id];
  if (explicit === 'completed' || explicit === 'failed' || explicit === 'not-applicable') {
    return explicit;
  }
  if (entry.errorField !== undefined && scan[entry.errorField] !== undefined) return 'failed';
  if (scan[entry.resultField] !== undefined) return 'completed';
  return 'missing';
}

/** Checks that can complete without concluding, each read from its stored
 *  result. `isTabWalkHeldByDialog` comes from core, so the ledger and the
 *  normalizer never disagree on what a held walk is. */
function inconclusiveOf(scan, checkId, helpers) {
  if (checkId === 'keyboard-navigation') {
    const walk = scan.keyboardNavigation;
    return walk !== undefined && helpers.isTabWalkHeldByDialog?.(walk) === true;
  }
  if (checkId === 'video-captions') {
    const videos = scan.videoCaptions?.videos ?? [];
    return videos.some((video) => !video.hasCaptionTrack && video.audio === 'undetermined');
  }
  return false;
}

/**
 * @param {object} input
 * @param {object} input.manifest the audit's manifest.json
 * @param {object[]} input.scans the pages' scan.json documents
 * @param {object[]} input.findings the stored or replayed findings
 * @param {readonly object[]} input.registry CHECK_SCOPE_REGISTRY from the scanner build
 * @param {{ isTabWalkHeldByDialog?: (walk: object) => boolean }} [input.helpers]
 */
export function buildEvaluationLedger({ manifest, scans, findings, registry, helpers = {} }) {
  const analysed = new Set(
    (manifest.pages ?? [])
      .filter((page) => page.status === 'visited')
      .map((page) => identity(page.url)),
  );
  const analysedScans = scans.filter((scan) => analysed.has(identity(scan.url)));

  const checks = {};
  const alerts = [];
  for (const entry of registry) {
    if (entry.scope !== 'page') continue;
    const row = { completed: 0, inconclusive: 0, failed: 0, notApplicable: 0, missing: 0 };
    for (const scan of analysedScans) {
      const outcome = outcomeOf(scan, entry);
      if (outcome === 'completed') {
        if (inconclusiveOf(scan, entry.id, helpers)) row.inconclusive += 1;
        else row.completed += 1;
      } else if (outcome === 'failed') row.failed += 1;
      else if (outcome === 'not-applicable') row.notApplicable += 1;
      else row.missing += 1;
    }
    const applicable = analysedScans.length - row.notApplicable;
    // A check with no result anywhere is a scope decision (not planned on
    // this audit), not a thin evaluation; only a check that ran somewhere
    // and fell short is reported.
    const ranSomewhere = row.completed + row.inconclusive + row.failed > 0;
    if (ranSomewhere && applicable > 0 && row.completed / applicable < THIN_EVALUATION_SHARE) {
      alerts.push(
        `${entry.id}: evaluated on ${row.completed} of ${applicable} analysed pages` +
          ` (${row.inconclusive} inconclusive, ${row.failed} failed, ${row.missing} without a record)`,
      );
    }
    checks[entry.id] = row;
  }

  const rawByRule = new Map();
  for (const scan of analysedScans) {
    for (const violation of scan.axe?.violations ?? []) {
      rawByRule.set(violation.id, (rawByRule.get(violation.id) ?? 0) + violation.nodes.length);
    }
  }
  const occurrencesByRule = new Map();
  for (const finding of findings) {
    if (finding.source !== 'axe') continue;
    occurrencesByRule.set(
      finding.ruleId,
      (occurrencesByRule.get(finding.ruleId) ?? 0) + (finding.occurrences ?? 0),
    );
  }
  const filteredRules = [];
  for (const [ruleId, rawNodes] of [...rawByRule].sort(([a], [b]) => a.localeCompare(b))) {
    const occurrences = occurrencesByRule.get(ruleId) ?? 0;
    const dropped = rawNodes - occurrences;
    if (dropped <= 0) continue;
    filteredRules.push({ ruleId, rawNodes, occurrences, dropped });
    if (dropped >= MIN_FILTERED_NODES && dropped / rawNodes > HEAVY_FILTER_SHARE) {
      alerts.push(
        `axe ${ruleId}: ${dropped} of ${rawNodes} raw detections on analysed pages became no finding`,
      );
    }
  }
  const rawAxeNodes = [...rawByRule.values()].reduce((sum, count) => sum + count, 0);
  const axeOccurrences = [...occurrencesByRule.values()].reduce((sum, count) => sum + count, 0);

  return {
    analysedPages: analysedScans.length,
    checks,
    filtering: { axe: { rawNodes: rawAxeNodes, occurrences: axeOccurrences, filteredRules } },
    alerts,
  };
}
