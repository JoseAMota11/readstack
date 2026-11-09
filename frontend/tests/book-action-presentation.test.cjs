const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { Button } = require('antd');

test('mobile action rule targets Ant Design’s direct label span without hiding its icon', () => {
  const html = renderToStaticMarkup(React.createElement(Button, {
    className: 'book-detail-action',
    'aria-label': 'Exportar libro',
    icon: React.createElement('i', null, 'icon'),
  }, React.createElement('span', { className: 'book-detail-action-label' }, 'Exportar')));
  assert.match(html, /aria-label="Exportar libro"/);
  assert.match(html, /class="ant-btn-icon"/);
  assert.match(html, /<span class="book-detail-action-label">Exportar<\/span><\/button>/);
  const css = fs.readFileSync(path.join(__dirname, '../app/globals.css'), 'utf8');
  assert.match(css, /@media \(max-width: 47\.999rem\)[\s\S]*?\.book-detail-actions \.book-detail-action > \.book-detail-action-label\s*\{\s*display:\s*none;/);
});
