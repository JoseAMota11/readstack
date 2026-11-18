const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { Button } = require('antd');

test('mobile actions retain labels and icons in a responsive grid', () => {
  const html = renderToStaticMarkup(React.createElement(Button, {
    className: 'book-detail-action',
    'aria-label': 'Exportar libro',
    icon: React.createElement('i', null, 'icon'),
  }, React.createElement('span', { className: 'book-detail-action-label' }, 'Exportar')));
  assert.match(html, /aria-label="Exportar libro"/);
  assert.match(html, /class="ant-btn-icon"/);
  assert.match(html, /<span class="book-detail-action-label">Exportar<\/span><\/button>/);
  const css = fs.readFileSync(path.join(__dirname, '../app/globals.css'), 'utf8');
  assert.match(css, /@media \(max-width: 47\.999rem\)[\s\S]*?\.book-detail-actions\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(auto-fit, minmax\(min\(100%, 9rem\), 1fr\)\)/);
  assert.doesNotMatch(css, /\.book-detail-actions \.book-detail-action > \.book-detail-action-label\s*\{[^}]*display:\s*none/);
  assert.match(css, /@media \(max-width: 47\.999rem\)[\s\S]*?\.book-detail-rating\s*\{[^}]*text-align:\s*center/);
  assert.match(css, /\.book-detail-actions \.book-detail-favorite-status,[\s\S]*?grid-column:\s*1 \/ -1/);
});

test('create-book validation text and keyboard focus use readable semantic styles', () => {
  const css = fs.readFileSync(path.join(__dirname, '../app/globals.css'), 'utf8');
  assert.match(css, /\.create-book-error\s*\{[^}]*font-size:\s*0\.875rem/);
  assert.match(css, /\.create-book-modal \.ant-input:focus-visible/);
  assert.match(css, /\.create-book-modal \.ant-input-number:has\(input:focus-visible\)/);
  assert.match(css, /\.create-book-modal \.ant-select:has\(input:focus-visible\) \.ant-select-selector/);
  assert.match(css, /\.create-book-modal \.ant-checkbox-input:focus-visible \+ \.ant-checkbox-inner\s*\{[^}]*outline:\s*2px solid var\(--focus\)/);
});
