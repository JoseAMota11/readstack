const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');

require.extensions['.tsx'] = (module, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
    esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX,
  } });
  module._compile(outputText, filename);
};

const original = { load: Module._load, useState: React.useState, useId: React.useId };
const Input = () => null;
const InputNumber = () => null;
const Select = () => null;
const Button = () => null;
let filters = {};
let updates = [];
let expanded = false;
let modalOpen;
Module._load = function (request, parent, ...args) {
  if (request === 'antd') return { Input, InputNumber, Select, Button };
  if (request === '@/context/filters.context') return { useFilters: () => ({ filters, handleSetFilters: (value) => updates.push(value) }) };
  if (request === '@/books-genres.json') return [];
  return original.load.call(this, request, parent, ...args);
};
const Filters = require('../components/filters.tsx').default;
React.useState = () => [expanded, (value) => { expanded = typeof value === 'function' ? value(expanded) : value; }];
React.useId = () => 'filter-test';
after(() => { Module._load = original.load; React.useState = original.useState; React.useId = original.useId; });

function find(element, predicate) {
  if (!element || typeof element !== 'object') return null;
  if (predicate(element)) return element;
  for (const child of React.Children.toArray(element.props?.children)) {
    const match = find(child, predicate);
    if (match) return match;
  }
  return null;
}
const byId = (tree, id) => find(tree, (element) => element.props?.id === id);
const byType = (tree, type) => find(tree, (element) => element.type === type);
const render = () => Filters({ setOpen: (value) => { modalOpen = value; } });
const toggle = (tree) => find(tree, (element) => element.type === 'button' && element.props['aria-controls']);

test('search and secondary controls have associated Spanish labels', () => {
  const tree = render();
  for (const [suffix, label] of [['title', 'Buscar por título'], ['author', 'Autor'], ['year', 'Año'], ['genre', 'Género']]) {
    const id = `filter-test-${suffix}`;
    assert.ok(byId(tree, id));
    assert.ok(find(tree, (element) => element.type === 'label' && element.props.htmlFor === id && element.props.children === label));
  }
  byType(tree, Button).props.onClick();
  assert.equal(modalOpen, true);
});

test('disclosure toggles expanded state while controls stay mounted', () => {
  expanded = false;
  let tree = render();
  let button = toggle(tree);
  const panelId = button.props['aria-controls'];
  assert.equal(button.props.type, 'button');
  assert.ok(find(button, (element) => element.props?.className === 'library-filters-chevron' && element.props['aria-hidden'] === 'true'));
  updates = [];
  assert.equal(button.props['aria-expanded'], false);
  assert.equal(byId(tree, panelId).props['data-expanded'], false);
  assert.ok(byId(tree, 'filter-test-author'));
  button.props.onClick();
  tree = render();
  button = toggle(tree);
  assert.equal(button.props['aria-expanded'], true);
  assert.equal(byId(tree, panelId).props['data-expanded'], true);
  assert.ok(byId(tree, 'filter-test-genre'));
  button.props.onClick();
  assert.equal(byId(render(), panelId).props['data-expanded'], false);
  assert.ok(byId(render(), 'filter-test-year'));
  assert.deepEqual(updates, []);
});

test('active indication uses applied secondary context values, not pending callbacks or search', () => {
  filters = { title: 'search' }; updates = [];
  let tree = render();
  assert.doesNotMatch(JSON.stringify(toggle(tree)), /Filtros activos/);
  byId(tree, 'filter-test-author').props.onChange({ target: { value: 'pending' } });
  assert.doesNotMatch(JSON.stringify(toggle(render())), /Filtros activos/);
  for (const value of [{ author: 'author' }, { year: 2024 }, { genre: 'genre' }]) {
    filters = value;
    assert.match(JSON.stringify(toggle(render())), /Filtros activos/);
  }
  filters = { author: '', year: null, genre: undefined };
  assert.doesNotMatch(JSON.stringify(toggle(render())), /Filtros activos/);
});

test('filter callbacks retain existing arguments and page reset behavior', () => {
  filters = {}; updates = [];
  const tree = render();
  byId(tree, 'filter-test-title').props.onChange({ target: { value: 'title' } });
  byId(tree, 'filter-test-author').props.onChange({ target: { value: 'author' } });
  byId(tree, 'filter-test-year').props.onChange(2024);
  byId(tree, 'filter-test-year').props.onChange(null);
  byId(tree, 'filter-test-genre').props.onSelect('genre');
  byId(tree, 'filter-test-genre').props.onClear();
  assert.deepEqual(updates, [
    { title: 'title', current: '1' }, { author: 'author', current: '1' },
    { year: 2024, current: '1' }, { year: null, current: '1' },
    { genre: 'genre', current: '1' }, { genre: undefined, current: '1' },
  ]);
});

test('genre select disables virtual scrolling', () => {
  const genre = byId(render(), 'filter-test-genre');
  assert.equal(genre.type, Select);
  assert.equal(genre.props.virtual, false);
});

test('responsive styles hide collapsed controls only on narrow screens', () => {
  const css = fs.readFileSync(path.join(__dirname, '../app/globals.css'), 'utf8');
  assert.match(css, /@media \(max-width: 47\.999rem\)\s*\{[\s\S]*?\.library-filters-panel\s*\{[^}]*grid-template-rows:\s*0fr;[^}]*visibility:\s*hidden;[^}]*transition:\s*grid-template-rows 200ms ease, visibility 0s linear 200ms/);
  assert.match(css, /\.library-filters-panel\[data-expanded='true'\]\s*\{[^}]*grid-template-rows:\s*1fr;[^}]*visibility:\s*visible/);
  assert.match(css, /\.library-filters-clip\s*\{\s*min-height:\s*0;\s*overflow:\s*hidden;/);
  assert.doesNotMatch(css, /\.library-filters-panel\[data-expanded='true'\][^{]*\{[^}]*overflow:/);
  assert.doesNotMatch(css, /\.library-filters-panel\[data-expanded='true'\] \.library-filters-secondary/);
  assert.match(css, /@media \(min-width: 48rem\)\s*\{[\s\S]*?\.library-filters-toggle\s*\{\s*display:\s*none;[\s\S]*?\.library-filters-secondary\s*\{\s*display:\s*grid;/);
  assert.match(css, /\.library-filters-toggle\[aria-expanded='true'\] \.library-filters-chevron\s*\{\s*transform:\s*rotate\(180deg\)/);
  assert.match(css, /\.library-filters-toggle\s*\{[^}]*border-radius:\s*4px;[^}]*background:\s*var\(--surface\);[^}]*border-radius 200ms ease/);
  assert.match(css, /\.library-filters-toggle\[aria-expanded='true'\]\s*\{\s*border-bottom-left-radius:\s*0;\s*border-bottom-right-radius:\s*0;/);
  assert.doesNotMatch(css, /\.library-filters-toggle:hover\s*\{[^}]*background/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.library-filters-panel\[data-expanded='true'\],[\s\S]*?transition:\s*none/);
});

test('search precedes the add action and the secondary filter disclosure', () => {
  const children = React.Children.toArray(render().props.children.props.children);
  assert.equal(children[0].props.className, 'library-filter-field');
  assert.equal(children[1].props.className, 'library-add-action');
  assert.equal(children[2].props.className, 'library-filters-toggle');
  const css = fs.readFileSync(path.join(__dirname, '../app/globals.css'), 'utf8');
  assert.match(css, /\.library-add-action\s*\{[^}]*grid-column:\s*2;[^}]*grid-row:\s*1;/);
  assert.match(css, /\.library-add-action \.ant-btn:focus-visible,[\s\S]*?outline:\s*3px solid var\(--focus\)/);
});
