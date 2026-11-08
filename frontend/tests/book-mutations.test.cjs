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
const messages = [];
let values;
let resets;
let closed;
let refreshed;
let navigated;
const setValue = (key, value) => { values[key] = value; };
const ui = { Button, Modal, ConfigProvider, Checkbox: () => null, Input: () => null, InputNumber: () => null, Select: () => null, Spin: () => null };
Module._load = function (request, parent, ...args) {
  if (request === 'antd') return ui;
  if (request === '@/context/message.context') return { useMessage: () => ({ error: (text) => messages.push(['error', text]), success: (text) => messages.push(['success', text]) }) };
  if (request === '@/context/filters.context') return { useFilters: () => ({ refreshData: () => refreshed++ }) };
  if (request === '@/utils/cookies-handlers') return { getTokenDecoded: () => null, getToken: () => 'synthetic', getSessionVersion: () => 0, removeToken() {} };
  if (request === 'next/navigation') return { useParams: () => ({ id: 'book-a' }), useRouter: () => ({ replace: () => navigated++ }) };
  if (request === 'react-hook-form') return { Controller: () => null, useForm: () => ({ control: {}, formState: { errors: {} }, handleSubmit: (valid) => () => valid({ ...values }), reset: () => { resets++; values = {}; }, setValue }) };
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
function find(element, type) {
  if (!element || typeof element !== 'object') return null;
  if (element.type === type) return element;
  for (const child of React.Children.toArray(element.props?.children)) {
    const result = find(child, type); if (result) return result;
  }
  return null;
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
const response = (body, status = 200) => new Response(body, { status, headers: { 'Content-Type': 'application/json' } });

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
    assert.equal(find(tree, Button).props.disabled, true);
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
    assert.equal(find(h.render(), Button).props.disabled, false);

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
      assert.equal(find(navigating, Button).props.disabled, true);
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
