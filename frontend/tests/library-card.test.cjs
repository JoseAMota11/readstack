const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
    esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX,
  } });
  module._compile(outputText, filename);
};

const path = require('node:path');
const Module = require('node:module');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  return resolve.call(this, request.startsWith('@/') ? path.join(__dirname, '..', request.slice(2)) : request, ...args);
};

const Card = require('../components/card.tsx').default;
const { coverTransitionName } = require('../utils/cover-transition.ts');
const book = { id: 'synthetic-id', title: 'Synthetic title', author: 'Synthetic author', year: 2024, isFavorite: false, reviewAverageRating: null, reviewRatingCount: 0 };
const render = (props = {}) => renderToStaticMarkup(React.createElement(Card, { ...book, ...props }));

test('cover names are deterministic, CSS-safe and distinct for different IDs', () => {
  const ids = ['', 'a', 'A', 'a-b', 'a b', 'é', '😀', '\ud800', '00'];
  const names = ids.map(coverTransitionName);
  assert.equal(new Set(names).size, ids.length);
  for (const name of names) assert.match(name, /^book-cover-[0-9a-f]*$/);
  assert.equal(coverTransitionName('a-b'), coverTransitionName('a-b'));
});

test('catalog cover boundary opts into shared transitions only', () => {
  const boundary = Card(book).props.children[0];
  assert.equal(boundary.type, React.ViewTransition);
  assert.equal(boundary.props.name, coverTransitionName(book.id));
  assert.equal(boundary.props.default, 'none');
  assert.equal(boundary.props.share, 'book-cover');
});

test('cover transition styling suppresses root and reduced-motion animations', () => {
  const css = fs.readFileSync(path.join(__dirname, '../app/globals.css'), 'utf8');
  assert.match(css, /::view-transition-old\(root\),\s*::view-transition-new\(root\)\s*\{\s*animation:\s*none/);
  assert.match(css, /::view-transition-group\(\.book-cover\)\s*\{[^}]*animation-duration:\s*220ms/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*::view-transition-group\(\*\),\s*::view-transition-old\(\*\),\s*::view-transition-new\(\*\)\s*\{\s*animation:\s*none\s*!important/);
});

test('card links to book detail and preserves long titles and metadata', () => {
  const title = 'A'.repeat(300);
  const html = render({ title, coverImage: 'https://example.test/cover.png' });
  assert.match(html, /href="\/book\/synthetic-id"/);
  assert.ok(html.includes(title));
  assert.match(html, /Synthetic author/);
  assert.match(html, /2024/);
  assert.match(html, /alt=""/);
  assert.doesNotMatch(html, /Sin portada/);
});

test('card uses review averages, including zero, and never the manual rating', () => {
  assert.match(render({ rating: 4 }), /Sin reseñas calificadas/);
  assert.doesNotMatch(render({ rating: 4 }), /4 de 5/);
  assert.match(render({ reviewAverageRating: null, reviewRatingCount: 2 }), /Sin reseñas calificadas/);
  assert.match(render({ reviewAverageRating: 0, reviewRatingCount: 1, isFavorite: true }), /0.0 de 5 · 1 reseña/);
  assert.match(render({ reviewAverageRating: 3.56, reviewRatingCount: 3, rating: 1 }), /3.6 de 5 · 3 reseñas/);
  assert.doesNotMatch(render({ reviewAverageRating: 3.56, reviewRatingCount: 3, rating: 1 }), /1 de 5|Calificación manual/);
  assert.match(render({ isFavorite: true }), /class="library-card-favorite"><span aria-hidden="true">♥<\/span>/);
});

test('missing and failed covers fall back, and a changed URL resets the cover state', () => {
  const html = render();
  assert.match(html, /Sin portada/);
  assert.match(html, /aria-hidden="true"[^>]*class="[^"]*anticon-book/);

  // Exercise the component handler and emulate React's keyed child remount.
  const originalUseState = React.useState;
  let key;
  let failed = false;
  React.useState = () => [failed, (value) => { failed = value; }];
  function cover(src) {
    const element = Card({ ...book, coverImage: src }).props.children[0].props.children;
    if (element.key !== key) { key = element.key; failed = false; }
    return element.type(element.props);
  }
  try {
    let tree = cover('https://example.test/first.png');
    assert.equal(tree.props.children.type, 'img');
    tree.props.children.props.onError();
    tree = cover('https://example.test/first.png');
    assert.equal(tree.props.children.props.children[1].props.children, 'Sin portada');
    tree = cover('https://example.test/second.png');
    assert.equal(tree.props.children.type, 'img');
    assert.equal(tree.props.children.props.src, 'https://example.test/second.png');
    tree = cover('https://example.test/first.png');
    assert.equal(tree.props.children.type, 'img');
  } finally {
    React.useState = originalUseState;
  }
});

test('catalog card presentation preserves contained covers, distinct focus and reduced motion', () => {
  const css = fs.readFileSync(require('node:path').join(__dirname, '../app/globals.css'), 'utf8');
  assert.match(css, /\.library-cover\s*\{[^}]*aspect-ratio:\s*2\s*\/\s*3/);
  assert.match(css, /\.library-cover img\s*\{[^}]*object-fit:\s*contain/);
  assert.match(css, /\.library-card:hover \.library-cover\s*\{[^}]*outline-color:\s*var\(--accent\)/);
  assert.match(css, /\.library-card:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--focus\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\.library-cover,[\s\S]*?\.library-card-title\s*\{\s*transition:\s*none/);
});
