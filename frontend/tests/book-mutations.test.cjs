const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');

const root = path.resolve(__dirname, '..');
const original = { resolve: Module._resolveFilename, load: Module._load, useState: React.useState, useRef: React.useRef, useEffect: React.useEffect, fetch: global.fetch };
Module._resolveFilename = function (request, ...args) {
  return original.resolve.call(this, request.startsWith('@/') ? path.join(root, request.slice(2)) : request, ...args);
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

const Button = () => null;
const Modal = () => null;
const ConfigProvider = () => null;
const Controller = () => null;
const messages = [];
let formErrors = {};
let formOptions;
let values;
let resets;
let closed;
let refreshed;
let navigated;
let submitFactoryCalls = 0;
let invalidSubmission = false;
let submittedEvent;
const setValue = (key, value) => { values[key] = value; };
const ui = { Button, Modal, ConfigProvider, Checkbox: () => null, Input: () => null, InputNumber: () => null, Select: () => null, Spin: () => null };
Module._load = function (request, parent, ...args) {
  if (request === 'antd') return ui;
  if (request === '@/context/message.context') return { useMessage: () => ({ error: (text) => messages.push(['error', text]), success: (text) => messages.push(['success', text]) }) };
  if (request === '@/context/filters.context') return { useFilters: () => ({ refreshData: () => refreshed++ }) };
  if (request === '@/utils/cookies-handlers') return { getTokenDecoded: () => null, getToken: () => 'synthetic', getSessionVersion: () => 0, removeToken() {} };
  if (request === 'next/navigation') return { useParams: () => ({ id: 'book-a' }), useRouter: () => ({ replace: () => navigated++ }) };
  if (request === 'react-hook-form') return { Controller, useForm: (options) => { formOptions = options; return { control: {}, formState: { errors: formErrors }, handleSubmit: (valid, invalid) => { submitFactoryCalls++; return (event) => { submittedEvent = event; return invalidSubmission ? invalid({ title: 'invalid' }) : valid({ ...values }); }; }, reset: () => { resets++; values = {}; }, setValue }; } };
  if (request === '@hookform/resolvers/zod') return { zodResolver: () => () => {} };
  if (request === '@/schemas/book.shema') return { bookSchema: {} };
  return original.load.call(this, request, parent, ...args);
};
process.env.NEXT_PUBLIC_API_URL = 'http://localhost:4000/api/v1';
const Create = require('../components/create-book-modal.tsx').default;
const Edit = require('../app/book/[id]/edit/page.tsx').default;
after(() => {
  Module._resolveFilename = original.resolve; Module._load = original.load;
  Object.assign(React, { useState: original.useState, useRef: original.useRef, useEffect: original.useEffect });
  global.fetch = original.fetch;
});

// Lightweight hook/handler harness, not a DOM or browser renderer.
function harness(kind) {
  const slots = [];
  let cursor = 0;
  let effects = [];
  React.useState = (initial) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
    return [slots[index], (value) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
  };
  React.useRef = (initial) => { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; };
  React.useEffect = (effect, deps) => {
    const index = cursor++;
    if (!slots[index] || deps.some((value, i) => !Object.is(value, slots[index].deps[i]))) {
      effects.push(() => { slots[index]?.cleanup?.(); slots[index] = { deps, cleanup: effect() }; });
    }
  };
  return {
    render() {
      cursor = 0;
      const tree = kind === 'create' ? Create({ open: true, setOpen: () => closed++ }) : Edit().type({ id: 'book-a' });
      const pending = effects; effects = []; pending.forEach((effect) => effect());
      return tree;
    },
    unmount() { slots.forEach((slot) => slot?.cleanup?.()); },
  };
}
function find(element, type, predicate = () => true) {
  if (!element || typeof element !== 'object') return null;
  if (element.type === type && predicate(element)) return element;
  for (const child of React.Children.toArray(element.props?.children)) {
    const result = find(child, type, predicate); if (result) return result;
  }
  return null;
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
const response = (body, status = 200) => new Response(body, { status, headers: { 'Content-Type': 'application/json' } });

test('create: Cancel uses the existing dismissal and reset path', () => {
  values = { title: 'Synthetic draft' }; resets = 0; closed = 0;
  const h = harness('create');
  const tree = h.render();
  const cancel = find(tree, Button, (button) => button.props.htmlType === 'button');
  assert.equal(cancel.props.onClick, find(tree, Modal).props.onCancel);
  cancel.props.onClick();
  assert.equal(closed, 1);
  assert.equal(resets, 1);
  h.unmount();
});

test('create: errors are absent initially and each reported error describes its control', () => {
  const h = harness('create');
  formErrors = {};
  let tree = h.render();
  assert.equal(formOptions.mode, undefined);
  const fields = ['title', 'author', 'year', 'genre', 'coverImage', 'isFavorite'];
  for (const name of fields) {
    const controller = find(tree, Controller, (node) => node.props.name === name);
    const control = controller.props.render({ field: { name, value: name === 'isFavorite' ? false : undefined } });
    assert.equal(control.props['aria-invalid'], false);
    assert.equal(control.props['aria-describedby'], undefined);
    assert.equal(find(tree, 'span', (node) => node.props.id === `${name}-error`), null);
  }
  formErrors = Object.fromEntries(fields.map((name) => [name, { type: 'invalid' }]));
  tree = h.render();
  for (const name of fields) {
    const controller = find(tree, Controller, (node) => node.props.name === name);
    const control = controller.props.render({ field: { name, value: name === 'isFavorite' ? false : undefined } });
    const error = find(tree, 'span', (node) => node.props.id === `${name}-error`);
    assert.equal(control.props['aria-invalid'], true);
    assert.equal(control.props['aria-describedby'], error.props.id);
    assert.equal(error.props.children[0].props['aria-hidden'], 'true');
    assert.ok(error.props.children[1].props.children.length > 0);
    if (name !== 'isFavorite') assert.equal(control.props.status, 'error');
  }
  const favorite = find(tree, Controller, (node) => node.props.name === 'isFavorite');
  assert.equal(favorite.props.defaultValue, false);
  assert.equal(favorite.props.render({ field: { name: 'isFavorite', value: true } }).props.children.trim(), 'Favorito:');
  formErrors = {};
  h.unmount();
});

test('create: existing schema and responsive field layout remain intact', () => {
  const { bookSchema } = require('../schemas/book.shema.ts');
  const valid = { title: 'Título', author: 'Autor', year: 2000, genre: ['A'], isFavorite: false };
  assert.equal(bookSchema.safeParse(valid).success, true);
  assert.deepEqual(bookSchema.parse({ ...valid, rating: null, reviewAverageRating: 4, reviewRatingCount: 1 }), valid);
  for (const patch of [{ title: '' }, { author: '' }, { year: 999 }, { year: 2000.5 }, { genre: [] }, { coverImage: '' }]) {
    assert.equal(bookSchema.safeParse({ ...valid, ...patch }).success, false);
  }
  const h = harness('create');
  const form = find(h.render(), 'form');
  assert.equal(find(form, Controller, (node) => node.props.name === 'rating'), null);
  assert.equal(find(form, 'label', (node) => node.props.htmlFor === 'rating'), null);
  const classes = React.Children.toArray(form.props.children).map((node) => node.props.className);
  assert.deepEqual(classes.slice(1, 7).map((name) => name.split('--')[1]), ['title', 'author', 'year', 'genre', 'coverImage', 'isFavorite']);
  const css = fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8');
  assert.match(css, /@media \(min-width: 576px\)[\s\S]*?\.create-book-form\s*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)/);
  const fullWidth = css.match(/\.create-book-heading,\s*\.create-book-field--title,[\s\S]*?grid-column: 1 \/ -1;/)[0];
  assert.match(fullWidth, /create-book-field--coverImage/);
  assert.match(fullWidth, /create-book-field--isFavorite/);
  assert.doesNotMatch(fullWidth, /create-book-field--genre/);
  assert.match(css, /\.create-book-field--isFavorite \.ant-checkbox\s*\{\s*order: 1;/);
  assert.match(css, /\.create-book-form \.ant-input-number-input\s*\{\s*height: 38px;/);
  assert.match(css, /\.create-book-form \.ant-select-multiple \.ant-select-selection-wrap\s*\{\s*align-self: center;/);
  assert.match(css, /\.create-book-error\s*\{[^}]*display: inline-flex;[^}]*align-items: flex-start;/);
  assert.match(css, /\.create-book-error \.anticon\s*\{[^}]*flex: none;[^}]*height: 1\.4em;/);
  h.unmount();
});

for (const kind of ['create', 'edit']) {
  test(`${kind}: excludes legacy and aggregate ratings from form and mutation payload`, async () => {
    const stored = { title: 'Synthetic', author: 'Author', year: 2000, genre: ['A'], isFavorite: false, rating: 0, reviewAverageRating: 4.25, reviewRatingCount: 2 };
    values = kind === 'create' ? { ...stored } : {}; resets = 0; closed = 0; refreshed = 0; navigated = 0;
    let payload;
    global.fetch = (_url, init) => {
      if (init.method === 'GET') return Promise.resolve(response(JSON.stringify(stored)));
      payload = JSON.parse(init.body);
      return Promise.resolve(response('{"message":"ok"}'));
    };
    const h = harness(kind);
    h.render(); await flush();
    if (kind === 'edit') {
      for (const key of ['rating', 'reviewAverageRating', 'reviewRatingCount']) assert.equal(Object.hasOwn(values, key), false);
      Object.assign(values, { rating: 0, reviewAverageRating: 4.25, reviewRatingCount: 2 });
    }
    const form = find(h.render(), 'form');
    assert.equal(find(form, Controller, (node) => node.props.name === 'rating'), null);
    assert.equal(find(form, 'label', (node) => node.props.htmlFor === 'rating'), null);
    await form.props.onSubmit();
    for (const key of ['rating', 'reviewAverageRating', 'reviewRatingCount']) assert.equal(Object.hasOwn(payload, key), false);
    assert.equal(payload.title, stored.title);
    assert.equal(({ ...stored, ...payload }).rating, 0);
    h.unmount();
  });
}

for (const kind of ['create', 'edit']) {
  test(`${kind}: submit validation is invoked only on the submit event`, async () => {
    values = { title: 'Synthetic title' }; submitFactoryCalls = 0; invalidSubmission = true; submittedEvent = undefined;
    let mutations = 0;
    global.fetch = (_url, init) => {
      if (init.method === 'GET') return Promise.resolve(response(JSON.stringify(values)));
      mutations++; return Promise.resolve(response('{"message":"ok"}'));
    };
    const h = harness(kind);
    const originalLog = console.log;
    const errors = [];
    try {
      h.render(); await flush();
      const tree = h.render();
      assert.equal(submitFactoryCalls, 0);
      console.log = (value) => errors.push(value);
      const event = { synthetic: true };
      await find(tree, 'form').props.onSubmit(event);
      assert.equal(submitFactoryCalls, 1);
      assert.equal(submittedEvent, event);
      assert.deepEqual(errors, [{ title: 'invalid' }]);
      assert.equal(mutations, 0);
      assert.deepEqual(values, { title: 'Synthetic title' });
    } finally {
      console.log = originalLog; invalidSubmission = false; h.unmount();
    }
  });
}

for (const kind of ['create', 'edit']) {
  test(`${kind}: failures preserve values, pending blocks duplicates, and confirmed success completes`, async () => {
    messages.length = 0; resets = 0; closed = 0; refreshed = 0; navigated = 0;
    values = { title: 'Synthetic title', author: 'Synthetic author', year: 2000, genre: ['A'], isFavorite: false };
    const initial = { ...values };
    let calls = 0;
    let finish;
    global.fetch = (_url, init) => {
      if (init.method === 'GET') return Promise.resolve(response(JSON.stringify(initial)));
      calls++;
      return new Promise((resolve, reject) => { finish = { resolve, reject }; });
    };
    const h = harness(kind);
    h.render(); await flush();
    let tree = h.render();
    const submit = find(tree, 'form').props.onSubmit;
    const request = submit();
    await submit();
    assert.equal(calls, 1);
    tree = h.render();
    assert.equal(find(tree, ConfigProvider).props.componentDisabled, true);
    assert.equal(find(tree, Button, (button) => button.props.htmlType === 'submit').props.disabled, true);
    if (kind === 'create') {
      assert.equal(find(tree, Modal).props.maskClosable, false);
      assert.equal(find(tree, Modal).props.keyboard, false);
      find(tree, Modal).props.onCancel();
      assert.equal(closed, 0);
    }
    finish.reject(new Error('network')); await request;
    assert.deepEqual(values, initial);
    assert.equal(resets + closed + refreshed + navigated, 0);
    assert.match(messages.at(-1)[1], /No se pudo confirmar/);
    assert.equal(find(h.render(), ConfigProvider).props.componentDisabled, false);

    for (const body of ['not json', 'null', '{}', '{"message":null}']) {
      const pending = find(h.render(), 'form').props.onSubmit();
      finish.resolve(response(body, kind === 'create' ? 201 : 200)); await pending;
      assert.deepEqual(values, initial);
      assert.equal(resets + closed + refreshed + navigated, 0);
      assert.match(messages.at(-1)[1], /No se pudo confirmar/);
    }
    const error = find(h.render(), 'form').props.onSubmit();
    finish.resolve(response('{"error":"No se pudo guardar"}', 400)); await error;
    assert.deepEqual(values, initial);
    assert.equal(messages.at(-1)[1], 'No se pudo guardar');
    assert.equal(resets + closed + refreshed + navigated, 0);
    assert.equal(find(h.render(), ConfigProvider).props.componentDisabled, false);
    assert.equal(find(h.render(), Button, (button) => button.props.htmlType === 'submit').props.disabled, false);

    const success = find(h.render(), 'form').props.onSubmit();
    finish.resolve(response('{"message":""}', kind === 'create' ? 201 : 200)); await success;
    assert.equal(messages.at(-1)[0], 'success');
    assert.match(messages.at(-1)[1], /exitosamente/);
    assert.equal(calls, 7);
    if (kind === 'create') assert.deepEqual([resets, closed, refreshed, navigated], [1, 1, 1, 0]);
    else {
      assert.deepEqual([resets, closed, refreshed, navigated], [0, 0, 0, 1]);
      const navigating = h.render();
      assert.equal(find(navigating, ConfigProvider).props.componentDisabled, true);
      assert.equal(find(navigating, Button, (button) => button.props.htmlType === 'submit').props.disabled, true);
      await find(navigating, 'form').props.onSubmit();
      assert.equal(calls, 7);
      assert.equal(navigated, 1);
    }
    h.unmount();
  });
}

for (const kind of ['create', 'edit']) {
  test(`${kind}: confirmed success preserves the server message`, async () => {
    messages.length = 0; resets = 0; closed = 0; refreshed = 0; navigated = 0;
    values = { title: 'Synthetic title' };
    global.fetch = (_url, init) => Promise.resolve(init.method === 'GET'
      ? response(JSON.stringify(values))
      : response('{"message":"Mensaje confirmado"}', kind === 'create' ? 201 : 200));
    const h = harness(kind); h.render(); await flush();
    await find(h.render(), 'form').props.onSubmit();
    assert.deepEqual(messages.at(-1), ['success', 'Mensaje confirmado']);
    if (kind === 'create') assert.deepEqual([resets, closed, refreshed, navigated], [1, 1, 1, 0]);
    else assert.deepEqual([resets, closed, refreshed, navigated], [0, 0, 0, 1]);
    h.unmount();
  });
}

test('edit ignores a mutation response after unmount', async () => {
  messages.length = 0; navigated = 0;
  values = { title: 'Synthetic title' };
  let finish;
  global.fetch = (_url, init) => init.method === 'GET'
    ? Promise.resolve(response(JSON.stringify(values)))
    : new Promise((resolve) => { finish = resolve; });
  const h = harness('edit'); h.render(); await flush();
  const request = find(h.render(), 'form').props.onSubmit();
  h.unmount(); finish(response('{"message":"ok"}')); await request;
  assert.equal(navigated, 0);
  assert.deepEqual(messages, []);
});
