const { test } = require('node:test');
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

const Button = () => null;
const router = { replace: (value) => destinations.push(value) };
let destinations, verify, login, saved;
const load = Module._load;
Module._load = function (request, parent, ...args) {
  if (parent?.filename.endsWith('/app/login/page.tsx')) {
    if (request === '@/services/login-session') return { verifyLoginSession: (signal) => verify(signal) };
    if (request === '@/services/login.service') return { loginUser: (...args) => login(...args) };
    if (request === '@/utils/cookies-handlers') return { setToken: (value) => { saved = value; } };
    if (request === '@/context/message.context') return { useMessage: () => ({ error() {} }) };
    if (request === 'next/navigation') return { useRouter: () => router };
    if (request === 'react-hook-form') return { useForm: () => ({ handleSubmit: (handler) => handler, control: {}, formState: { errors: {} } }), Controller: () => null };
    if (request === 'antd') return { Button, Input: { Password: () => null } };
  }
  return load.call(this, request, parent, ...args);
};
const Login = require('../app/login/page.tsx').default;

function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of React.Children.toArray(node.props?.children)) {
    const found = find(child, predicate);
    if (found) return found;
  }
  return null;
}

function harness() {
  const states = [];
  let cursor = 0, effect, cleanup;
  React.useState = (initial) => {
    const index = cursor++;
    if (!(index in states)) states[index] = initial;
    return [states[index], (value) => { states[index] = value; }];
  };
  React.useRef = (initial) => {
    const index = cursor++;
    if (!(index in states)) states[index] = { current: initial };
    return states[index];
  };
  React.useCallback = (fn) => fn;
  React.useEffect = (fn) => { if (!cleanup) effect = fn; };
  return {
    render() { cursor = 0; return Login(); },
    mount() { cleanup = effect(); },
    unmount() { cleanup(); },
  };
}

test('login checks session, redirects safely, and provides recovery and replace navigation', async () => {
  const original = { useState: React.useState, useRef: React.useRef, useCallback: React.useCallback, useEffect: React.useEffect, window: global.window };
  const listeners = new Map();
  global.window = { location: { search: '?returnTo=%2Fbook%2F123%3Ftab%3Dx' }, setTimeout, clearTimeout,
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name) => listeners.delete(name) };
  destinations = [];
  saved = undefined;
  let resolveCheck;
  verify = () => new Promise((resolve) => { resolveCheck = resolve; });
  login = async () => [undefined, 'synthetic'];
  try {
    const app = harness();
    let tree = app.render();
    assert.equal(find(tree, (node) => node.type === 'form').props.style.display, 'none');
    app.mount();
    resolveCheck('unavailable');
    await new Promise(setImmediate);
    tree = app.render();
    assert.ok(find(tree, (node) => node.props?.role === 'alert'));
    find(tree, (node) => node.type === Button && node.props.children === 'Reintentar').props.onClick();
    resolveCheck('authenticated');
    await new Promise(setImmediate);
    assert.deepEqual(destinations, ['/book/123?tab=x']);
    listeners.get('pageshow')({ persisted: true });
    resolveCheck('anonymous');
    await new Promise(setImmediate);
    tree = app.render();
    assert.equal(find(tree, (node) => node.type === 'form').props.style.display, undefined);
    global.window.location.search = '?returnTo=%2F%2Fevil.test';
    await find(tree, (node) => node.type === 'form').props.onSubmit({});
    assert.equal(saved, 'synthetic');
    assert.deepEqual(destinations, ['/book/123?tab=x', '/']);
    app.unmount();
  } finally {
    Object.assign(React, { useState: original.useState, useRef: original.useRef, useCallback: original.useCallback, useEffect: original.useEffect });
    global.window = original.window;
  }
});

test('a timed-out or unmounted check cannot redirect and leaves a usable fallback', async () => {
  const original = { useState: React.useState, useRef: React.useRef, useCallback: React.useCallback, useEffect: React.useEffect, window: global.window };
  let timeout, resolveCheck;
  global.window = { location: { search: '?returnTo=%2Fbook%2F123' },
    setTimeout: (fn) => { timeout = fn; return 1; }, clearTimeout() {}, addEventListener() {}, removeEventListener() {} };
  destinations = [];
  verify = () => new Promise((resolve) => { resolveCheck = resolve; });
  try {
    const app = harness();
    app.render();
    app.mount();
    timeout();
    let tree = app.render();
    assert.ok(find(tree, (node) => node.props?.role === 'alert'));
    resolveCheck('authenticated');
    await new Promise(setImmediate);
    assert.deepEqual(destinations, []);
    find(tree, (node) => node.type === Button && node.props.children === 'Iniciar sesión').props.onClick();
    tree = app.render();
    assert.equal(find(tree, (node) => node.type === 'form').props.style.display, undefined);
    app.unmount();

    const second = harness();
    second.render();
    second.mount();
    second.unmount();
    resolveCheck('authenticated');
    await new Promise(setImmediate);
    assert.deepEqual(destinations, []);
  } finally {
    Object.assign(React, { useState: original.useState, useRef: original.useRef, useCallback: original.useCallback, useEffect: original.useEffect });
    global.window = original.window;
  }
});
