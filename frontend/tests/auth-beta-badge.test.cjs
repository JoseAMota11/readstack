const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

test('shared authentication branding keeps its icon and uses the library beta badge', () => {
  const source = fs.readFileSync(path.join(__dirname, '../components/auth-identity.tsx'), 'utf8');
  const file = ts.createSourceFile('auth-identity.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const brand = source.match(/<div className="auth-brand">([\s\S]*?)<\/div>/)?.[1];
  assert.ok(brand);
  assert.match(brand, /<BookOutlined aria-hidden="true"\s*\/>\s*ReadStack/);
  assert.match(brand, /<span className="library-beta-badge">BETA<\/span>/);
  assert.equal(file.parseDiagnostics.length, 0);

  for (const page of ['login', 'register']) {
    const pageSource = fs.readFileSync(path.join(__dirname, `../app/${page}/page.tsx`), 'utf8');
    assert.match(pageSource, /<AuthIdentity\s*\/>/);
  }
  const css = fs.readFileSync(path.join(__dirname, '../app/globals.css'), 'utf8');
  assert.match(css, /\.auth-brand\s*\{[^}]*flex-wrap:\s*wrap/);
});
