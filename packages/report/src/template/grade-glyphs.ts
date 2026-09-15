/**
 * Outlines of the grade letters, taken once from AvenirNextCyr-Demi.woff2
 * (the report font at the badge's 600 weight) and cropped to each glyph's
 * own ink box. The badge draws these instead of text so centering is
 * geometric: a font's line box carries more space above a capital than below
 * it, so a flex-centered letter never sits in the middle of the circle.
 * Units are font units (1000 per em), so `width`/`height` divided by 1000 is
 * the size in em at the badge's font-size.
 */

import type { Grade } from '@odysseus/core';

export interface GradeGlyph {
  width: number;
  height: number;
  path: string;
}

export const GRADE_GLYPHS: Record<Grade, GradeGlyph> = {
  A: {
    width: 722,
    height: 708,
    path: 'M0 708L308 0L417 0L722 708L578 708L512 546L205 546L141 708ZM248 438L468 438L359 150Z',
  },
  B: {
    width: 523,
    height: 708,
    path: 'M0 708L0 0L276 0Q366 0 429.5 44Q493 88 493 178Q493 236 460 276Q427 316 370 333L370 335Q439 344 481 388Q523 432 523 502Q523 557 500.5 598.5Q478 640 439 663Q400 686 354 697Q308 708 255 708ZM126 104L126 288L238 288Q301 288 334 263Q367 238 367 192Q367 145 333 124.5Q299 104 227 104ZM126 396L126 602L239 602Q397 602 397 496Q397 442 360 419Q323 396 244 396Z',
  },
  C: {
    width: 652,
    height: 744,
    path: 'M641 108L545 184Q519 148 474.5 129.5Q430 111 384 111Q276 111 207.5 185Q139 259 139 370Q139 486 204.5 558.5Q270 631 379 631Q491 631 551 549L652 620Q553 744 378 744Q212 744 106 639.5Q0 535 0 370Q0 203 108.5 101.5Q217 0 384 0Q458 0 529.5 27.5Q601 55 641 108Z',
  },
  D: {
    width: 642,
    height: 708,
    path: 'M0 708L0 0L251 0Q325 0 391 18.5Q457 37 515 76.5Q573 116 607.5 187.5Q642 259 642 354Q642 443 607.5 513Q573 583 515.5 624.5Q458 666 390.5 687Q323 708 251 708ZM126 598L231 598Q272 598 309.5 591Q347 584 384 566.5Q421 549 447.5 522.5Q474 496 490.5 452.5Q507 409 507 354Q507 108 231 108L126 108Z',
  },
};
