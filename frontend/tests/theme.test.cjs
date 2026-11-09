const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');

const layout = fs.readFileSync(path.join(__dirname, '../app/layout.tsx'), 'utf8');
const script = layout.match(/const themeBootstrap = `([^`]+)`;/)[1];

function bootstrap(stored, prefersDark, storageThrows = false) {
  const classes = new Set();
  const attributes = new Set();
  let timeout;
  const root = {
    classList: { toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name) },
    setAttribute: (name) => attributes.add(name),
    removeAttribute: (name) => attributes.delete(name),
  };
  vm.runInNewContext(script, {
    document: { documentElement: root },
    localStorage: { getItem: () => { if (storageThrows) throw Error('blocked'); return stored; } },
    window: { matchMedia: () => ({ matches: prefersDark }) },
    setTimeout: (callback) => { timeout = callback; },
  });
  return { classes, attributes, timeout };
}

test('bootstrap preserves stored preference and system fallback', () => {
  for (const [stored, system, expected] of [['dark', false, true], ['light', true, false], [null, true, true], [null, false, false], ['invalid', true, false]]) {
    assert.equal(bootstrap(stored, system).classes.has('dark'), expected);
  }
  assert.equal(bootstrap(null, true, true).classes.has('dark'), true);
});

test('hydration guard has a fail-open timeout', () => {
  const result = bootstrap('dark', false);
  assert.equal(result.attributes.has('data-theme-pending'), true);
  result.timeout();
  assert.equal(result.attributes.has('data-theme-pending'), false);
});

test('provider switches document class, persistence, and Ant Design algorithm together', () => {
  const source = fs.readFileSync(path.join(__dirname, '../context/theme.context.tsx'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = new Module(path.join(__dirname, '../context/theme-test.cjs'));
  module.filename = path.join(__dirname, '../context/theme-test.cjs');
  module.paths = Module._nodeModulePaths(path.dirname(module.filename));
  module._compile(compiled, module.filename);
  const oldState = React.useState, oldEffect = React.useEffect;
  const oldDocument = global.document, oldStorage = global.localStorage;
  let state = 'light', stored, dark = false;
  React.useState = () => [state, (value) => { state = value; }];
  React.useEffect = () => {};
  global.document = { documentElement: { classList: { toggle: (_, value) => { dark = value; } } } };
  global.localStorage = { setItem: (_, value) => { stored = value; } };
  try {
    let tree = module.exports.ThemeProvider({ children: null });
    assert.equal(tree.props.children.props.theme.algorithm, require('antd').theme.defaultAlgorithm);
    tree.props.value.toggleTheme();
    tree = module.exports.ThemeProvider({ children: null });
    assert.equal(state, 'dark');
    assert.equal(dark, true);
    assert.equal(stored, 'dark');
    assert.equal(tree.props.children.props.theme.algorithm, require('antd').theme.darkAlgorithm);
    tree.props.value.toggleTheme();
    assert.equal(state, 'light');
    assert.equal(dark, false);
    assert.equal(stored, 'light');
  } finally {
    React.useState = oldState; React.useEffect = oldEffect;
    global.document = oldDocument; global.localStorage = oldStorage;
  }
});
