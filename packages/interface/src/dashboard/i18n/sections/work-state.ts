import type {
  CapabilityBlockReason,
  CapabilityConsequence,
  OperatorWorkState,
  ProblemCode,
} from '../../../operator/contract';

/**
 * Plan 061: operator copy for the closed server vocabularies of
 * `operator/contract.ts`. Each table is typed as a Record over the server
 * enum, so a new state, problem or blocking reason without copy in both
 * languages fails the dashboard typecheck rather than rendering a raw code.
 */
export interface WorkStateStrings {
  states: Record<OperatorWorkState, string>;
  problems: Record<ProblemCode, string>;
  blockReasons: Record<CapabilityBlockReason, string>;
  /** Plan 060 §6.1: what an available action does, shown before the
   *  operator commits (plan 060 §16: every capability code has copy). */
  consequences: Record<CapabilityConsequence, string>;
  /** Queue reorder. {name} is the scan's prospect or site. */
  moveUpAria: string;
  moveDownAria: string;
  /** Announced after a move. {name} and {position}. */
  movedAnnouncement: string;
  queueChanged: string;
  /** {position} is the 1-based place in the queue. */
  queuePosition: string;
}

export const workState = {
  fr: {
    states: {
      queued: 'En file',
      running: 'En cours',
      waiting: 'En attente',
      retrying: 'Nouvel essai',
      blocked: 'Bloqué',
      'needs-attention': 'À traiter',
      'cancel-requested': 'Arrêt en cours',
      failed: 'Échec',
      completed: 'Terminé',
      cancelled: 'Arrêté',
      superseded: 'Remplacé',
    },
    problems: {
      'state-changed':
        'La situation a changé depuis l’affichage de la page. Les données ont été actualisées ; vérifiez-les avant de recommencer.',
      'action-blocked': 'Cette action n’est pas possible pour le moment.',
      'not-found': 'Cet élément n’existe plus.',
      'invalid-request': 'La demande est incomplète. Actualisez la page puis recommencez.',
      'storage-unavailable':
        'Le stockage des fichiers ne répond pas. Rien n’a été supprimé ; réessayez plus tard.',
    },
    blockReasons: {
      'already-terminal': 'Ce scan est déjà terminé.',
      'cancel-already-requested':
        'L’arrêt est déjà demandé ; le scan s’arrête à la prochaine étape sûre.',
      'not-stoppable': 'Ce travail ne peut pas être interrompu ; il se terminera seul.',
      'work-running': 'Le scan est en cours ; arrêtez-le avant de le supprimer.',
      'work-finishing': 'Le scan arrêté termine son étape en cours ; réessayez dans un instant.',
      'report-production-in-flight':
        'Un rapport est en cours de production pour cet audit ; réessayez dans un instant.',
      'not-queued': 'Ce scan n’est plus en file.',
      'queue-too-long': 'La file est trop longue pour être réordonnée ici.',
    },
    consequences: {
      'removes-from-queue': 'Retire ce scan de la file d’attente.',
      'stops-at-safe-boundary': 'Arrête ce scan à la prochaine étape sûre.',
      'deletes-history-only': 'Supprime le scan ; aucun audit n’a été produit.',
      'deletes-audits': 'Supprime le scan et tous les audits qu’il a produits.',
    },
    moveUpAria: 'Avancer {name} dans la file',
    moveDownAria: 'Reculer {name} dans la file',
    movedAnnouncement: '{name} est maintenant en position {position}.',
    queueChanged: 'La file a changé entre-temps ; l’ordre affiché a été actualisé.',
    queuePosition: 'Position {position}',
  },
  en: {
    states: {
      queued: 'Queued',
      running: 'Running',
      waiting: 'Waiting',
      retrying: 'Retrying',
      blocked: 'Blocked',
      'needs-attention': 'Needs attention',
      'cancel-requested': 'Stopping',
      failed: 'Failed',
      completed: 'Completed',
      cancelled: 'Stopped',
      superseded: 'Superseded',
    },
    problems: {
      'state-changed':
        'Things changed since this page loaded. The data has been refreshed; check it before trying again.',
      'action-blocked': 'This action is not possible right now.',
      'not-found': 'This item no longer exists.',
      'invalid-request': 'The request was incomplete. Refresh the page and try again.',
      'storage-unavailable':
        'File storage is not responding. Nothing was deleted; try again later.',
    },
    blockReasons: {
      'already-terminal': 'This scan has already finished.',
      'cancel-already-requested':
        'A stop is already requested; the scan stops at its next safe step.',
      'not-stoppable': 'This work cannot be interrupted; it will finish on its own.',
      'work-running': 'The scan is running; stop it before deleting it.',
      'work-finishing': 'The stopped scan is finishing its current step; try again shortly.',
      'report-production-in-flight':
        'A report is being produced for this audit; try again shortly.',
      'not-queued': 'This scan is no longer queued.',
      'queue-too-long': 'The queue is too long to reorder here.',
    },
    consequences: {
      'removes-from-queue': 'Removes this scan from the queue.',
      'stops-at-safe-boundary': 'Stops this scan at its next safe step.',
      'deletes-history-only': 'Deletes the scan; it produced no audits.',
      'deletes-audits': 'Deletes the scan and every audit it produced.',
    },
    moveUpAria: 'Move {name} earlier in the queue',
    moveDownAria: 'Move {name} later in the queue',
    movedAnnouncement: '{name} is now in position {position}.',
    queueChanged: 'The queue changed meanwhile; the order shown has been refreshed.',
    queuePosition: 'Position {position}',
  },
} satisfies { fr: WorkStateStrings; en: WorkStateStrings };
