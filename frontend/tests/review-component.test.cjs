const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

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

// Render the real component with a small hook harness and stubbed UI controls.
// No DOM or additional test dependency is needed to exercise its handlers.
const React = require('react');
const Cookies = require('js-cookie');
const TextArea = () => null;
const Rate = () => null;
const Button = () => null;
const load = Module._load;
Module._load = function (request, parent, ...args) {
  if (parent?.filename.endsWith('/components/reviews.tsx')) {
    if (request === 'antd') return { Input: { TextArea }, Rate, Button };
    if (request === './review-card') return { __esModule: true, default: () => null };
    if (request === '@/context/message.context') return { useMessage: () => message };
  }
  return load.call(this, request, parent, ...args);
};
const message = { error() {}, success() {} };
process.env.NEXT_PUBLIC_API_URL = 'http://localhost:4000/api/v1';
const Reviews = require('../components/reviews.tsx').default;
const books = require('../services/book.service.ts');
const { readReviewDraft } = require('../utils/review-draft.ts');

function createHarness() {
  const states = [];
  let cursor = 0;
  let mounted = false;
  let effects = [];
  React.useState = (initial) => {
    const index = cursor++;
    if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
    return [states[index], (value) => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
  };
  React.useRef = (initial) => {
    const index = cursor++;
    if (!(index in states)) states[index] = { current: initial };
    return states[index];
  };
  React.useEffect = (effect) => { if (!mounted) effects.push(effect); };
  React.useCallback = (callback) => callback;
  return () => {
    cursor = 0;
    const tree = Reviews({ bookId: 'book-a' });
    if (!mounted) {
      mounted = true;
      for (const effect of effects) effect();
      effects = [];
    }
    return tree;
  };
}

function find(element, type) {
  if (!element || typeof element !== 'object') return null;
  if (element.type === type) return element;
  for (const child of React.Children.toArray(element.props?.children)) {
    const found = find(child, type);
    if (found) return found;
  }
  return null;
}

test('component edits survive unrelated 401 and later edits survive successful in-flight submission', async () => {
  const original = { useState: React.useState, useRef: React.useRef, useEffect: React.useEffect, useCallback: React.useCallback, get: Cookies.get, remove: Cookies.remove, fetch: global.fetch, window: global.window, storage: global.sessionStorage };
  const store = new Map();
  global.sessionStorage = {
    get length() { return store.size; }, key: (index) => [...store.keys()][index] ?? null,
    getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: (key) => store.delete(key),
  };
  const payload = Buffer.from(JSON.stringify({ id: 'user-a', username: 'synthetic', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  let cookie = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${payload}.signature`;
  Cookies.get = () => cookie;
  Cookies.remove = () => { cookie = undefined; };
  let redirected = false;
  global.window = { location: { pathname: '/book/book-a', search: '', assign: () => { redirected = true; } } };
  global.fetch = async () => new Response('[]', { status: 200 });
  try {
    let render = createHarness();
    let tree = render();
    await Promise.resolve();
    find(tree, TextArea).props.onChange({ target: { value: 'first synthetic draft' } });
    tree = render();
    find(tree, Rate).props.onChange(4);
    global.fetch = async () => new Response('{"message":"expired"}', { status: 401 });
    await books.updateBook('book-a', { isFavorite: true });
    assert.equal(redirected, true);
    assert.deepEqual(readReviewDraft('review-draft:user-a:book-a'), { comment: 'first synthetic draft', rating: 4 });

    // Simulate reauthentication and remounting the component for the same book.
    cookie = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${payload}.signature`;
    global.fetch = async () => new Response('[]', { status: 200 });
    render = createHarness();
    render();
    tree = render();
    assert.equal(find(tree, TextArea).props.value, 'first synthetic draft');
    assert.equal(readReviewDraft('review-draft:other-user:book-a'), null);
    assert.equal(readReviewDraft('review-draft:user-a:other-book'), null);

    let finish;
    global.fetch = () => new Promise((resolve) => { finish = resolve; });
    const rejected = find(tree, Button).props.onClick();
    find(tree, TextArea).props.onChange({ target: { value: 'in-flight synthetic edit' } });
    finish(new Response('{"message":"expired"}', { status: 401 }));
    await rejected;
    assert.equal(readReviewDraft('review-draft:user-a:book-a').comment, 'in-flight synthetic edit');
    cookie = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${payload}.signature`;
    global.fetch = async () => new Response('[]', { status: 200 });
    render = createHarness();
    render();
    tree = render();
    assert.equal(find(tree, TextArea).props.value, 'in-flight synthetic edit');

    global.fetch = () => new Promise((resolve) => { finish = resolve; });
    const submission = find(tree, Button).props.onClick();
    find(tree, TextArea).props.onChange({ target: { value: 'later synthetic edit' } });
    global.fetch = async () => new Response('[]', { status: 200 });
    finish(new Response('{"message":"ok"}', { status: 200 }));
    await submission;
    assert.equal(find(render(), TextArea).props.value, 'later synthetic edit');
    assert.equal(readReviewDraft('review-draft:user-a:book-a').comment, 'later synthetic edit');

    global.fetch = async (_url, init) => init.method === 'POST'
      ? new Response('{"message":"ok"}', { status: 200 }) : new Response('[]', { status: 200 });
    await find(render(), Button).props.onClick();
    assert.equal(readReviewDraft('review-draft:user-a:book-a'), null);
  } finally {
    Object.assign(React, { useState: original.useState, useRef: original.useRef, useEffect: original.useEffect, useCallback: original.useCallback });
    Object.assign(Cookies, { get: original.get, remove: original.remove });
    global.fetch = original.fetch;
    global.window = original.window;
    global.sessionStorage = original.storage;
  }
});
