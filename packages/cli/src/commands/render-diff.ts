import type { Command } from 'commander';
import { launchBrowser, renderDiff } from '@odysseus/scanner';

export function registerRenderDiffCommand(program: Command): void {
  program
    .command('render-diff <url>')
    .description(
      'Fetch a URL raw and fully rendered, and report how much visible text a non-JavaScript crawler would miss.',
    )
    .action(async (url: string) => {
      try {
        new URL(url);
      } catch {
        console.error(`odysseus render-diff: "${url}" is not a valid URL`);
        process.exitCode = 1;
        return;
      }

      const browser = await launchBrowser();
      try {
        const result = await renderDiff(browser, url);
        console.log(JSON.stringify(result, null, 2));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`odysseus render-diff: failed to audit ${url}\n${message}`);
        process.exitCode = 1;
      } finally {
        await browser.close();
      }
    });
}
