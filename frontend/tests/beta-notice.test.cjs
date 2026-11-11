const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');

require.extensions['.tsx'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
    esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX,
  } });
  module._compile(outputText, filename);
};

const load = Module._load;
Module._load = function (request, parent, ...args) {
  if (parent?.filename.endsWith('/components/home.tsx')) {
    if (request === '@/context/filters.context') return { FiltersProvider: 'filters-provider' };
    if (request.startsWith('./')) return { __esModule: true, default: request };
  }
  if (parent?.filename.endsWith('/components/navbar.tsx')) {
    if (request === '@/context/message.context') return { useMessage: () => ({}) };
    if (request === '@/utils/cookies-handlers') return { removeToken() {} };
    if (request === 'next/navigation') return { useRouter: () => ({}) };
    if (request === 'antd') return { Button: 'button' };
    if (request === './theme-switcher') return { __esModule: true, default: 'theme-switcher' };
  }
  return load.call(this, request, parent, ...args);
};
const HomePage = require('../components/home.tsx').default;
const Navbar = require('../components/navbar.tsx').default;
Module._load = load;

test('navigation keeps the beta badge alongside the application name and actions', () => {
  const nav = Navbar();
  const [brand, actions] = nav.props.children;
  assert.equal(nav.type, 'nav');
  assert.equal(brand.props.children[0].props.children, 'Biblioteca Personal');
  assert.equal(brand.props.children[1].props.children, 'BETA');
  assert.equal(actions.props.className, 'library-nav-actions');
});

test('library notice is persistent, non-interactive and precedes the filters', () => {
  const original = React.useState;
  React.useState = () => [false, () => {}];
  try {
    const main = HomePage().props.children.props.children[1];
    const [heading, notice, filters] = main.props.children;
    assert.equal(heading.type, 'h1');
    assert.equal(notice.type, 'p');
    assert.match(notice.props.children, /libros y las reseñas guardados podrían perderse/);
    assert.equal(notice.props.className, 'library-beta-notice');
    assert.equal(filters.type, './filters');
  } finally {
    React.useState = original;
  }
});

test('beta presentation uses theme tokens and allows the brand to wrap', () => {
  const css = fs.readFileSync(path.join(__dirname, '../app/globals.css'), 'utf8');
  assert.match(css, /\.library-brand\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(css, /\.library-beta-badge\s*\{[^}]*color:\s*var\(--text-secondary\)/);
  assert.match(css, /\.library-beta-notice\s*\{[^}]*background:\s*var\(--accent-subtle\);[^}]*color:\s*var\(--text-primary\)/);
});
