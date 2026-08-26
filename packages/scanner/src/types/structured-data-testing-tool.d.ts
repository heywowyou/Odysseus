/**
 * structured-data-testing-tool ships no type declarations and has no
 * @types package. Declared loosely (not modeling its full test/preset
 * shape) since checks/structured-data.ts only reads a handful of fields
 * off the resolved/rejected value and narrows those itself.
 */
declare module 'structured-data-testing-tool' {
  export function structuredDataTest(
    input: string,
    options?: Record<string, unknown>,
  ): Promise<unknown>;
}

declare module 'structured-data-testing-tool/presets.js' {
  const Google: unknown;
  const Twitter: unknown;
  const Facebook: unknown;
  const Social: unknown;
  export { Google, Twitter, Facebook, Social };
}
