import { execFileSync } from 'node:child_process';

// ok: dangerous-shell-exec
export function describeRef(ref: string): string {
  return execFileSync('git', ['log', ref], { encoding: 'utf-8' });
}
