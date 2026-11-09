const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

require.extensions['.tsx'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
    esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX,
  } });
  module._compile(outputText, filename);
};

const Card = require('../components/card.tsx').default;
const book = { id: 'synthetic-id', title: 'Synthetic title', author: 'Synthetic author', year: 2024, isFavorite: false };
const render = (props = {}) => renderToStaticMarkup(React.createElement(Card, { ...book, ...props }));

test('card links to book detail and preserves long titles and metadata', () => {
  const title = 'A'.repeat(300);
  const html = render({ title, coverImage: 'https://example.test/cover.png' });
  assert.match(html, /href="\/book\/synthetic-id"/);
  assert.ok(html.includes(title));
  assert.match(html, /Synthetic author/);
  assert.match(html, /2024/);
  assert.match(html, /alt=""/);
});

test('card distinguishes absent, null, zero and positive ratings and favorite status', () => {
  for (const rating of [undefined, null]) {
    const html = render({ rating });
    assert.doesNotMatch(html, /Calificación|Favorito/);
  }
  assert.match(render({ rating: 0, isFavorite: true }), /Calificación del libro: 0\/5/);
  assert.match(render({ rating: 0, isFavorite: true }), /Favorito/);
  assert.match(render({ rating: 3.5 }), /Calificación del libro: 3.5\/5/);
});

test('missing and failed covers fall back, and a changed URL resets the cover state', () => {
  assert.match(render(), /Sin portada/);

  // Exercise the component handler and emulate React's keyed child remount.
  const originalUseState = React.useState;
  let key;
  let failed = false;
  React.useState = () => [failed, (value) => { failed = value; }];
  function cover(src) {
    const element = Card({ ...book, coverImage: src }).props.children[0];
    if (element.key !== key) { key = element.key; failed = false; }
    return element.type(element.props);
  }
  try {
    let tree = cover('https://example.test/first.png');
    assert.equal(tree.props.children.type, 'img');
    tree.props.children.props.onError();
    tree = cover('https://example.test/first.png');
    assert.equal(tree.props.children.props.children, 'Sin portada');
    tree = cover('https://example.test/second.png');
    assert.equal(tree.props.children.type, 'img');
    assert.equal(tree.props.children.props.src, 'https://example.test/second.png');
    tree = cover('https://example.test/first.png');
    assert.equal(tree.props.children.type, 'img');
  } finally {
    React.useState = originalUseState;
  }
});
