# hotel-demo

Static hotel-shaped fixture for the milestone 9c prescan (plan 004). Plain
HTML served by any static server: the prescan's page-role selection reads
links, and `fixtures/spa-demo` is a two-page React app with neither a booking
page nor a rooms page, so it cannot exercise the choice at all.

Deliberately seeded, in the same spirit as spa-demo's faults:

- French and English booking and rooms links, so bilingual selection is
  exercised against real markup rather than synthetic anchors.
- An off-site OTA link labelled "Réserver sur Booking", which must be
  recorded as evidence and never selected as a page to load.
- Accessibility faults axe reliably detects: an unlabelled form field, an
  image with no alt text, and a skipped heading level.
- A deliberate main-thread block and a post-load layout shift on the
  homepage, so the direct metrics have something non-zero to measure.

Never a live third-party site.
