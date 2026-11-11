const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('shared authentication hero separates and left-aligns its copy when stacked', () => {
  const hero = fs.readFileSync(path.join(__dirname, '../components/auth-identity.tsx'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../app/globals.css'), 'utf8');
  const responsive = css.match(/@media \(max-width: 767px\)\s*\{([\s\S]*?)\n\}/)?.[1];

  assert.match(hero, /Tu biblioteca,\{' '\}<br\s*\/>a tu manera\./);
  assert.ok(responsive);
  assert.match(responsive, /\.auth-page\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(responsive, /\.auth-identity\s*\{[^}]*padding:\s*1\.5rem/);
  assert.match(css, /\.auth-content-inner\s*\{\s*width:\s*min\(100%,\s*27rem\);\s*\}/);
  assert.match(responsive, /\.auth-identity-copy\s*\{\s*width:\s*min\(100%,\s*27rem\);\s*margin:\s*0 auto;\s*font-size:\s*1rem;\s*\}/);
  assert.match(responsive, /\.auth-content\s*\{[^}]*padding:\s*2rem 1\.5rem 3rem/);
  assert.doesNotMatch(responsive, /text-align:\s*center/);
  assert.match(responsive, /\.auth-statement br\s*\{\s*display:\s*none/);
  assert.doesNotMatch(css.slice(0, css.indexOf('@media (max-width: 767px)')), /\.auth-statement br\s*\{/);
  for (const page of ['login', 'register']) {
    assert.match(fs.readFileSync(path.join(__dirname, `../app/${page}/page.tsx`), 'utf8'), /<AuthIdentity\s*\/>/);
  }
});
