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
    if (request === './user-panel') return { __esModule: true, default: 'user-panel' };
  }
  return load.call(this, request, parent, ...args);
};
const HomePage = require('../components/home.tsx').default;
const Navbar = require('../components/navbar.tsx').default;
Module._load = load;

test('navigation keeps the application name and actions without a beta badge', () => {
  const nav = Navbar();
  const [brand, actions] = nav.props.children;
  assert.equal(nav.type, 'nav');
  assert.equal(brand.props.children.props.children, 'ReadStack');
  assert.equal(actions.props.className, 'library-nav-actions');
});

test('root metadata uses the ReadStack name and description', () => {
  const source = fs.readFileSync(path.join(__dirname, '../app/layout.tsx'), 'utf8');
  const file = ts.createSourceFile('layout.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = file.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => statement.declarationList.declarations)
    .find((item) => item.name.getText(file) === 'metadata');
  assert.ok(declaration && ts.isObjectLiteralExpression(declaration.initializer));
  const values = Object.fromEntries(declaration.initializer.properties.map((property) => {
    assert.ok(ts.isPropertyAssignment(property) && ts.isStringLiteral(property.initializer));
    return [property.name.getText(file), property.initializer.text];
  }));
  assert.equal(values.title, 'ReadStack');
  assert.equal(values.description, 'ReadStack es una aplicación para catalogar, organizar y reseñar tus libros. Construye tu biblioteca personal y lleva un registro de tus lecturas.');
});

test('library heading precedes the filters without the obsolete beta notice', () => {
  const original = React.useState;
  React.useState = () => [false, () => {}];
  try {
    const main = HomePage().props.children.props.children[1];
    const [heading, filters, collection] = main.props.children;
    assert.equal(heading.type, 'h1');
    assert.equal(filters.type, './filters');
    assert.equal(collection.type, 'section');
  } finally {
    React.useState = original;
  }
});

test('navigation branding continues to wrap', () => {
  const css = fs.readFileSync(path.join(__dirname, '../app/globals.css'), 'utf8');
  assert.match(css, /\.library-brand\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.doesNotMatch(css, /\.library-beta-(?:badge|notice)\s*\{/);
});
