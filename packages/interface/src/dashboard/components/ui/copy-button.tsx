import { useState } from 'react';
import type { JSX } from 'react';
import { Button } from './button';

/** Copies one text field and flips to the copied label for a moment. The
 *  clipboard can refuse (permissions, insecure context); the button then
 *  stays usable and quiet, because the text is still on screen to select.
 *  Extracted from the drafts page so the preview page's once-only link
 *  display copies through the exact same affordance. */
export function CopyButton(props: {
  text: string;
  label: string;
  copiedLabel: string;
}): JSX.Element {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        void navigator.clipboard
          .writeText(props.text)
          .then(() => {
            setCopied(true);
            window.setTimeout(() => {
              setCopied(false);
            }, 2000);
          })
          .catch(() => {});
      }}
    >
      {copied ? props.copiedLabel : props.label}
    </Button>
  );
}
