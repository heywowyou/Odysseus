/** The three latest events (issue #532). */

import type { JSX } from 'react';
import { Card } from '../../components/ui/card';
import { eventLabelKey } from './types';
import type { ProspectDetailShared } from './shared';

export function RecentActivityPanel(props: { shared: ProspectDetailShared }): JSX.Element {
  const { copy, strings, formatDate, actorLabel, recentEvents } = props.shared;
  return (
    <Card id="recent-activity" title={copy.recentActivity}>
      {recentEvents.length > 0 ? (
        <ol className="space-y-3">
          {recentEvents.map((event) => (
            <li key={event.eventId} className="border-l-2 border-line pl-3 text-sm">
              <p className="font-medium">
                {copy.eventLabels[eventLabelKey(event)] ?? strings.common.vocabularyFallback}
              </p>
              <p className="text-xs text-ink-muted">
                {formatDate(event.at)} · {actorLabel(event.actor)}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-ink-muted">{copy.noEvents}</p>
      )}
    </Card>
  );
}
