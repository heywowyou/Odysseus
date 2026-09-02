# Plan 022 step 4: operator dashboard rename inventory

Produced 2026-09-02 by a plan 022 subagent reading the current tree (i18n
en.ts/fr.ts/types.ts, App.tsx, and every route/component under
packages/interface/src/dashboard). Baseline note: i18n and scan-progress
files are mid-flight from plan 021; wording below is that current state.
This file is the step 5 decision input: the operator marks each proposed
rename approve / reject / reword. Rough counts over the full leaf-string
set: about 374 CLEAR and 128 UNCLEAR keys across both languages.

Comprehension bar (plan 022 binding decision 11): a first-time,
non-technical single operator with no auditing, SEO, or accessibility
background understands every string on sight. Internal pipeline vocabulary
(findings, dedupe, prescan, render diff, structure pass, prospecting
worthiness) is flagged, not silently kept.

# Route map (paths and page components)

| Path | Page component | Nav label (EN / FR) |
| --- | --- | --- |
| /login | routes/login.tsx | none (pre-auth) |
| / | redirect to /audits | - |
| /audits | routes/audits.tsx | Audits / Audits |
| /audits/:auditId | routes/audit-detail.tsx (embeds prepare-report-card.tsx) | - |
| /scans/new | routes/new-scan.tsx | New scan / Nouveau scan |
| /scans/:jobId | routes/scan-progress.tsx | - |
| /prospects | routes/prospects.tsx | Prospects / Prospects |
| /prospects/:candidateId | routes/prospect-detail.tsx | - |
| /prospects/:candidateId/prescan | routes/prescan.tsx | - |
| /prospects/:candidateId/score | routes/score.tsx | - |
| /prospects/:candidateId/evidence | routes/evidence.tsx | - |
| /prospects/:candidateId/preview | routes/preview.tsx | - |
| /vendors | routes/vendors.tsx | none (orphan page, reachable only by URL) |
| /outreach | routes/outreach-index.tsx | Outreach / Démarches |
| /outreach/drafts | routes/drafts.tsx | - |
| /outreach/replies | routes/replies.tsx | - |
| /outreach/suppressions | routes/suppressions.tsx | - |
| /outreach/outcomes | routes/outcomes.tsx | - |
| * | redirect to /audits | - |

There is no insights route (insights-model.ts is shared model code for
prescan/score/evidence/preview/vendors) and no top-level drafts route.
prepare-report-card.tsx is embedded in audit-detail.tsx:598.

# Navigation and shell

| Location | Current EN | Current FR | Verdict | Proposed EN | Proposed FR | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| nav.audits | Audits | Audits | CLEAR | - | - | plain |
| nav.newScan | New scan | Nouveau scan | CLEAR | - | - | common usage, but see FR scan/analyse split below |
| nav.prospects | Prospects | Prospects | CLEAR | - | - | standard sales word the operator lives in |
| nav.outreach | Outreach | Démarches | CLEAR | - | - | plain both languages |
| shell.tagline | Operator console | Console opérateur | UNCLEAR | Operator dashboard | Tableau de bord opérateur | "console" is developer vocabulary |
| shell.navigation / openMenu / closeMenu / language | Navigation / Open menu / Close menu / Interface language | same in FR | CLEAR | - | - | plain |

# Shared strings (common)

| Location | Current EN | Current FR | Verdict | Proposed EN | Proposed FR | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| common.severityLabels | Critical, Serious, Moderate, Minor | Critique, Sérieux, Modéré, Mineur | CLEAR | - | - | plain scale |
| common.statusLabels | Queued, Running, Complete, Failed, Cancelled | En attente, En cours, Terminé, Échoué, Arrêté | CLEAR | - | - | plain |
| common.typeLabels.fullAudit | Full audit | Audit complet | CLEAR | - | - | plain |
| common.typeLabels.prospecting | Prospecting | Prospection | UNCLEAR | Shortlist hotels | Présélection d'hôtels | names the pipeline stage, not what the operator gets: a qualified shortlist |
| downloadReport, viewDetails, error, loading, retry, cancel | Download report, View details, Error, Loading…, Retry, Cancel | Télécharger le rapport, Voir le détail, Erreur, Chargement…, Réessayer, Annuler | CLEAR | - | - | plain |
| common.comingSoon | This view arrives with the next slice. | Cette vue arrive avec la prochaine tranche. | UNCLEAR | This page is coming soon. | Cette page arrive bientôt. | milestone jargon ("slice"/"tranche") leaked to UI; key may now be dead but fix the copy if kept |
| common.relativeTime | just now, {n} min ago, {n} h ago, {n} d ago | à l'instant, il y a {n} min, il y a {n} h, il y a {n} j | CLEAR | - | - | plain |
| common.unknownSite | Unknown site | Site inconnu | CLEAR | - | - | plain |

# Audits list (/audits)

| Location | Current EN | Current FR | Verdict | Proposed EN | Proposed FR | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| audits.title, description | Audits / Scan history and access to reports. | Audits / Historique des scans et accès aux rapports. | CLEAR | - | - | plain |
| audits.emptyState | No scans yet. | Aucune analyse pour le moment. | UNCLEAR | No scans yet. | Aucun scan pour le moment. | FR says "analyse" where everything around it says "scan"; pick one word family |
| audits.emptyStateCta | Run a first scan | Lancer un premier scan | CLEAR | - | - | plain verb |
| audits columns/filters/sort | Date, Site, Type, Status, Severity, Search a site…, All statuses, Newest first, Oldest first, Sort, Updated at {time}, No audits match these filters. | same in FR | CLEAR | - | - | plain |
| audits.kpiRunning, kpiComplete, kpiFailed | Running / Complete / Failed | En cours / Terminés / Échecs | CLEAR | - | - | plain |
| audits.kpiCritical | Critical findings | Constats critiques | UNCLEAR | Critical problems | Problèmes critiques | "findings" is flagged vocabulary; "problems" is what the operator hears |
| stop/delete/confirm family | Stop, Delete, Stop this scan?, The scan will be marked as stopped…, Delete this scan?, This permanently deletes…, etc. | same in FR | CLEAR | - | - | plain, consequences stated |
| audits.clearQueue | Clear queue | Vider la file | UNCLEAR | Clear queue | Vider la file d'attente | EN plain; FR "la file" alone is clipped, "file d'attente" is the everyday word |

# New scan (/scans/new)

| Location | Current EN | Current FR | Verdict | Proposed EN | Proposed FR | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| newScan.title | New scan | Nouveau scan | CLEAR | - | - | plain |
| newScan.description | Start a full audit or a prospection on a site. | Lancer un audit complet ou une prospection sur un site. | UNCLEAR | Run a full audit of one site, or a quick check that shortlists hotels for outreach. | Lancer un audit complet d'un site, ou un contrôle rapide pour présélectionner des hôtels. | the two choices are not explained at the decision point |
| newScan.typeLabel, typeFullAudit | Scan type / Full audit | Type d'analyse / Audit complet | CLEAR | - | - | plain |
| newScan.typeProspecting | Prospecting | Prospection | UNCLEAR | Shortlist hotels | Présélection d'hôtels | same as typeLabels.prospecting |
| urlLabel/placeholders | Site URL, https://example.co.uk, Site URLs (one per line) | Adresse du site, https://exemple.fr, … | CLEAR | - | - | plain |
| newScan.urlInvalidError | This address must be an absolute http(s) URL without embedded credentials | Cette adresse doit être une URL http(s) absolue, sans identifiants incorporés | UNCLEAR | Enter a full web address starting with https://, with no username or password in it. | Saisissez une adresse complète commençant par https://, sans nom d'utilisateur ni mot de passe. | "absolute URL", "embedded credentials" are developer terms |
| sirenLabel/hint | SIREN (optional), 123 456 789, Fill this in if you already know… | SIREN (facultatif), … | CLEAR | - | - | SIREN/INSEE are everyday French business words |
| newScan.sirenInvalidError | This SIREN fails the INSEE check-digit control | Ce SIREN ne passe pas la clé de contrôle INSEE | UNCLEAR | This SIREN number is not valid (it fails the official INSEE check). | Ce SIREN n'est pas valide (il échoue au contrôle officiel de l'INSEE). | "check-digit control" is technical; keep INSEE, drop the math |
| newScan.transactionalFlowLabel | Does this site take bookings or sell online for its own account? | Ce site propose-t-il une réservation ou un achat en ligne pour son propre compte ? | UNCLEAR | Does this site take bookings or sell online directly (not through a booking platform)? | Ce site prend-il les réservations ou vend-il en ligne en direct (pas via une plateforme) ? | "for its own account" is accounting phrasing; the real question is direct vs platform |
| transactionalFlow options, advanced options family | Let the tool detect, Yes, No, Reason (optional), Advanced options, Maximum pages, …, Known booking engine URL (optional) | same in FR | CLEAR | - | - | plain |
| newScan.maxDepthLabel | Maximum link depth | Profondeur maximale des liens | UNCLEAR | How many clicks from the home page to follow | Nombre de clics depuis la page d'accueil à suivre | "link depth" is crawler jargon |
| newScan.delayLabel | Delay between requests (ms) | Délai entre les requêtes (ms) | UNCLEAR | Pause between page loads (ms) | Pause entre deux pages chargées (ms) | "requests" is HTTP vocabulary |
| newScan.seedsLabel | Extra seed URLs to include (one per line) | URL supplémentaires à inclure (une par ligne) | UNCLEAR | Extra starting pages to include (one per line) | Pages de départ supplémentaires à inclure (une par ligne) | "seed" is crawler jargon |
| newScan.exclusionsLabel | Exclusion patterns (one glob per line) | Motifs d'exclusion (un glob par ligne) | UNCLEAR | Addresses to skip (use * as a wildcard, one per line) | Adresses à ignorer (utilisez * comme joker, une par ligne) | "glob" is developer slang |
| newScan.submitButton | Start scan | Lancer l'analyse | UNCLEAR | Start scan | Lancer le scan | FR button says "analyse" where the page says "scan"; unify |

# Scan progress (/scans/:jobId)

| Location | Current EN | Current FR | Verdict | Proposed EN | Proposed FR | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| progress.title | Scan progress | Suivi du scan | CLEAR | - | - | plain |
| progress.description | Crawl and analysis phases, per-URL results. | Phases de crawl et d'analyse, résultats par URL. | UNCLEAR | The site visit in stages, page by page. | Les étapes de la visite du site, page par page. | "crawl" is jargon in both languages |
| progress.crawlPhaseLabel / phaseLabels.crawl | Crawling the site | Exploration du site | UNCLEAR | Reading the site's pages | Exploration du site | EN "crawling" is spider jargon; FR side is already plain |
| scanPhase/contentScan/lighthouse labels + progress messages | Analysing pages / Content and accessibility checks / Performance measurement / Content pages checked: {n}/{n}. / {n} pages scheduled for content checks… | same in FR | CLEAR | - | - | plain; Lighthouse is not named, good |
| progress.lighthouseProgressMessage | …Performance representatives measured: {n}/{n}. | …Représentantes mesurées pour les performances : {n}/{n}. | UNCLEAR | …Sample pages measured for performance: {n}/{n}. | …Pages échantillons mesurées pour les performances : {n}/{n}. | "representatives" is statistics shorthand |
| phaseLabels.select-performance | Selecting performance representatives | Sélection des pages représentatives pour les performances | UNCLEAR | Choosing the sample pages for performance | Choix des pages échantillons pour les performances | same reason |
| phaseLabels (normalize, analyze-fr/en, report-fr/en, queued, scan, content-scan, lighthouse, scanning, complete, failed) | Processing results, Writing the report (French/English), Generating the PDF (French/English), Queued, Analysing pages, Checking content and accessibility, Measuring performance, Analysing sites, Complete, Failed | same in FR | CLEAR | - | - | plain, self-explaining stage names |
| etaLabel, etaRoughSuffix | Estimated time remaining, (rough estimate) | Temps restant estimé, (estimation approximative) | CLEAR | - | - | plain |
| progress.completeHeading | Scan complete | Analyse terminée | UNCLEAR | Scan complete | Scan terminé | FR switches to "analyse" mid-flow |
| viewDetailLink, failedHeading EN, urlResultsHeading, notFound, stop family, cancelledNote | View the full report, The scan failed, Per-site results, Scan not found., Stop the scan, …, Scan stopped, This scan was stopped at the operator's request. | same in FR | CLEAR | - | - | plain |
| progress.failedHeading | The scan failed | L'analyse a échoué | UNCLEAR | The scan failed | Le scan a échoué | same FR consistency issue |

# Audit detail (/audits/:auditId)

| Location | Current EN | Current FR | Verdict | Proposed EN | Proposed FR | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| auditDetail.title, siteLabel, dateLabel, pagesVisitedLabel | Audit detail, Site, Date, Pages visited | Détail de l'audit, Site, Date, Pages visitées | CLEAR | - | - | plain |
| auditDetail.description | Findings, enrichment, and reports. | Constats, enrichissement et rapports. | UNCLEAR | Problems found, hotel details, and reports. | Problèmes constatés, informations de l'hôtel et rapports. | bare "findings" is flagged; "enrichment" is pipeline jargon |
| auditDetail.findingsHeading | Findings | Constats | UNCLEAR | Problems found | Constats (keep) or Problèmes constatés | flagged list; EN rename, FR "constats" is already plain |
| severityColumn, pagesColumn, reportsHeading, noReportsYet, reportPageCountWarning | Severity, Affected pages, Reports, No report generated yet., Long report: {n} pages… | Gravité, Pages concernées, Rapports, … | CLEAR | - | - | plain |
| auditDetail.titleColumn | Finding | Constat | UNCLEAR | Problem | Problème | singular of the flagged "findings" |
| auditDetail.occurrencesColumn | Occurrences | Occurrences | UNCLEAR | Times found | Fois détecté | formal-statistical; the column counts how many pages show the problem |
| auditDetail.categoryColumn | Category | Catégorie | CLEAR (header) | - | - | header plain, but cell values are raw English codes, see hardcoded list |
| reportFreshness.fresh, unverified | Fresh, Unverified | À jour, Non vérifié | CLEAR | - | - | plain |
| reportFreshness.stale | Stale | Obsolète | UNCLEAR | Out of date | À régénérer | "stale" is software jargon; tell the operator what to do |
| auditDetail.lifecycleLabel | Life cycle | Cycle de vie | UNCLEAR | Stage | Étape | lifecycle vocabulary is internal narration |
| lifecycle.scanned | Scanned | Scanné | UNCLEAR | Scanned | Exploré | FR "scanné" is an anglicism |
| lifecycle.analysed, approved | Analysed, Approved | Analysé, Approuvé | CLEAR | - | - | plain |
| lifecycle.rendered | Rendered | Rendu | UNCLEAR | Report ready | Rapport prêt | print-pipeline jargon; the operator wants to know the PDF exists |
| approveReportsButton, confirmApproveTitle | Approve bilingual pair / Approve bilingual pair? | Approuver la paire bilingue / … ? | UNCLEAR | Approve both reports / Approve both reports? | Approuver les deux rapports / … ? | "bilingual pair" is internal speak on the highest-stakes button in the app |
| confirmApproveBody | Approval authorises delivery of both PDF reports (French and English) to the client… | L'approbation autorise la livraison des deux rapports PDF… | CLEAR (body) | - | - | body is plain |
| approvingReportsMessage, previewReport, approvedDownload, actionError, manualFieldsHint, saveButton, savedMessage, regenerateButton, regeneratingMessage, regeneratedMessage, notFound, languageLabels, findingsFilterAll | Approval in progress…, Preview, Download the approved version, The action failed…, Optional fields…, Save, Saved., Regenerate the report, …, Audit not found., Français/English, All severities | same in FR | CLEAR | - | - | plain |
| reportsApprovedMessage | French and English pair approved. | Paire française et anglaise approuvée. | UNCLEAR | Both reports (French and English) approved. | Les deux rapports (français et anglais) sont approuvés. | "pair" again |
| auditDetail.manualFieldsHeading | Enrichment | Enrichissement | UNCLEAR | Hotel details | Informations sur l'hôtel | pipeline noun; the section is where the operator types client facts |
| manual fields family (SIREN check, legal name, trading name, sector, revenue band, …) | plain business vocabulary | same in FR | CLEAR | - | - | plain French business words |
| auditDetail.sirenInvalidError | This SIREN fails the INSEE check-digit control | Ce SIREN ne passe pas la clé de contrôle INSEE | UNCLEAR | This SIREN number is not valid (it fails the official INSEE check). | Ce SIREN n'est pas valide (il échoue au contrôle officiel de l'INSEE). | duplicate of the newScan string |
| declarationContactEmailLabel | Contact email for the declaration | Email de contact pour la déclaration | UNCLEAR | Contact email for the accessibility declaration | Email de contact pour la déclaration d'accessibilité | "the declaration" names no document |
| findingsEmpty | No findings for this audit. | Aucun constat pour cet audit. | UNCLEAR | No problems found for this audit. | Aucun problème constaté pour cet audit. | must follow the findings rename |

# Prepare report card (inside audit detail)

| Location | Current EN | Current FR | Verdict | Proposed EN | Proposed FR | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| prepareReport.title | Prepare report | Préparer le rapport | CLEAR | - | - | plain |
| prepareReport.description | Typed context for a personalized report: the saved choices drive the cover question, the opening, and the verified journeys. Nothing free-form reaches the model. | Contexte typé pour un rapport personnalisé : vos choix pilotent la question de couverture, l'ouverture et les parcours vérifiés. Rien de libre n'atteint le modèle. | UNCLEAR | Answer a few fixed questions to personalize the report: they drive the cover question, the opening, and the verified journeys. Free text is never sent to the writing tool. | Répondez à quelques questions fixes pour personnaliser le rapport : elles pilotent la question de couverture, l'ouverture et les parcours vérifiés. Rien de libre n'est envoyé à l'outil de rédaction. | "typed context" and "the model" are pipeline/LLM vocabulary |
| situationLabel + options (6 values) | Situation, No work started, Redesign planned or underway, Corrections underway, Existing accessibility programme, Periodic review, Unknown | same in FR | CLEAR | - | - | plain |
| prepareReport.triggerLabel | Trigger | Déclencheur | UNCLEAR | What prompted this audit | Motif de l'audit | "trigger" is event-system vocabulary |
| triggerOtherNotesLabel | Precisions (other trigger) | Précisions (autre déclencheur) | CLEAR after trigger rename | - | - | follows the label |
| customQuestionLabel | Custom cover question | Question de couverture personnalisée | UNCLEAR | Question shown on the report cover | Question affichée en couverture du rapport | "cover question" is internal shorthand |
| frenchFieldLabel, englishFieldLabel, automaticOption | French, English, (not set) | Français, Anglais, (non renseigné) | CLEAR | - | - | plain |
| turnover block (heading, description, detected, replacement, exact/range, bounds, year, source family) | Annual turnover, Keep the detected official value…, Official annual accounts, Client-stated, … | same in FR | CLEAR | - | - | plain accounting words throughout |
| turnoverEffectiveLabel | Effective calculation basis | Base de calcul effective | UNCLEAR (mild) | Value the report uses | Valeur utilisée dans le rapport | audit-form wording; say what it affects |
| turnoverMissing | No turnover is available. The financial opportunity remains omitted. | Aucun chiffre d'affaires n'est disponible. L'opportunité financière reste omise. | UNCLEAR (mild) | No turnover is available, so the report leaves the revenue section out. | Aucun chiffre d'affaires n'est disponible : la section chiffre d'affaires reste absente du rapport. | "financial opportunity" is sales-deck language |
| turnoverReplacementMissing | Complete the replacement amount, year, and source. The financial opportunity remains omitted. | Complétez le montant, l'exercice et la source… | UNCLEAR (mild) | same fix: "…so the report leaves the revenue section out." | same fix | same reason |
| stakeholdersHeading | Stakeholder names (optional) | Noms des parties prenantes (optionnel) | CLEAR | - | - | plain |
| journeysHeading | Journeys | Parcours | UNCLEAR (mild) | Customer journeys | Parcours client | one added word makes the object plain |
| journeys family (confirm/remove/warnings/preview/save) | Confirm, Remove, Confirmed, Removed, Missing context, Confirm and continue, Live preview, automatic, your text, generic fallback, Save choices, Preparation saved. | same in FR | CLEAR | - | - | plain |
| exclusionNoVisitedPages | No page was visited, so nothing can be walked through. | Aucune page n'a été visitée : aucun parcours ne peut être vérifié. | UNCLEAR (mild) | No pages were visited, so no journey can be verified. | (keep FR) | EN "walked through" is odd phrasing |
| exclusionEvidenceUnavailable | Scan artifacts are unavailable, so no journey can be verified. | Les artefacts du scan sont indisponibles… | UNCLEAR | The saved scan files are unavailable, so no journey can be verified. | Les fichiers enregistrés du scan sont indisponibles… | "artifacts" is build-system vocabulary |
| selectedWritingLabel | Current writing | Rédaction en cours | UNCLEAR (mild) | Current version | Version actuelle | "writing" as a countable noun is odd EN |
| candidateReadyLabel | New writing ready for review | Nouvelle rédaction prête à être relue | UNCLEAR (mild) | New version ready for review | Nouvelle version prête à être relue | "candidate" concept leaks through |
| candidateFailedLabel | New writing failed | Échec de la nouvelle rédaction | UNCLEAR (mild) | New version failed | Échec de la nouvelle version | same |
| candidateSelectedLabel | New writing approved | Nouvelle rédaction approuvée | UNCLEAR (mild) | New version approved | Nouvelle version approuvée | same |
| approveCandidateButton | Approve this writing | Approuver cette rédaction | UNCLEAR (mild) | Approve this version | Approuver cette version | same |
| regenerateButton | Regenerate writing | Régénérer la rédaction | UNCLEAR (mild) | Rewrite the report | Réécrire le rapport | verb-first and plainer |
| confirmRegenerateTitle | Regenerate the report writing? | Régénérer la rédaction du rapport ? | CLEAR | - | - | plain once the family above aligns |
| confirmRegenerateBody | This makes two new model calls (French and English), reusing the existing analysis structure. The current report stays in place until you explicitly approve the new writing. | Cela lance deux nouveaux appels au modèle (français et anglais)… | UNCLEAR | This rewrites the French and English reports. The current report stays in place until you approve the new one. | Cela réécrit les rapports français et anglais. Le rapport actuel reste en place tant que vous n'avez pas approuvé le nouveau. | "model calls", "analysis structure" are LLM-pipeline vocabulary |
| approvedMessage | Candidate approved: the next reports use the new writing. | Version approuvée : les prochains rapports utilisent la nouvelle rédaction. | UNCLEAR (mild) | New version approved: future reports use it. | (keep FR, already plain) | EN "candidate" is pipeline vocabulary |
| triggerOptions (8 values) | Legal question, Customer complaint, Search visibility, Redesign, Procurement, Commercial discussion, Proactive review, Other | same in FR | CLEAR | - | - | plain |
| triggerOptions.booking-or-conversion | Booking or conversion | Réservation ou conversion | UNCLEAR (mild) | Booking or online sales | Réservation ou vente en ligne | "conversion" is marketing-analytics jargon |
| journeyLabels (2) | Discovery and navigation, Booking and transaction | Découverte et navigation, Réservation et transaction | CLEAR | - | - | plain |

# Shared operator strings (prospects pages)

| Location | Current EN | Current FR | Verdict | Proposed EN | Proposed FR | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| operator.pagination family | Previous, Next, Page {p} of {n} | Précédent, Suivant, Page {p} sur {n} | CLEAR | - | - | plain |
| operator.accept/reject family | Accept, Reject, Accepted, Rejected | Accepter, Rejeter, Accepté, Rejeté | CLEAR | - | - | plain |
| operator.confirm family | Accept this prospect?, Reject this prospect?, The prospect leaves the campaign…, The action failed. Try again., Not found., Back to prospects | same in FR | CLEAR | - | - | plain |
| operator.confirmAcceptBody | The prospect becomes eligible for the outreach campaign. This decision is recorded with your provenance. | Le prospect devient éligible à la campagne de démarchage. Cette décision est enregistrée avec sa provenance. | UNCLEAR | The prospect becomes eligible for the outreach campaign. The decision is recorded with where the information came from. | Le prospect devient éligible à la campagne de démarchage. La décision est enregistrée avec l'origine des informations. | "provenance" is data-lineage jargon |
| operator.provenanceLabel | Provenance | Provenance | UNCLEAR | Data source | Origine des données | same |

# Prospects list (/prospects)

| Location | Current EN | Current FR | Verdict | Proposed EN | Proposed FR | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| prospects.title | Prospects | Prospects | CLEAR | - | - | plain |
| prospects.description | Review the hotel funnel from catalogue to outreach. | Revue du tunnel hôtel, du catalogue jusqu'aux démarches. | UNCLEAR | Review the hotel list, from first contact data to outreach. | Revue de la liste d'hôtels, des données de contact jusqu'aux démarches. | "funnel"/"tunnel" is sales-deck jargon; "catalogue" is an internal source name |
| prospects.queueLabel | Queue | File | UNCLEAR (mild) | Lists | Listes | here "queue" means tab group, not the scan queue; collides with the audits meaning |
| queues.all/rejected/alreadyEngaged/groups | All prospects, Rejected, Already engaged, Groups | Tous les prospects, Rejetés, Déjà démarchés, Groupes | CLEAR | - | - | plain |
| queues.joinReview | Join review | Rapprochement à valider | UNCLEAR | Matches to review | Rapprochement à valider (keep) | EN "join" is database vocabulary; FR side is already plain and good |
| queues.parked | Parked | Parqués | UNCLEAR (mild) | On hold | Mis de côté | internal state slang |
| filters.identityStatus/groupStatus/qualification | Identity status, Group status, Qualification, All | Statut d'identité, Statut de groupe, Qualification, Tous | CLEAR | - | - | plain; InfoTips explain identity and qualification |
| filters.reviewState, columns.review | Review state / Review | État de revue / Revue | UNCLEAR (mild) | Verification status / Verification | État de vérification / Vérification | FR "revue" reads as "magazine" |
| columns family | Hotel, City, Identity, Group, Qualification, Score, Contact, Outreach, Outcome, Open details, No prospects match these filters. | same in FR | CLEAR | - | - | plain |

# Prospect detail (/prospects/:candidateId)

| Location | Current EN | Current FR | Verdict | Proposed EN | Proposed FR | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| fallbackTitle, description, launchAudit, openSite | Prospect, Source-to-outcome review for this prospect., Run an audit, Open the site in a new tab | Prospect, Revue de la source jusqu'au résultat… | CLEAR | - | - | plain |
| sections.catalogue | Catalogue | Catalogue | UNCLEAR (mild) | Source directory | Annuaire source | internal source dataset name |
| sections.identity/qualification/score/evidence/contact/preview/thread/outcome | Identity and sources, Qualification, Score, Evidence, Contact, Preview, Outreach thread, Outcome | Identité et sources, … | CLEAR | - | - | plain; InfoTips sit next to these |
| sections.prescan | Prescan | Pré-scan | UNCLEAR | Quick check | Contrôle rapide | flagged jargon; hints.prescan tooltip already explains it |
| openPrescan | Open prescan | Ouvrir le pré-scan | UNCLEAR | Open quick check | Ouvrir le contrôle rapide | follows sections.prescan |
| openScore/openEvidence/openPreview | Open score / evidence / preview | Ouvrir le score / les preuves / l'aperçu | CLEAR | - | - | plain |
| sourcesHeading | Source records | Enregistrements sources | UNCLEAR (mild) | Sources | Sources | "records" is database vocabulary |
| sources.field/value/source/status/chosen | Field, Value, Source, Status, Chosen value | Champ, Valeur, Source, Statut, Valeur retenue | CLEAR | - | - | plain |
| qualificationHeading/reason/events | Qualification, Reason, Qualification events | Qualification, Motif, Événements de qualification | CLEAR | - | - | plain |
| qualification.outcome | Outcome | Résultat | UNCLEAR (mild) | Decision | Décision | collides with the campaign Outcome section below; it is the qualification decision |
| threadHeading family | Outreach thread, State, Last event, Outcome, No outcome set. | Fil de démarche, État, Dernier événement, Résultat, Aucun résultat défini. | CLEAR | - | - | plain |
| thread.touch | Touch | Touche | UNCLEAR | Email step | Relance | sales slang EN; FR "touche" reads as a piano key |
| catalogue.name/city/department/groupId | Name, City, Department, Group | Nom, Ville, Département, Groupe | CLEAR | - | - | plain |
| catalogue.ownDomain | Own domain | Domaine propre | UNCLEAR (mild) | Own web address | Adresse web propre | "domain" is DNS vocabulary |

# Prescan page (/prospects/:id/prescan)

| Location | Current EN | Current FR | Verdict | Proposed EN | Proposed FR | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| prescan.title | Prescan | Pré-scan | UNCLEAR | Quick check | Contrôle rapide | flagged jargon; keep hints.prescan as the inline explanation |
| prescan.description | Three-page prescan of the hotel website. | Pré-scan de trois pages du site de l'hôtel. | UNCLEAR | Quick three-page check of the hotel website. | Contrôle rapide de trois pages du site de l'hôtel. | follows the rename |
| statusLabel, pagesHeading, url/status columns | Status, Pages, URL, Status | Statut, Pages, URL, Statut | CLEAR | - | - | plain |
| prescan.scannedAtLabel | Scanned at | Scanné le | UNCLEAR (mild) | Checked at | Vérifié le | FR "scanné" anglicism |
| prescan.vendorLabel | Server fingerprint | Empreinte serveur | UNCLEAR | Detected booking system | Système de réservation détecté | "fingerprint" is security jargon |
| columns.role | Role | Rôle | UNCLEAR | Page type | Type de page | internal page classification |
| prescan.empty | No prescan has been recorded for this candidate. | Aucun pré-scan enregistré pour ce candidat. | UNCLEAR | No quick check has been recorded for this prospect. | Aucun contrôle rapide enregistré pour ce prospect. | "prescan" jargon plus "candidate" for prospect |

# Score page (/prospects/:id/score)

| Location | Current EN | Current FR | Verdict | Proposed EN | Proposed FR | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| score.title/total/version/computed/breakdown family | Score, Total, Version, Computed at, Breakdown, Value, Weight, Why, From version, To version | Score, Total, Version, Calculé le, Décomposition, … | CLEAR | - | - | plain; "Why" is friendly |
| score.description | Versioned score with the complete breakdown. | Score versionné avec sa décomposition complète. | UNCLEAR (mild) | The score with its full breakdown; each recalculation is kept as a new version. | Le score et sa décomposition complète ; chaque recalcul est conservé comme une nouvelle version. | "versioned" is software vocabulary |
| breakdownColumns.component | Component | Composante | UNCLEAR (mild) | Criterion | Critère | cells render raw component IDs, see hardcoded list |
| score.diffHeading | Version diff | Différence entre versions | UNCLEAR | Changes between versions | Différence entre versions (keep) | flagged "diff" family in EN; FR is already plain |
| score.empty | No score has been recorded for this candidate. | Aucun score enregistré pour ce candidat. | UNCLEAR | No score has been recorded for this prospect. | Aucun score enregistré pour ce prospect. | "candidate" for prospect |

# Evidence page (/prospects/:id/evidence)

| Location | Current EN | Current FR | Verdict | Proposed EN | Proposed FR | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| evidence.title, assetNames | Evidence, Homepage proof, Contact page proof | Preuves, Preuve page d'accueil, Preuve page contact | CLEAR | - | - | plain |
| evidence.description | The two outreach evidence assets. | Les deux preuves destinées au démarchage. | UNCLEAR (mild) | The two proof screenshots for the outreach. | Les deux captures d'écran preuves destinées à la démarche. | "assets" is content-pipeline jargon |
| columns.capturedAt/sourceUrl/status | Captured at, Source URL, Status | Capturée le, URL source, Statut | CLEAR | - | - | plain |
| columns.asset | Asset | Preuve | UNCLEAR (mild) | Proof | Preuve | EN header is jargon; FR is already the right word |
| evidence.empty | No evidence has been captured for this candidate. | Aucune preuve capturée pour ce candidat. | UNCLEAR | No evidence has been captured for this prospect. | Aucune preuve capturée pour ce prospect. | "candidate" |

# Preview page (/prospects/:id/preview)

| Location | Current EN | Current FR | Verdict | Proposed EN | Proposed FR | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| preview.title/status/published/expires/states/openPublic | Preview, Status, Published at, Expires at, Live, Expired, Open public preview | Aperçu, Statut, Publié le, Expire le, En ligne, Expiré, Ouvrir l'aperçu public | CLEAR | - | - | plain |
| preview.description | The published outreach preview for this candidate. | L'aperçu de démarche publié pour ce candidat. | UNCLEAR | The published outreach preview for this prospect. | L'aperçu de démarche publié pour ce prospect. | "candidate" |
| states.revoked | Revoked | Révoqué | UNCLEAR (mild) | Taken down | Retiré | certificate jargon |
| preview.rendererNote | Rendered with the same safe renderer the public site uses. | Rendu avec le même moteur sûr que celui du site public. | UNCLEAR | Shown exactly as the public page will appear. | Affiché exactement comme la page publique apparaîtra. | "renderer" is component vocabulary the operator cannot act on |
| preview.empty | No preview has been published for this candidate. | Aucun aperçu publié pour ce candidat. | UNCLEAR | No preview has been published for this prospect. | Aucun aperçu publié pour ce prospect. | "candidate" |

# Vendors page (/vendors, not in navigation)

| Location | Current EN | Current FR | Verdict | Proposed EN | Proposed FR | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| vendors.title | Vendor fingerprints | Empreintes de serveurs | UNCLEAR | Booking systems seen | Systèmes de réservation observés | double jargon; FR suggests hardware |
| vendors.description | Recurring prescan vendor and failure aggregates. | Agrégats récurrents des serveurs et des échecs de pré-scan. | UNCLEAR | Booking systems that come back often in quick checks, and how often checks fail. | Systèmes de réservation qui reviennent souvent aux contrôles rapides, et fréquence des échecs. | "aggregates", "vendor", "prescan" stacked |
| columns.vendor | Vendor | Serveur | UNCLEAR | Booking system | Système de réservation | EN ambiguous, FR wrong |
| columns.candidates | Candidates | Candidats | UNCLEAR (mild) | Prospects | Prospects | the app calls these prospects everywhere else |
| columns.failures/failureRate | Failures, Failure rate | Échecs, Taux d'échec | CLEAR | - | - | plain |
| vendors.empty | No prescan vendor data yet. | Aucune donnée de serveur pour l'instant. | UNCLEAR | No quick-check data yet. | Aucune donnée de contrôle rapide pour l'instant. | jargon stack |

# Outreach index (/outreach)

| Location | Current EN | Current FR | Verdict | Proposed EN | Proposed FR | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| outreachIndex.title | Outreach | Démarches | CLEAR | - | - | plain |
| outreachIndex.description | Drafts, replies, suppressions, and outcomes under operator review. | Brouillons, réponses, suppressions et résultats en revue opérateur. | UNCLEAR (mild) | Drafts, replies, do-not-contact checks, and outcomes under operator review. | Brouillons, réponses, liste à ne pas contacter et résultats en revue opérateur. | "suppressions" carried into the sentence |
| draftsTitle/description, repliesTitle/description, outcomesTitle/description | Drafts, Gmail drafts waiting for review. Reviewing never sends. / Replies, Replies needing review. Classification stays human. / Outcomes, Operator-set outcomes and campaign aggregates. | same in FR | CLEAR | - | - | plain; two descriptions are model compliance copy |
| suppressionsTitle/description | Suppressions / Check one address against the suppression list. | Suppressions / Vérifier une adresse contre la liste de suppression. | UNCLEAR | Do-not-contact list / Check one address against the do-not-contact list. | Liste à ne pas contacter / Vérifier une adresse dans la liste à ne pas contacter. | compliance jargon; "supprimer" in FR suggests deletion, which this page does not do |

# Drafts (/outreach/drafts)

| Location | Current EN | Current FR | Verdict | Proposed EN | Proposed FR | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| drafts.title/description/columns/approve/skip/neverSendNote/empty | Drafts, Gmail drafts waiting for operator review., Hotel, Created, Mark reviewed, Skip, Odysseus cannot send drafts…, No drafts are waiting for review. | same in FR | CLEAR | - | - | plain |
| drafts.columns.touch | Touch | Touche | UNCLEAR | Email step | Relance | same as thread.touch |
| drafts.columns.providerState | Provider state | État fournisseur | UNCLEAR | Gmail status | Statut Gmail | "provider" hides that it is Gmail's own draft state |
| drafts.columns.reviewState | Review state | État de revue | UNCLEAR (mild) | Verification status | État de vérification | FR "revue" (see prospects) |

# Replies (/outreach/replies)

| Location | Current EN | Current FR | Verdict | Proposed EN | Proposed FR | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| replies family (title, description, columns, markReviewed, metadataNote, empty) | Replies, Replies that need operator review., Hotel, Received, State, Reason, Mark reviewed, Only thread metadata is shown. Message content is never stored., No replies are waiting for review. | same in FR | CLEAR | - | - | plain throughout; metadataNote is model compliance copy |

# Suppressions (/outreach/suppressions)

| Location | Current EN | Current FR | Verdict | Proposed EN | Proposed FR | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| suppressions.title | Suppressions | Suppressions | UNCLEAR | Do-not-contact list | Liste à ne pas contacter | compliance jargon; FR reads as deletion |
| suppressions.description | Check one address against the suppression list. | Vérifier une adresse contre la liste de suppression. | UNCLEAR | Check one address against the do-not-contact list. | Vérifier une adresse dans la liste à ne pas contacter. | same |
| addressLabel/placeholder/check/clear | Email address, name@example.com, Check, Clear | Adresse e-mail, nom@exemple.com, Vérifier, Effacer | CLEAR | - | - | plain |
| resultSuppressed | This address is suppressed. | Cette adresse est supprimée. | UNCLEAR | This address is on the do-not-contact list. | Cette adresse est sur la liste à ne pas contacter. | "suppressed" reads as deleted; the address was not deleted |
| resultNotSuppressed | This address is not suppressed. | Cette adresse n'est pas supprimée. | UNCLEAR | This address is not on the do-not-contact list. | Cette adresse n'est pas sur la liste à ne pas contacter. | same |
| hashNote | The address is hashed in memory for the check. Suppression entries are one-way hashes and are never listed. | L'adresse est hachée en mémoire pour la vérification. Les entrées de suppression sont des hachés à sens unique et ne sont jamais listées. | UNCLEAR | The address is checked without being stored. The list only keeps unreadable codes, never the addresses themselves. | L'adresse est vérifiée sans être conservée. La liste ne garde que des codes illisibles, jamais les adresses. | crypto terms; keep the guarantee, drop the math |

# Outcomes (/outreach/outcomes)

| Location | Current EN | Current FR | Verdict | Proposed EN | Proposed FR | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| outcomes family | Outcomes, Operator-set outcomes and their campaign aggregates., Summary, Hotel, Outcome, Set at, Opt out, No outcomes recorded yet. | Résultats, … | CLEAR | - | - | plain; the operator sets these outcomes themselves |

# Login (/login)

| Location | Current EN | Current FR | Verdict | Proposed EN | Proposed FR | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| login (all 12 keys) | Sign in, Password, Sign in, Signing in…, Incorrect password., Too many failed attempts. Try again in {wait}., {n} min, {n} min {n} s, {n} s, This dashboard currently runs without a password., Could not reach the server. Try again. | Connexion, Mot de passe, Se connecter, … | CLEAR | - | - | plain |

# Status labels (labels.)

| Location | Current EN | Current FR | Verdict | Proposed EN | Proposed FR | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| labels.identity.resolved | Resolved | Résolu | UNCLEAR (mild) | Matched | Rapproché | identity-resolution jargon; the hotel matched the directory |
| labels.identity.needs-review, ambiguous | Needs review, Ambiguous | À valider, Ambigu | CLEAR | - | - | plain |
| labels.identity.unmatched | Unmatched | Non rapproché | UNCLEAR (mild) | No match | Sans correspondance | pairs with "Matched" |
| labels.group.independent/group-member/unknown | Independent, Group member, Unknown | Indépendant, Membre de groupe, Inconnu | CLEAR | - | - | plain |
| labels.group.vendor-hosted | Vendor hosted | Hébergé par un prestataire | CLEAR (mild) | - | - | FR is plainer than EN; acceptable |
| labels.review (4 values) | Not required, Pending, Accepted, Rejected | Non requise, En attente, Accepté, Rejeté | CLEAR | - | - | plain |
| labels.qualification.qualified/rejected/already-engaged | Qualified, Rejected, Already engaged | Qualifié, Rejeté, Déjà démarché | CLEAR | - | - | plain; hints.qualification explains the set |
| labels.qualification.parked | Parked | Parqué | UNCLEAR (mild) | On hold | Mis de côté | internal state slang |
| labels.qualification.group-routed | Group routed | Routé au groupe | UNCLEAR | Handled by the group | Géré par le groupe | "routed" is pipeline vocabulary |
| labels.contact.found/rejected | Found, Unusable | Trouvé, Inutilisable | CLEAR | - | - | plain |
| labels.contact.parked | Parked | Parqué | UNCLEAR (mild) | On hold | Mis de côté | same as qualification.parked |
| labels.contact.suppressed | Suppressed | Supprimé | UNCLEAR | On the do-not-contact list | À ne pas contacter | reads as deleted; it means listed |
| labels.thread.open/replied/opted-out/closed | Open, Replied, Opted out, Closed | Ouvert, Réponse reçue, Retiré, Fermé | CLEAR | - | - | plain |
| labels.thread.e1-drafted … e3-sent (6 values) | E1 drafted, E1 sent, E2 drafted, E2 sent, E3 drafted, E3 sent | E1 en brouillon, E1 envoyé, … | UNCLEAR (mild) | Email 1 drafted, Email 1 sent, … | Relance 1 en brouillon, Relance 1 envoyée, … | "E1" is an internal sequence code; spell out, or keep the codes with a one-line legend (keep-and-explain is acceptable) |
| labels.thread.bounced | Bounced | Rebond | UNCLEAR (mild) | Delivery failed | Échec de livraison | FR "rebond" is a literal translation no French mailbox uses |
| labels.thread.sequence-complete | Sequence complete | Séquence terminée | UNCLEAR (mild) | All emails sent | Toutes les relances envoyées | "sequence" is the internal 3-step campaign |
| labels.outcome (9 values), labels.lostReason (6 values) | No reply, Positive reply, Not now, Negative reply, Opt-out, Call, Quoted, Won, Lost; Budget, Timing, Not a priority, Existing provider, Scope mismatch, Other | same in FR | CLEAR | - | - | plain sales vocabulary |

# Hints (InfoTip tooltips, hints.)

All 8 hints (crawl, scan, prescan, score, evidence, preview, qualification,
review), EN and FR: CLEAR. These are the best copy in the dashboard: each
turns a pipeline term into one plain sentence. Any jargon label kept above
(prescan, score, evidence) must keep its InfoTip attached as the inline
explanation.

# User-facing strings hardcoded outside the i18n files

| Location | Current text | Problem | Proposed fix |
| --- | --- | --- | --- |
| routes/score.tsx:105 | description={`brokenness ${total} · ability ${total}`} | raw English pipeline vocabulary in both languages, outside i18n | new i18n keys, e.g. EN "Problems {x} · Ability to fix {y}", FR "Problèmes {x} · Capacité à corriger {y}" |
| routes/audit-detail.tsx:220 | {finding.category} raw | renders raw English category codes (accessibility, seo, geo, performance, rendering, privacy) even in the FR UI | localized label map per category, or keep code plus a legend |
| routes/prescan.tsx:106 | {row.role} raw | renders homepage / booking / content as raw codes | localized label map (Page type: Home / Booking / Content) |
| routes/prescan.tsx:87 | {kind} raw in badges | booking-kind codes rendered raw | localized label map or keep-with-tooltip |
| routes/vendors.tsx:77 | {row.kind} raw badge | renders "vendor" / "failure-rule" literally | localized badge labels ("Booking system" / "Recurring failure") |
| routes/scan-progress.tsx:364, :368 | {row.status} raw in the per-site results badge | renders the raw job status code (complete, error, and any other pipeline value) in both languages; urlResultState only maps it to a colour, never to copy | localized label map keyed on the three states (Complete / Failed / Running), with an unknown-code fallback |
| routes/score.tsx:120 | {component.id} in the Component column | raw score component IDs shown to the operator | localized component labels; the "Why" column already partially explains |
| routes/drafts.tsx:158, routes/replies.tsx:145, routes/outcomes.tsx:146 | aria-label="pagination" | hardcoded English accessible name, not localized | i18n key, e.g. "Pagination" / "Pagination" |
| lib/api.ts fetchJson | `Request to ${url} failed (${status})` plus raw server error strings | surfaced in EmptyState descriptions and toasts in English regardless of UI language | generic localized message with the technical string demoted to a detail line |
| lib/vocabulary.ts | unknown vocabulary values fall back to the raw code (e.g. "e1-drafted") | by-design fallback, but it puts pipeline codes in front of the operator | keep the fallback, add a localized catch-all label |

# Route path inventory (paths themselves)

| Path | Verdict | Note |
| --- | --- | --- |
| /login, /audits, /audits/:auditId, /scans/new, /scans/:jobId, /prospects, /prospects/:candidateId (+ score/evidence/preview), /outreach (+ drafts/replies/outcomes) | CLEAR | plain words or consistent with the kept "scan" family |
| /prospects/:candidateId/prescan | UNCLEAR | path rename - separate decision: "prescan" is internal vocabulary in the URL bar |
| /outreach/suppressions | UNCLEAR | path rename - separate decision: /outreach/do-not-contact would match the proposed label |
| /vendors | UNCLEAR | path rename - separate decision: orphan page whose path names a jargon concept |

# Prioritized summary (highest impact, most often seen)

1. "Suppressions" family (outreach card, page title, description, result
   strings, labels.contact.suppressed, /outreach/suppressions path):
   compliance jargon that reads as "deleted" in French. Becomes
   "Do-not-contact list" / "Liste à ne pas contacter".
2. "Prescan" family (prospect detail section, page title, buttons, empty
   states, /prescan path): flagged jargon. Becomes "Quick check" /
   "Contrôle rapide", with hints.prescan kept as the inline explanation.
3. "Approve bilingual pair" (audit detail, the client-delivery gate):
   becomes "Approve both reports" / "Approuver les deux rapports".
4. Prospects queue wording: "Join review" (EN database jargon, FR already
   correct), "Parked" (EN "On hold" / FR "Mis de côté"), "candidate" in all
   four empty states ("prospect").
5. Vendors page (title, description, columns): "Vendor fingerprints" /
   "Empreintes de serveurs" becomes booking-system wording; the page is
   also orphaned from navigation, worth a separate placement decision.
6. prepareReport.description and confirmRegenerateBody: "typed context",
   "the model", "model calls" are LLM-pipeline leaks on a page the operator
   uses before every delivery.
7. "Touch" / FR "Touche" (drafts column, prospect thread): becomes "Email
   step" / "Relance"; cascades into labels.thread E1 to E3 ("Email 1" /
   "Relance 1", or keep the codes with a legend).
8. "Enrichment" section (audit detail): becomes "Hotel details" /
   "Informations sur l'hôtel"; auditDetail.description renames "findings"
   to "problems found" in EN (FR "constats" is already plain).
9. Operator "Provenance": becomes "Data source" / "Origine des données".
10. FR scan/analyse unification: emptyState, submitButton, completeHeading,
    failedHeading currently mix the two families; pick one and apply
    everywhere. Plus the hardcoded score.tsx "brokenness/ability" line.
