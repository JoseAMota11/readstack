const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('authentication validation messages use the readable helper text size', () => {
  const css = fs.readFileSync(path.join(__dirname, '../app/globals.css'), 'utf8');
  assert.match(css, /\.auth-error\s*\{[^}]*font-size:\s*0\.875rem\s*;/);
});
