import { describe, expect, it } from 'vitest';
import { parseChromiumExtraArgs } from './browser.js';

// Unit-level only: the flag strings are passed straight to Chromium, so
// there is nothing to observe through a live launch that the parser itself
// does not already decide (browser.e2e.test.ts covers the real launch).
describe('parseChromiumExtraArgs', () => {
  it('returns an empty list when the env var is unset', () => {
    expect(parseChromiumExtraArgs(undefined)).toEqual([]);
  });

  it('returns an empty list when the env var is blank', () => {
    expect(parseChromiumExtraArgs('')).toEqual([]);
    expect(parseChromiumExtraArgs('   ')).toEqual([]);
  });

  it('splits space-separated flags and drops stray whitespace', () => {
    expect(parseChromiumExtraArgs('--no-sandbox --disable-dev-shm-usage')).toEqual([
      '--no-sandbox',
      '--disable-dev-shm-usage',
    ]);
  });

  it('collapses runs of spaces and trims the whole value', () => {
    expect(parseChromiumExtraArgs('  --no-sandbox   --disable-gpu  ')).toEqual([
      '--no-sandbox',
      '--disable-gpu',
    ]);
  });

  it('keeps a flag value glued to its flag, as Chromium expects', () => {
    expect(parseChromiumExtraArgs('--lang=fr --disable-dev-shm-usage')).toEqual([
      '--lang=fr',
      '--disable-dev-shm-usage',
    ]);
  });
});
