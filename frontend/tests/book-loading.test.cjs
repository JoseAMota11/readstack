const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');

const root = path.resolve(__dirname, '..');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  return resolve.call(this, request.startsWith('@/') ? path.join(root, request.slice(2)) : request, ...args);
};
for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => {
    const source = fs.readFileSync(filename, 'utf8');
    const { outputText } = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX,
    } });
    module._compile(outputText, filename);
  };
}
const original = { use: React.use, useState: React.useState, useRef: React.useRef, useEffect: React.useEffect, load: Module._load };
const Button = () => null;
const Card = () => null;
const Link = () => null;
const ui = { Button, ConfigProvider: () => null, Spin: () => null, Pagination: () => null, Tag: () => null, Tooltip: () => null, Checkbox: () => null, Input: () => null, InputNumber: () => null, Select: () => null };
const requests = [];
let filters = {};
let refresh = false;
let id = 'a';
let filterUpdates = [];
const fields = {};
const setValue = (key, value) => { fields[key] = value; };
const deferred = (arg) => new Promise((resolve, reject) => requests.push({ arg, resolve, reject }));
const service = {
  getAllBooks: deferred, getOneBook: deferred,
  updateBook: async () => [undefined, 'ok'], deleteBook: async () => [undefined, 'ok'], exportBookCSV: async () => {},
};
Module._load = function (request, parent, ...args) {
  if (request === 'antd') return ui;
  if (request === '@/services/book.service') return service;
  if (request === '@/context/filters.context') return { useFilters: () => ({ filters, refresh, handleSetFilters: (value) => filterUpdates.push(value) }) };
  if (request === '@/context/message.context') return { useMessage: () => ({ info() {}, success() {}, error() {} }) };
  if (request === 'next/navigation') return { useParams: () => ({ id }), usePathname: () => `/book/${id}`, useRouter: () => ({ push() {}, replace() {} }) };
  if (request === 'next/link') return { __esModule: true, default: Link };
  if (request === 'react-hook-form') return { Controller: () => null, useForm: () => ({ control: {}, handleSubmit: () => () => {}, formState: { errors: {} }, setValue }) };
  if (request === '@hookform/resolvers/zod') return { zodResolver: () => () => {} };
  if (request === '@/schemas/book.shema') return { bookSchema: {} };
  if (request === './card') return { __esModule: true, default: Card };
  if (request === '@/components/reviews' || request === '@/components/image-placeholder') return { __esModule: true, default: () => null };
  return original.load.call(this, request, parent, ...args);
};
const Main = require('../components/main.tsx').default;
const Detail = require('../app/book/[id]/page.tsx').default;
const Edit = require('../app/book/[id]/edit/page.tsx').default;
after(() => { Object.assign(React, { use: original.use, useState: original.useState, useRef: original.useRef, useEffect: original.useEffect }); Module._load = original.load; Module._resolveFilename = resolve; });

// Approximate keyed remounts and effect cleanup; this is not a React renderer.
function harness(Component, props = () => ({})) {
  let slots = [];
  let cursor = 0;
  let pending = [];
  let childKey;
  React.use = (promise) => { assert.ok(promise instanceof Promise); return promise.testValue; };
  React.useState = (initial) => {
    const i = cursor++;
    const store = slots;
    if (!(i in store)) store[i] = typeof initial === 'function' ? initial() : initial;
    return [store[i], (value) => { store[i] = typeof value === 'function' ? value(store[i]) : value; }];
  };
  React.useRef = (initial) => { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; };
  React.useEffect = (effect, deps) => {
    const i = cursor++;
    const previous = slots[i];
    if (!previous || deps.some((value, index) => !Object.is(value, previous.deps[index]))) {
      pending.push(() => { previous?.cleanup?.(); slots[i] = { deps, effect, cleanup: effect() }; });
    }
  };
  return {
    render() {
      const child = Component(props());
      if (child.key !== childKey) {
        slots.forEach((slot) => slot?.cleanup?.());
        slots = []; childKey = child.key;
      }
      cursor = 0; const tree = child.type(child.props);
      const effects = pending; pending = []; effects.forEach((effect) => effect()); return tree;
    },
    replayEffects() { slots.forEach((slot) => { if (slot?.effect) { slot.cleanup?.(); slot.cleanup = slot.effect(); } }); },
    unmount() { slots.forEach((slot) => slot?.cleanup?.()); },
  };
}
function find(element, predicate) {
  if (!element || typeof element !== 'object') return null;
  if (predicate(element)) return element;
  for (const child of React.Children.toArray(element.props?.children)) {
    const match = find(child, predicate);
    if (match) return match;
  }
  return null;
}
const byRole = (tree, role) => find(tree, (element) => element.props?.role === role);
const byType = (tree, type) => find(tree, (element) => element.type === type);
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
const book = (id) => ({ id, title: `Book ${id}`, author: 'Synthetic', genre: [], isFavorite: false, reviewAverageRating: null, reviewRatingCount: 0 });
const detailProps = () => ({ params: Object.assign(Promise.resolve({ id }), { testValue: { id } }) });
const list = (books) => ({ books, pagination: { current: 1, total: books.length, totalPages: 1, size: 10 } });
function reset() { requests.length = 0; filters = {}; refresh = false; id = 'a'; filterUpdates = []; for (const key of Object.keys(fields)) delete fields[key]; }

test('detail unwraps promised params with the React server renderer', async () => {
  const { renderToReadableStream } = require('react-dom/server');
  const stream = await renderToReadableStream(React.createElement(Detail, { params: Promise.resolve({ id: 'a' }) }));
  const html = await new Response(stream).text();
  assert.match(html, /Cargando libro/);
});

test('loaded detail presents the full title, author, cover and review section', async () => {
  reset(); const h = harness(Detail, detailProps); h.render();
  const title = 'Título largo '.repeat(30);
  requests.shift().resolve([undefined, { ...book('a'), title, author: 'Autora de prueba', coverImage: 'https://example.test/cover.png' }]); await flush();
  const tree = h.render();
  const heading = byType(tree, 'h1');
  const cover = find(tree, (element) => element.props?.src === 'https://example.test/cover.png');
  assert.equal(heading.props.children, title);
  assert.match(JSON.stringify(tree), /Autora de prueba/);
  assert.equal(cover.props.src, 'https://example.test/cover.png');
  assert.equal(cover.props.title, title);
  assert.ok(find(tree, (element) => element.props?.bookId === 'a'));
  h.unmount();
});

test('detail displays review averages, hides manual ratings and suppresses outdated aggregate responses', async () => {
  reset(); const h = harness(Detail, detailProps); h.render();
  requests.shift().resolve([undefined, { ...book('a'), rating: 0, reviewAverageRating: 4.25, reviewRatingCount: 3 }]); await flush();
  let tree = h.render();
  const ratingSection = () => find(tree, (element) => element.props?.className === 'book-detail-rating');
  let average = find(ratingSection(), (element) => element.props?.average === 4.25);
  assert.equal(average.props.count, 3);
  assert.doesNotMatch(JSON.stringify(ratingSection()), /Calificación manual anterior|0 de 5/);
  const reviews = find(tree, (element) => element.props?.bookId === 'a');
  reviews.props.onAggregateChange(); const first = requests.shift();
  reviews.props.onAggregateChange(); const second = requests.shift();
  second.resolve([undefined, { ...book('a'), reviewAverageRating: 3.75, reviewRatingCount: 2 }]); await flush();
  first.resolve([undefined, { ...book('a'), reviewAverageRating: 1, reviewRatingCount: 1 }]); await flush();
  tree = h.render();
  average = find(ratingSection(), (element) => element.props?.average === 3.75);
  assert.equal(average.props.count, 2);
  assert.doesNotMatch(JSON.stringify(ratingSection()), /Calificación manual anterior|0 de 5/);
  reviews.props.onAggregateChange(); const late = requests.shift();
  reviews.props.onAggregateUncertain();
  late.resolve([undefined, { ...book('a'), reviewAverageRating: 5, reviewRatingCount: 3 }]); await flush();
  assert.match(JSON.stringify(h.render()), /Promedio sin actualizar/);
  h.unmount();
});

test('detail provides a library link during loading, error, and success', async () => {
  reset(); const h = harness(Detail, detailProps);
  function assertLink(tree) {
    const link = byType(tree, Link);
    assert.equal(link.props.href, '/');
    const [arrow, label] = React.Children.toArray(link.props.children);
    assert.equal(arrow.props['aria-hidden'], 'true');
    assert.equal(arrow.props.children, '←');
    assert.equal(label.trim(), 'Volver a la biblioteca');
  }
  let tree = h.render(); assert.ok(byRole(tree, 'status')); assertLink(tree);
  requests.shift().reject(new Error('network')); await flush();
  tree = h.render(); assert.ok(byRole(tree, 'alert')); assertLink(tree);
  byType(tree, Button).props.onClick(); h.render();
  requests.shift().resolve([undefined, book('a')]); await flush();
  tree = h.render(); assert.ok(byType(tree, 'h1')); assertLink(tree);
  h.unmount();
});

test('only loaded detail has a book-specific shared cover boundary', async () => {
  reset(); const h = harness(Detail, detailProps);
  assert.equal(find(h.render(), (element) => element.type === React.ViewTransition), null);
  requests.shift().resolve([undefined, book('a')]); await flush();
  const boundary = find(h.render(), (element) => element.type === React.ViewTransition);
  assert.equal(boundary.props.name, require('../utils/cover-transition.ts').coverTransitionName('a'));
  assert.equal(boundary.props.default, 'none');
  assert.equal(boundary.props.share, 'book-cover');
  h.unmount();
});

test('detail cover handles missing and failed images and resets on URL changes', async () => {
  reset(); const h = harness(Detail, detailProps); h.render();
  requests.shift().resolve([undefined, book('a')]); await flush();
  let tree = h.render();
  const actionBar = find(tree, (element) => typeof element.props?.setBook === 'function');
  const reviews = find(tree, (element) => element.props?.bookId === 'a');
  let key; let failed = false;
  function cover() {
    tree = h.render();
    const element = find(tree, (item) => item.type === React.ViewTransition).props.children;
    if (element.key !== key) { key = element.key; failed = false; }
    const useState = React.useState;
    React.useState = () => [failed, (value) => { failed = value; }];
    try { return element.type(element.props); } finally { React.useState = useState; }
  }
  const changeUrl = (url) => actionBar.props.setBook((previous) => ({ ...previous, coverImage: url }));
  assert.equal(cover().props.children.props.children, 'Sin portada');
  changeUrl(''); assert.equal(cover().props.children.props.children, 'Sin portada');
  changeUrl('https://example.test/first.png');
  let image = cover().props.children;
  assert.equal(image.type, 'img'); assert.equal(image.props.alt, 'Book a');
  image.props.onError(); assert.equal(cover().props.children.props.children, 'Sin portada');
  changeUrl('https://example.test/second.png');
  image = cover().props.children;
  assert.equal(image.type, 'img'); assert.equal(image.props.src, 'https://example.test/second.png');
  changeUrl('https://example.test/first.png'); assert.equal(cover().props.children.type, 'img');
  const nextReviews = find(tree, (element) => element.props?.bookId === 'a');
  assert.equal(nextReviews.type, reviews.type); assert.equal(nextReviews.key, reviews.key);
  h.unmount();
});

test('library loading, empty, populated, failure and retry use current filters', async () => {
  reset(); const h = harness(Main);
  assert.match(byRole(h.render(), 'status').props.className, /library-state/);
  requests.shift().resolve(list([])); await flush();
  assert.match(JSON.stringify(h.render()), /library-state.*Aún no tienes/);
  filters = { title: 'missing' };
  assert.ok(byRole(h.render(), 'status'));
  requests.shift().resolve(list([])); await flush();
  assert.match(JSON.stringify(h.render()), /library-state.*no hay resultados/);
  filters = { current: '2' };
  h.render(); requests.shift().resolve(list([book('a')])); await flush();
  assert.ok(byType(h.render(), Card));
  refresh = true; h.render(); requests.shift().reject(new Error('private details')); await flush();
  const tree = h.render(); assert.match(byRole(tree, 'alert').props.className, /library-state-error/); assert.doesNotMatch(JSON.stringify(tree), /private details/);
  byType(tree, Button).props.onClick(); assert.ok(byRole(h.render(), 'status'));
  assert.deepEqual(requests[0].arg, { current: '2' });
  requests.shift().resolve(list([book('b')])); await flush();
  assert.equal(byType(h.render(), Card).props.id, 'b');
  filters = { current: '2' }; assert.equal(byType(h.render(), Card).props.id, 'b');
  assert.equal(requests.length, 0); h.unmount();
});

test('empty page with matching books offers recovery without claiming the library is empty', async () => {
  reset(); filters = { current: '3', title: 'x' }; const h = harness(Main); h.render();
  requests.shift().resolve({ books: [], pagination: { current: 3, total: 2, totalPages: 1, size: 10 } }); await flush();
  const tree = h.render();
  assert.match(tree.props.className, /library-state/);
  assert.match(JSON.stringify(tree), /No hay libros en esta página/);
  assert.doesNotMatch(JSON.stringify(tree), /Aún no tienes|no hay resultados/);
  byType(tree, Button).props.onClick();
  assert.deepEqual(filterUpdates, [{ current: '1' }]); h.unmount();
});

test('pagination keeps page navigation and resets both size-change callbacks to page one', async () => {
  reset(); const h = harness(Main); h.render();
  requests.shift().resolve({ books: [book('a')], pagination: { current: 3, total: 30, totalPages: 3, size: 10 } }); await flush();
  const pagination = byType(h.render(), ui.Pagination);
  pagination.props.onChange(2, 10);
  pagination.props.onShowSizeChange(3, 5);
  pagination.props.onChange(3, 5);
  assert.deepEqual(filterUpdates, [
    { current: '2', size: '10' },
    { current: '1', size: '5' },
    { current: '1', size: '5' },
  ]);
  h.unmount();
});

test('equivalent empty filters do not trigger another library request', async () => {
  reset(); const h = harness(Main); h.render();
  requests.shift().resolve(list([book('a')])); await flush();
  filters = { title: '', author: undefined, year: null, genre: '' };
  assert.equal(byType(h.render(), Card).props.id, 'a');
  assert.equal(requests.length, 0);
  h.unmount();
});

for (const [label, Component, props] of [['library', Main, () => ({})], ['detail', Detail, detailProps], ['edit', Edit, () => ({})]]) {
  test(`${label} effect cleanup ignores the first request when effects are replayed`, async () => {
    reset(); const h = harness(Component, props); h.render(); const first = requests.shift();
    h.replayEffects(); const second = requests.shift();
    second.resolve(label === 'library' ? list([book('current')]) : [undefined, book('current')]); await flush();
    first.resolve(label === 'library' ? list([book('obsolete')]) : [undefined, book('obsolete')]); await flush();
    const tree = h.render();
    if (label === 'library') assert.equal(byType(tree, Card).props.id, 'current');
    else if (label === 'edit') assert.equal(fields.title, 'Book current');
    else assert.match(JSON.stringify(tree), /Book current/);
    h.unmount();
  });
}

test('library ignores obsolete success and failure on filters, pages, refresh and unmount', async () => {
  reset(); const h = harness(Main); h.render(); const a = requests.shift();
  filters = { title: 'x' }; h.render(); const b = requests.shift();
  filters = { current: '2' }; h.render(); const c = requests.shift();
  refresh = true; h.render(); const d = requests.shift();
  d.resolve(list([book('latest')])); await flush();
  a.resolve(list([book('old')])); b.reject(new Error('old')); c.resolve(list([])); await flush();
  assert.equal(byType(h.render(), Card).props.id, 'latest');
  refresh = false; h.render(); const e = requests.shift(); h.unmount(); e.reject(new Error('late')); await flush();
});

for (const [label, Component, props] of [['detail', Detail, detailProps], ['edit', Edit, () => ({})]]) {
  test(`${label} gates content, retries generic failures, and ignores obsolete requests`, async () => {
    reset(); const h = harness(Component, props);
    assert.ok(byRole(h.render(), 'status')); const a = requests.shift();
    id = 'b'; assert.ok(byRole(h.render(), 'status')); const b = requests.shift();
    a.resolve([undefined, book('a')]); await flush();
    assert.ok(byRole(h.render(), 'status'));
    b.resolve(['sensitive server response', undefined]); await flush();
    let tree = h.render(); assert.ok(byRole(tree, 'alert')); assert.doesNotMatch(JSON.stringify(tree), /sensitive/);
    assert.equal(byType(tree, 'form'), null);
    byType(tree, Button).props.onClick(); assert.ok(byRole(h.render(), 'status'));
    requests.shift().reject(new Error('network')); await flush(); assert.ok(byRole(h.render(), 'alert'));
    byType(h.render(), Button).props.onClick(); h.render(); requests.shift().resolve([undefined, book('b')]); await flush();
    tree = h.render();
    if (label === 'edit') { assert.ok(byType(tree, 'form')); assert.equal(fields.title, 'Book b'); }
    else assert.match(JSON.stringify(tree), /Book b/);
    id = 'a'; assert.ok(byRole(h.render(), 'status')); const late = requests.shift();
    h.unmount(); late.resolve([undefined, book('a')]); await flush();
    if (label === 'edit') assert.equal(fields.title, 'Book b');
  });
}

for (const [label, Component, props] of [['detail', Detail, detailProps], ['edit', Edit, () => ({})]]) {
  test(`${label} reloads a previously visited id and ignores the earlier response`, async () => {
    reset(); const h = harness(Component, props); h.render(); const oldA = requests.shift();
    id = 'b'; h.render(); const oldB = requests.shift();
    id = 'a'; assert.ok(byRole(h.render(), 'status')); const current = requests.shift();
    assert.equal(current.arg, 'a');
    current.resolve([undefined, book('new-a')]); await flush();
    oldA.resolve([undefined, book('old-a')]); oldB.reject(new Error('old')); await flush();
    const tree = h.render();
    if (label === 'edit') assert.equal(fields.title, 'Book new-a');
    else assert.match(JSON.stringify(tree), /Book new-a/);
    assert.equal(byRole(tree, 'alert'), null); h.unmount();
  });
}
