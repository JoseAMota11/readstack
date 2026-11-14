const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');

const root = path.resolve(__dirname, '..');
const original = { load: Module._load, state: React.useState, effect: React.useEffect, ref: React.useRef, id: React.useId, document: global.document, Node: global.Node, window: global.window };
const Button = () => null;
let theme = 'light', toggles = 0;
require.extensions['.tsx'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText, filename);
};
Module._load = function (request, parent, ...args) {
  if (request === '@/context/theme.context') return { useTheme: () => ({ theme, toggleTheme: () => { toggles++; theme = theme === 'light' ? 'dark' : 'light'; } }) };
  if (request === 'antd') return { Button };
  return original.load.call(this, request, parent, ...args);
};
const UserPanel = require('../components/user-panel.tsx').default;
Module._load = original.load;
after(() => { Object.assign(React, { useState: original.state, useEffect: original.effect, useRef: original.ref, useId: original.id }); global.document = original.document; global.Node = original.Node; global.window = original.window; });

function harness() {
  theme = 'light'; toggles = 0;
  const states = [false, false];
  let cursor, logout = 0, focused = 0, effects, cleanup, closeTimeout;
  const listeners = new Map();
  const inside = new (class {})();
  global.Node = inside.constructor;
  global.document = {
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: (name) => listeners.delete(name),
  };
  global.window = {
    setTimeout: (callback) => { closeTimeout = callback; return 1; },
    clearTimeout: () => { closeTimeout = undefined; },
  };
  React.useState = () => {
    const index = cursor++;
    return [states[index], (value) => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
  };
  let refs;
  React.useRef = () => refs.shift();
  React.useId = () => 'panel-id';
  React.useEffect = (callback) => { effects.push(callback); };
  return {
    render() {
      cursor = 0; effects = [];
      refs = [{ current: { contains: (target) => target === inside } }, { current: { focus: () => focused++ } }];
      return UserPanel({ onLogout: () => logout++ });
    },
    installEffect() { cleanup?.(); cleanup = effects[0](); },
    installCloseEffect() { return effects[1](); },
    finishCloseTimeout() { closeTimeout?.(); },
    event(name, event) { listeners.get(name)?.(event); },
    inside,
    get focused() { return focused; },
    get logout() { return logout; },
    cleanup() { cleanup?.(); },
  };
}

function parts(tree) {
  const [trigger, panel] = React.Children.toArray(tree.props.children);
  return { trigger, panel, toggle: panel?.props.children[0].props.children[1], logout: panel?.props.children[1] };
}

test('user panel labels its switch, stays open on theme change, and retains logout', () => {
  const h = harness();
  let p = parts(h.render());
  assert.equal(p.trigger.props['aria-label'], 'Menú de usuario');
  assert.equal(p.trigger.props['aria-expanded'], false);
  p.trigger.props.onClick();
  p = parts(h.render());
  assert.equal(p.trigger.props['aria-expanded'], true);
  assert.equal(p.trigger.props['aria-controls'], p.panel.props.id);
  assert.equal(p.toggle.props.role, 'switch');
  assert.equal(p.toggle.props['aria-label'], 'Modo oscuro');
  assert.equal(p.toggle.props['aria-checked'], false);
  p.toggle.props.onClick();
  p = parts(h.render());
  assert.equal(toggles, 1);
  assert.equal(p.trigger.props['aria-expanded'], true);
  assert.equal(p.toggle.props['aria-checked'], true);
  p.toggle.props.onClick();
  p = parts(h.render());
  assert.equal(toggles, 2);
  assert.equal(p.trigger.props['aria-expanded'], true);
  assert.equal(p.toggle.props['aria-checked'], false);
  p.logout.props.onClick();
  assert.equal(h.logout, 1);
});

test('outside pointer dismisses and Escape dismisses with trigger focus', () => {
  const h = harness();
  parts(h.render()).trigger.props.onClick();
  h.render(); h.installEffect();
  h.event('pointerdown', { target: h.inside });
  assert.equal(parts(h.render()).trigger.props['aria-expanded'], true);
  h.event('pointerdown', { target: new global.Node() });
  let closing = parts(h.render());
  assert.equal(closing.trigger.props['aria-expanded'], false);
  assert.equal(closing.panel.props['data-state'], 'closing');
  assert.equal(closing.panel.props.inert, true);
  assert.equal(closing.panel.props['aria-hidden'], true);
  const panelNode = {};
  closing.panel.props.onTransitionEnd({ propertyName: 'opacity', target: panelNode, currentTarget: panelNode });
  assert.equal(parts(h.render()).panel, undefined);
  parts(h.render()).trigger.props.onClick();
  h.render(); h.installEffect();
  h.event('keydown', { key: 'Escape' });
  assert.equal(parts(h.render()).trigger.props['aria-expanded'], false);
  assert.equal(h.focused, 1);
  h.cleanup();
});

test('reopening while closing ignores a stale exit transition', () => {
  const h = harness();
  parts(h.render()).trigger.props.onClick();
  parts(h.render()).trigger.props.onClick();
  let p = parts(h.render());
  assert.equal(p.panel.props['data-state'], 'closing');
  p.trigger.props.onClick();
  p = parts(h.render());
  const panelNode = {};
  p.panel.props.onTransitionEnd({ propertyName: 'opacity', target: panelNode, currentTarget: panelNode });
  assert.equal(parts(h.render()).panel.props['data-state'], 'open');
});

test('close timeout removes the inert panel when no transition event occurs', () => {
  const h = harness();
  parts(h.render()).trigger.props.onClick();
  parts(h.render()).trigger.props.onClick();
  assert.equal(parts(h.render()).panel.props.inert, true);
  const cancel = h.installCloseEffect();
  h.finishCloseTimeout();
  assert.equal(parts(h.render()).panel, undefined);
  cancel();
});

test('panel styles preserve focus and respect reduced motion', () => {
  const css = fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8');
  assert.match(css, /user-panel-switch:focus-visible/);
  assert.match(css, /user-panel-switch\[aria-checked='true'\] .user-panel-switch-thumb/);
  assert.match(css, /user-panel-switch-icon svg\s*\{\s*width:\s*1rem;\s*height:\s*1rem/);
  assert.match(css, /transition:\s*opacity 200ms ease, transform 200ms ease/);
  assert.match(css, /@starting-style\s*\{\s*\.user-panel\[data-state='open'\]/);
  assert.match(css, /user-panel-logout\.ant-btn:not\(:disabled\):hover/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\.user-panel\s*\{\s*transition:\s*none/s);
  assert.match(css, /user-panel-switch-thumb\s*\{\s*transition:\s*none/);
});

test('navbar logout retains cookie removal, navigation and feedback order', () => {
  const calls = [];
  Module._load = function (request, parent, ...args) {
    if (request === '@/context/message.context') return { useMessage: () => ({ info: (message) => calls.push(['message', message]) }) };
    if (request === '@/utils/cookies-handlers') return { removeToken: () => calls.push(['remove']) };
    if (request === 'next/navigation') return { useRouter: () => ({ push: (route) => calls.push(['navigate', route]) }) };
    if (request === './user-panel') return { __esModule: true, default: () => null };
    return original.load.call(this, request, parent, ...args);
  };
  let Navbar;
  try { Navbar = require('../components/navbar.tsx').default; } finally { Module._load = original.load; }
  const navbar = Navbar();
  navbar.props.children[1].props.children.props.onLogout();
  assert.deepEqual(calls, [['remove'], ['navigate', '/login'], ['message', 'Cierre de sesión satisfactorio.']]);
});
