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
const original = { useState: React.useState, useRef: React.useRef, useEffect: React.useEffect, load: Module._load };
const Button = () => null;
const Card = () => null;
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
after(() => { Object.assign(React, { useState: original.useState, useRef: original.useRef, useEffect: original.useEffect }); Module._load = original.load; Module._resolveFilename = resolve; });

// Approximate keyed remounts and effect cleanup; this is not a React renderer.
function harness(Component, props = () => ({})) {
  let slots = [];
  let cursor = 0;
  let pending = [];
  let childKey;
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
const book = (id) => ({ id, title: `Book ${id}`, author: 'Synthetic', genre: [], isFavorite: false });
const list = (books) => ({ books, pagination: { current: 1, total: books.length, totalPages: 1, size: 10 } });
function reset() { requests.length = 0; filters = {}; refresh = false; id = 'a'; filterUpdates = []; for (const key of Object.keys(fields)) delete fields[key]; }

test('loaded detail presents the full title, author, cover and review section', async () => {
  reset(); const h = harness(Detail, () => ({ params: { id } })); h.render();
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

test('detail cover handles missing and failed images and resets on URL changes', async () => {
  reset(); const h = harness(Detail, () => ({ params: { id } })); h.render();
  requests.shift().resolve([undefined, book('a')]); await flush();
  let tree = h.render();
  const actionBar = find(tree, (element) => typeof element.props?.setBook === 'function');
  const reviews = find(tree, (element) => element.props?.bookId === 'a');
  let key; let failed = false;
  function cover() {
    tree = h.render();
    const element = React.Children.toArray(tree.props.children)[0];
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
  assert.ok(byRole(h.render(), 'status'));
  requests.shift().resolve(list([])); await flush();
  assert.match(JSON.stringify(h.render()), /Aún no tienes/);
  filters = { title: 'missing' };
  assert.ok(byRole(h.render(), 'status'));
  requests.shift().resolve(list([])); await flush();
  assert.match(JSON.stringify(h.render()), /no hay resultados/);
  filters = { current: '2' };
  h.render(); requests.shift().resolve(list([book('a')])); await flush();
  assert.ok(byType(h.render(), Card));
  refresh = true; h.render(); requests.shift().reject(new Error('private details')); await flush();
  const tree = h.render(); assert.ok(byRole(tree, 'alert')); assert.doesNotMatch(JSON.stringify(tree), /private details/);
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
  assert.match(JSON.stringify(tree), /No hay libros en esta página/);
  assert.doesNotMatch(JSON.stringify(tree), /Aún no tienes|no hay resultados/);
  byType(tree, Button).props.onClick();
  assert.deepEqual(filterUpdates, [{ current: '1' }]); h.unmount();
});

for (const [label, Component, props] of [['library', Main, () => ({})], ['detail', Detail, () => ({ params: { id } })], ['edit', Edit, () => ({})]]) {
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

for (const [label, Component, props] of [['detail', Detail, () => ({ params: { id } })], ['edit', Edit, () => ({})]]) {
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

for (const [label, Component, props] of [['detail', Detail, () => ({ params: { id } })], ['edit', Edit, () => ({})]]) {
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
