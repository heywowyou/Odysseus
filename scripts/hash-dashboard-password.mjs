/**
 * Print a scrypt `salt:hash` value for ODYSSEUS_DASHBOARD_PASSWORD_HASH, the
 * secret the operator dashboard login checks against (plan 016).
 *
 * The password is read from stdin on purpose, never from a command-line
 * argument: arguments are kept in shell history and are visible in the
 * process list, and this script exists to keep the plaintext out of both.
 *
 * Run interactively:  node scripts/hash-dashboard-password.mjs
 * Run from a script:  printf '%s' "$PASSWORD" | node scripts/hash-dashboard-password.mjs
 */
import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline/promises';

// Kept byte-identical with packages/interface/src/auth/password.ts on
// purpose: the script is a dependency-free .mjs and cannot import that
// module, so the two must be changed together.
const SCRYPT_KEY_LENGTH_BYTES = 64;

const scryptAsync = promisify(scrypt);

function printUsage() {
  console.log(`Usage: node scripts/hash-dashboard-password.mjs [--help]

Prints a scrypt "salt:hash" line to set as ODYSSEUS_DASHBOARD_PASSWORD_HASH.

The password is read from stdin, never from an argument: command-line
arguments are kept in shell history and visible in the process list, and
this script exists to keep the plaintext out of both.

  Interactive:  node scripts/hash-dashboard-password.mjs
  Piped:        printf '%s' "$PASSWORD" | node scripts/hash-dashboard-password.mjs
`);
}

async function readPasswordFromStdin() {
  if (process.stdin.isTTY) {
    // Interactive use. The terminal's local echo is not suppressed, which
    // is acceptable for an operator's own machine; suppressing it would
    // need a raw-mode tty dependency this script deliberately lacks.
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      return await rl.question('Dashboard password: ');
    } finally {
      rl.close();
    }
  }
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

const arg = process.argv[2];
if (arg === '--help' || arg === '-h') {
  printUsage();
  process.exit(0);
}
if (arg !== undefined) {
  console.error('Unexpected argument: the password is read from stdin. See --help.');
  process.exit(1);
}

// Strip one trailing newline so `echo password |` and interactive input
// hash the same bytes; anything else the operator typed stays as typed.
const password = (await readPasswordFromStdin()).replace(/\r?\n$/, '');
if (password.length === 0) {
  console.error('No password received on stdin; nothing to hash.');
  process.exit(1);
}

const salt = randomBytes(16);
const hash = await scryptAsync(password, salt, SCRYPT_KEY_LENGTH_BYTES);
console.log(`${salt.toString('hex')}:${hash.toString('hex')}`);
console.log('');
console.log(
  'Set ODYSSEUS_DASHBOARD_PASSWORD_HASH to the line above (restart the dashboard server to apply).',
);
