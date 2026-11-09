const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');

// Handler-level hook harness: no DOM, real React lifecycle, Ant Design, or browser download.
const root = path.resolve(__dirname, '..');
const original = { resolve: Module._resolveFilename, load: Module._load, state: React.useState, ref: React.useRef, effect: React.useEffect, window: global.window, document: global.document };
Module._resolveFilename = function (request, ...args) {
  return original.resolve.call(this, request.startsWith('@/') ? path.join(root, request.slice(2)) : request, ...args);
};
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename);
};
const Button = () => null;
const Modal = () => null;
const messages = [];
const navigations = [];
let calls = [];
let finish;
let book;
let response;
const deferred = (kind, ...args) => { calls.push([kind, ...args]); return new Promise((resolve, reject) => { finish = { resolve, reject }; }); };
const service = { getOneBook: (...args) => deferred('get', ...args), updateBook: (...args) => deferred('favorite', ...args), deleteBook: (...args) => deferred('delete', ...args), exportBookCSV: (...args) => deferred('export', ...args) };
Module._load = function (request, parent, ...args) {
  if (request === 'antd') return { Button, Modal, Spin: () => null, Tag: () => null, Tooltip: () => null };
  if (request === '@/services/book.service') return service;
  if (request === '@/context/message.context') return { useMessage: () => ({ error: (s) => messages.push(['error', s]), success: (s) => messages.push(['success', s]), info: (s) => messages.push(['info', s]) }) };
  if (request === 'next/navigation') return { usePathname: () => '/book/a', useRouter: () => ({ push: (s) => navigations.push(s), replace: (s) => navigations.push(s) }) };
  if (request === '@/components/reviews' || request === '@/components/image-placeholder') return { __esModule: true, default: () => null };
  if (request === './authenticated-fetch') return { authenticatedFetch: async () => { if (response instanceof Error) throw response; return response; }, responseError: async () => 'HTTP error' };
  return original.load.call(this, request, parent, ...args);
};
global.window = { location: { pathname: '/book/a' } };
const actualService = require('../services/book.service.ts');
after(() => { Module._resolveFilename = original.resolve; Module._load = original.load; React.useState = original.state; React.useRef = original.ref; React.useEffect = original.effect; global.window = original.window; global.document = original.document; });

function harness() {
  calls = []; messages.length = 0; navigations.length = 0; global.window.location.pathname = '/book/a';
  book = { id: 'a', title: 'Synthetic', genre: [], isFavorite: false };
  const slots = []; let cursor = 0; let effects = [];
  React.useState = (initial) => { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (v) => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; };
  React.useRef = (initial) => { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; };
  React.useEffect = (effect) => { const i = cursor++; if (!slots[i]) effects.push(() => { slots[i] = { cleanup: effect() }; }); };
  // Extract the ActionBar through the loaded detail render without using its loading hooks.
  const detailSource = fs.readFileSync(path.join(root, 'app/book/[id]/page.tsx'), 'utf8');
  assert.match(detailSource, /function ActionBar/);
  const actionModule = new Module(path.join(root, 'app/book/[id]/actions-test.tsx'));
  actionModule.filename = path.join(root, 'app/book/[id]/actions-test.tsx');
  actionModule.paths = Module._nodeModulePaths(path.dirname(actionModule.filename));
  actionModule._compile(ts.transpileModule(detailSource + '\nexport { ActionBar };', { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText, actionModule.filename);
  const ActionBar = actionModule.exports.ActionBar;
  return {
    render() { cursor = 0; const tree = ActionBar({ book, setBook: (v) => { book = typeof v === 'function' ? v(book) : v; } }); const pending = effects; effects = []; pending.forEach((f) => f()); return tree; },
    unmount() { slots.forEach((s) => s?.cleanup?.()); },
  };
}
function actions(tree) {
  const children = React.Children.toArray(tree.props.children);
  return { export: children[0], edit: children[1], delete: children[2], confirm: children.find((child) => child.type === Modal), favorite: children[4] };
}

const favoriteStatus = (tree) => React.Children.toArray(tree.props.children).find((child) => child.props?.className === 'book-detail-favorite-status')?.props.children;
const favoriteLabel = (tree) => actions(tree).favorite.props.children.props.children;

test('book actions have explicit names and edit preserves navigation', () => {
  const h = harness(); const a = actions(h.render());
  assert.equal(a.export.props['aria-label'], 'Exportar libro');
  assert.equal(a.edit.props['aria-label'], 'Editar libro');
  assert.equal(a.delete.props['aria-label'], 'Borrar libro');
  assert.equal(a.favorite.props['aria-label'], 'Favorito');
  assert.equal(a.favorite.props['aria-pressed'], false);
  assert.equal(favoriteStatus(h.render()), undefined);
  assert.equal(favoriteLabel(h.render()), 'No favorito');
  a.edit.props.onClick(); assert.deepEqual(navigations, ['/book/a/edit']); h.unmount();
});

test('delete opens a named modal, cancels without deleting, and supports dismissals', () => {
  const h = harness(); let a = actions(h.render());
  assert.equal(a.confirm.type, Modal); assert.equal(a.confirm.props.open, false);
  a.delete.props.onClick(); a = actions(h.render());
  assert.equal(a.confirm.props.open, true); assert.equal(a.confirm.props.title, '¿Borrar este libro?');
  assert.equal(a.confirm.props.cancelButtonProps.autoFocus, true);
  assert.equal(a.confirm.props.destroyOnHidden, true);
  assert.equal(a.confirm.props.focusTriggerAfterClose, true);
  assert.equal(calls.length, 0);
  // Ant Design routes Cancel, Escape and mask dismissal through onCancel.
  for (const dismissal of ['cancel', 'escape', 'mask']) {
    a.confirm.props.onCancel({ type: dismissal });
    assert.equal(actions(h.render()).confirm.props.open, false);
    assert.equal(calls.length, 0);
    actions(h.render()).delete.props.onClick(); a = actions(h.render());
    assert.equal(a.confirm.props.open, true);
  }
  h.unmount();
});

test('delete requires confirmation, blocks duplicates, and navigates only on confirmed success', async () => {
  const h = harness(); actions(h.render()).delete.props.onClick(); let a = actions(h.render());
  const first = a.confirm.props.onOk(); await a.confirm.props.onOk();
  assert.equal(calls.length, 1); assert.equal(actions(h.render()).delete.props.disabled, true);
  assert.equal(actions(h.render()).confirm.props.okButtonProps.disabled, true);
  assert.equal(actions(h.render()).confirm.props.focusTriggerAfterClose, false);
  finish.resolve([undefined, 'Deleted']); await first;
  assert.deepEqual(navigations, ['/']); assert.deepEqual(messages.at(-1), ['success', 'Deleted']);
  assert.equal(actions(h.render()).confirm.props.open, false);
  await actions(h.render()).confirm.props.onOk(); assert.equal(calls.length, 1); h.unmount();
});

test('delete reports HTTP, malformed and network uncertainty, and never redirects after departure', async () => {
  const h = harness();
  for (const value of [['error', undefined], [undefined, undefined], new Error('network')]) {
    actions(h.render()).delete.props.onClick();
    const p = actions(h.render()).confirm.props.onOk();
    if (value instanceof Error) finish.reject(value); else finish.resolve(value);
    await p; assert.match(messages.at(-1)[1], /No se pudo confirmar/); assert.deepEqual(navigations, []);
    assert.equal(actions(h.render()).confirm.props.open, false);
  }
  actions(h.render()).delete.props.onClick();
  const p = actions(h.render()).confirm.props.onOk(); global.window.location.pathname = '/other'; h.unmount();
  finish.resolve([undefined, 'Deleted']); await p; assert.deepEqual(navigations, []);
});

test('pending dismissal does not abort deletion or close a later opening', async () => {
  const h = harness(); actions(h.render()).delete.props.onClick();
  const p = actions(h.render()).confirm.props.onOk();
  actions(h.render()).confirm.props.onCancel();
  assert.equal(actions(h.render()).confirm.props.open, false);
  actions(h.render()).delete.props.onClick();
  assert.equal(actions(h.render()).confirm.props.open, false);
  assert.equal(calls.length, 1);
  finish.reject(new Error('network')); await p;
  assert.match(messages.at(-1)[1], /No se pudo confirmar/);
  actions(h.render()).delete.props.onClick();
  assert.equal(actions(h.render()).confirm.props.open, true); h.unmount();
});

test('favorite toggles confirmed state, blocks concurrent actions and locks uncertain state', async () => {
  const h = harness(); let a = actions(h.render());
  const p = a.favorite.props.onClick(); await a.favorite.props.onClick();
  assert.equal(calls.length, 1); assert.equal(actions(h.render()).favorite.props.disabled, true);
  finish.resolve([undefined, 'ok']); await p; assert.equal(book.isFavorite, true);
  assert.equal(actions(h.render()).favorite.props['aria-pressed'], true);
  assert.equal(favoriteStatus(h.render()), undefined);
  assert.equal(favoriteLabel(h.render()), 'Favorito');
  const q = actions(h.render()).favorite.props.onClick(); assert.equal(calls.at(-1)[2].isFavorite, false);
  finish.reject(new Error('network')); await q;
  assert.equal(book.isFavorite, true); assert.match(messages.at(-1)[1], /Recarga/);
  const uncertain = h.render();
  assert.equal(actions(uncertain).favorite.props.disabled, true);
  assert.equal(actions(uncertain).favorite.props['aria-label'], 'Favorito');
  assert.equal(actions(uncertain).favorite.props['aria-pressed'], undefined);
  assert.equal(favoriteLabel(uncertain), 'Favorito');
  assert.equal(favoriteStatus(uncertain), 'Estado sin confirmar');
  const status = React.Children.toArray(uncertain.props.children).find((child) => child.type === React.Fragment).props.children[0];
  assert.equal(status.props.role, 'status'); assert.match(status.props.children, /No se pudo confirmar.*Recarga/);
  h.unmount();
});

test('favorite handles HTTP and malformed responses without claiming success', async () => {
  for (const result of [['error', undefined], [undefined, undefined]]) {
    const h = harness(); const p = actions(h.render()).favorite.props.onClick(); finish.resolve(result); await p;
    assert.equal(book.isFavorite, false); assert.equal(messages.at(-1)[0], 'error'); h.unmount();
  }
});

test('late favorite response does not update an abandoned view', async () => {
  const h = harness(); const p = actions(h.render()).favorite.props.onClick();
  global.window.location.pathname = '/book/b'; h.unmount();
  finish.resolve([undefined, 'ok']); await p;
  assert.equal(book.isFavorite, false); assert.deepEqual(messages, []);
});

const recoveryButton = (tree) => React.Children.toArray(tree.props.children).find((child) => child.type === React.Fragment).props.children[1];

test('favorite recovery retries only GET after failure and synchronizes confirmed state', async () => {
  const h = harness(); let reloads = 0;
  global.window.location.reload = () => reloads++;
  const mutation = actions(h.render()).favorite.props.onClick();
  finish.reject(new Error('network')); await mutation;
  let retry = recoveryButton(h.render()).props.onClick();
  await recoveryButton(h.render()).props.onClick();
  assert.deepEqual(calls.map(([kind]) => kind), ['favorite', 'get']);
  assert.equal(recoveryButton(h.render()).props.disabled, true);
  finish.reject(new Error('offline')); await retry;
  assert.equal(book.isFavorite, false); assert.match(messages.at(-1)[1], /No se pudo recargar/);
  assert.equal(actions(h.render()).favorite.props.disabled, true);

  for (const result of [['HTTP error', undefined], [undefined, { id: 'a', isFavorite: true }], [undefined, { id: 'other', isFavorite: true }]]) {
    retry = recoveryButton(h.render()).props.onClick(); finish.resolve(result); await retry;
    assert.equal(actions(h.render()).favorite.props.disabled, true);
    assert.match(messages.at(-1)[1], /No se pudo recargar/);
  }
  retry = recoveryButton(h.render()).props.onClick();
  const refreshed = { id: 'a', title: 'Updated', author: 'Synthetic', year: 2000, genre: ['A'], coverImage: null, rating: null, isFavorite: true, userId: 'u', createdAt: 'date', updatedAt: 'date' };
  finish.resolve([undefined, refreshed]); await retry;
  assert.deepEqual(book, refreshed); assert.equal(actions(h.render()).favorite.props.disabled, false);
  assert.equal(actions(h.render()).favorite.props['aria-pressed'], true);
  assert.equal(favoriteStatus(h.render()), undefined);
  assert.equal(favoriteLabel(h.render()), 'Favorito');
  assert.equal(calls.filter(([kind]) => kind === 'favorite').length, 1);
  assert.equal(reloads, 0); assert.deepEqual(navigations, []); h.unmount();
});

test('late favorite recovery cannot update an abandoned detail view', async () => {
  const h = harness(); const mutation = actions(h.render()).favorite.props.onClick();
  finish.reject(new Error('network')); await mutation;
  const retry = recoveryButton(h.render()).props.onClick();
  global.window.location.pathname = '/book/b'; h.unmount();
  finish.resolve([undefined, { id: 'a', title: 'Updated', author: 'Synthetic', year: 2000, genre: [], isFavorite: true, userId: 'u', createdAt: 'date', updatedAt: 'date' }]); await retry;
  assert.equal(book.isFavorite, false); assert.deepEqual(navigations, []);
});

test('export handler reports failures and blocks duplicate actions', async () => {
  const h = harness(); const a = actions(h.render()); const p = a.export.props.onClick(); await a.export.props.onClick();
  assert.equal(calls.length, 1); finish.reject(new Error('network')); await p;
  assert.match(messages.at(-1)[1], /No se pudo/); h.unmount();
});

test('CSV service accepts nonempty CSV only and cleans up the download', async () => {
  let clicked = 0; let revoked = 0;
  global.window.URL = { createObjectURL: () => 'blob:test', revokeObjectURL: () => revoked++ };
  global.document = { body: { appendChild() {} }, createElement: () => ({ click: () => clicked++, remove() {} }) };
  response = new Error('network'); await assert.rejects(actualService.exportBookCSV('a')); assert.equal(clicked, 0);
  const header = '"id","title","author","year","genre","coverImage","rating","isFavorite","userId","createdAt","updatedAt"';
  const valid = '"a","A, title with ""quotes""\nand a newline","Synthetic author",2000,"A, B","",4,"Sí","user-a","2024-01-01","2024-01-02"';
  for (const [body, status, type] of [['error', 500, 'application/json'], ['<html>', 200, 'text/html'], ['<html>', 200, 'text/csv'], ['', 200, 'text/csv'], ['  ', 200, 'text/csv'], [header + '\nerror', 200, 'text/csv'], [header + '\n"a","Synthetic"', 200, 'text/csv'], [header + '\n' + valid + ',extra', 200, 'text/csv'], [header + '\n' + valid + '\n' + valid, 200, 'text/csv'], [header + '\n' + valid + '\n\n', 200, 'text/csv'], [header + '\n"a","unterminated', 200, 'text/csv'], [header + '\n"a","bad"quote",x,1,x,x,1,x,x,x,x', 200, 'text/csv']]) {
    response = new Response(body, { status, headers: { 'content-type': type } });
    await assert.rejects(actualService.exportBookCSV('a')); assert.equal(clicked, 0);
  }
  response = new Response(header + '\r\n' + valid + '\r\n', { headers: { 'content-type': 'text/csv; charset=utf-8' } });
  await actualService.exportBookCSV('a'); assert.equal(clicked, 1); assert.equal(revoked, 1);
});
