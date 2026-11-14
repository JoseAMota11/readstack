const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

require.extensions['.tsx'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, filename);
};
const AuthIdentity = require('../components/auth-identity.tsx').default;

test('login and registration share the editorial identity and preserve its copy', () => {
  const login = renderToStaticMarkup(React.createElement(AuthIdentity, { editorial: true }));
  const registration = renderToStaticMarkup(React.createElement(AuthIdentity, { editorial: true }));
  assert.equal(registration, login);
  assert.match(login, /Biblioteca personal/);
  assert.match(login, /class="auth-editorial-rule" aria-hidden="true"/);
  for (const markup of [login, registration]) {
    assert.match(markup, /Tu biblioteca, <br\/>a tu manera\./);
    assert.match(markup, /Catalogar, organizar y reseñar libros en un solo lugar\./);
  }
  const loginPage = fs.readFileSync(path.join(__dirname, '../app/login/page.tsx'), 'utf8');
  const registerPage = fs.readFileSync(path.join(__dirname, '../app/register/page.tsx'), 'utf8');
  assert.match(loginPage, /<AuthIdentity editorial\s*\/>/);
  assert.match(registerPage, /<AuthIdentity editorial\s*\/>/);
});
