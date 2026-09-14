import { exec } from 'node:child_process';

// ruleid: dangerous-shell-exec
export function describeRef(ref: string): void {
  exec(`git log ${ref}`, (error, stdout) => {
    console.log(stdout);
  });
}
