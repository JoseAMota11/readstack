// Shared with the DB-04H SQLite baseline; do not normalize SQLite LIKE behavior.
export const parityGenres = ['Quote"here', 'Back\\slash', '100%', 'under_score', 'Été', '😀', 'control\nline'];
export const parityCases: [string, string | number, boolean][] = [
  ['title', 'bC', true], ['title', 'a_c', true], ['title', 'a%c', true],
  ['title', '100%_', true], ['title', 'éclair', false], ['title', 'ÉCLAIR', true],
  ['title', '😀', false], ['author', 'RIT', true], ['year', 24, true], ['year', 19, false],
  ['genre', '100%', true], ['genre', 'under_score', true], ['genre', 'été', false],
  ['genre', 'ÉTé', true], ['genre', '😀', true], ['genre', 'Quote"here', false],
  ['genre', 'Back\\slash', false], ['genre', 'control\nline', false],
  ['genre', 'Quote%', true], ['genre', 'Back%', true],
];
