/**
 * `odysseus outreach-funnel` (issue #533): the outreach funnel per campaign,
 * counts only, from the live thread and outcome collections. Read-only. Run
 * it and keep its output before the first threads reach their 90-day expiry
 * (docs/product/outreach-experiment-design.md section 4).
 */

import type { Command } from 'commander';
import { aggregateOutreachFunnel, connectToMongo, disconnectFromMongo } from '@odysseus/store';

export function registerOutreachFunnelCommand(program: Command): void {
  program
    .command('outreach-funnel')
    .description(
      'Print the outreach funnel per campaign (threads, first emails sent, replies, bounces, ' +
        'opt-outs, wins, replies by touch, current outcomes), as counts only. Read-only.',
    )
    .option('--json', 'Print the counts as JSON, for keeping beside the experiment record')
    .action(async (opts: { json?: boolean }) => {
      const connection = await connectToMongo();
      try {
        const funnels = await aggregateOutreachFunnel(connection);
        if (opts.json === true) {
          console.log(
            JSON.stringify({ exportedAt: new Date().toISOString(), campaigns: funnels }, null, 2),
          );
          return;
        }
        if (funnels.length === 0) {
          console.log('No outreach threads stored.');
          return;
        }
        for (const funnel of funnels) {
          console.log(`Campaign ${funnel.campaignVersion}`);
          console.log(`  threads opened        ${funnel.threads}`);
          console.log(`  first emails sent     ${funnel.firstTouchSent}`);
          console.log(`  replied               ${funnel.replied}`);
          console.log(`  bounced               ${funnel.bounced}`);
          console.log(`  opted out             ${funnel.optedOut}`);
          console.log(`  won                   ${funnel.won}`);
          console.log(
            `  replies after touch   1: ${funnel.repliesAfterTouch[1]}, ` +
              `2: ${funnel.repliesAfterTouch[2]}, 3: ${funnel.repliesAfterTouch[3]}`,
          );
          const outcomes = Object.entries(funnel.outcomes).filter(([, count]) => count > 0);
          console.log(
            `  current outcomes      ${
              outcomes.length === 0
                ? 'none recorded'
                : outcomes.map(([outcome, count]) => `${outcome} ${count}`).join(', ')
            }`,
          );
        }
      } finally {
        await disconnectFromMongo(connection);
      }
    });
}
