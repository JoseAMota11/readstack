const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const root = path.resolve(__dirname, '..');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  return resolve.call(this, request.startsWith('@/') ? path.join(root, request.slice(2)) : request, ...args);
};
for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => {
    const source = require('node:fs').readFileSync(filename, 'utf8');
    module._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename);
  };
}
const TextArea = () => null, Rate = () => null, Button = () => null, Popconfirm = () => null, Card = () => null;
const services = {};
const messages = [];
const load = Module._load;
Module._load = function (request, parent, ...args) {
  if (parent?.filename.endsWith('/components/reviews.tsx')) {
    if (request === 'antd') return { Input: { TextArea }, Rate, Button };
    if (request === './review-card') return { __esModule: true, default: Card };
    if (request === '@/services/review.service') return services;
    if (request === '@/utils/cookies-handlers') return { getTokenDecoded: () => ({ id: 'user-a', username: 'synthetic' }) };
    if (request === '@/context/message.context') return { useMessage: () => ({ error: (m) => messages.push(['error', m]), success: (m) => messages.push(['success', m]) }) };
  }
  if (parent?.filename.endsWith('/components/review-card.tsx')) {
    if (request === 'antd') return { Button, Popconfirm };
  }
  return load.call(this, request, parent, ...args);
};
const Reviews = require('../components/reviews.tsx').default;
const ReviewCard = require('../components/review-card.tsx').default;
const service = require('../services/review.service.ts');
const originalHooks = { useState: React.useState, useRef: React.useRef, useEffect: React.useEffect, useCallback: React.useCallback };
const originalWindow = global.window, originalStorage = global.sessionStorage, originalFetch = global.fetch;
const flush = () => new Promise((resolve) => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function findAll(element, type) {
  if (!element || typeof element !== 'object') return [];
  return [...(element.type === type ? [element] : []), ...React.Children.toArray(element.props?.children).flatMap((child) => findAll(child, type))];
}
function text(element) {
  if (typeof element === 'string') return element;
  if (!element || typeof element !== 'object') return '';
  return React.Children.toArray(element.props?.children).map(text).join(' ');
}
function button(tree, label) { return findAll(tree, Button).find((item) => text(item).includes(label)); }
function harness() {
  const states = [], cleanups = []; let cursor = 0, mounted = false, effects = [];
  React.useState = (initial) => { const i = cursor++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], (v) => { states[i] = typeof v === 'function' ? v(states[i]) : v; }]; };
  React.useRef = (initial) => { const i = cursor++; if (!(i in states)) states[i] = { current: initial }; return states[i]; };
  React.useCallback = (fn) => fn;
  React.useEffect = (fn) => { if (!mounted) effects.push(fn); };
  return {
    render() { cursor = 0; const tree = Reviews({ bookId: 'book-a' }); if (!mounted) { mounted = true; for (const effect of effects) { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); } effects = []; } return tree; },
    unmount() { cleanups.forEach((cleanup) => cleanup()); },
  };
}
function setup() {
  messages.length = 0;
  const store = new Map();
  global.sessionStorage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: (key) => store.delete(key) };
  global.window = { location: { pathname: '/book/book-a', search: '', assign() {} } };
  services.getAllReviews = async () => [undefined, []];
  services.postReview = async () => [undefined, 'Creada'];
  services.deleteReview = async () => [undefined, 'Borrada'];
  return store;
}
function teardown() { Object.assign(React, originalHooks); global.window = originalWindow; global.sessionStorage = originalStorage; global.fetch = originalFetch; }
const item = { id: 'review-a', comment: 'synthetic', rating: 4, createdAt: 'today' };

test('delete confirmation exposes cancel and invokes deletion only on confirmation', () => {
  const calls = [];
  const tree = ReviewCard({ ...item, onDelete: () => calls.push(1), pending: false, disabled: false });
  const confirm = findAll(tree, Popconfirm)[0];
  assert.equal(confirm.props.cancelText, 'Cancelar');
  assert.equal(calls.length, 0);
  assert.equal(findAll(tree, Button)[0].props['aria-label'], 'Borrar reseña');
  confirm.props.onConfirm();
  assert.equal(calls.length, 1);
});

test('review textarea has a persistent associated label and example placeholder', () => {
  setup();
  const h = harness();
  try {
    const tree = h.render();
    const label = findAll(tree, 'label').find((item) => text(item).includes('Tu reseña'));
    assert.ok(label);
    const textarea = findAll(label, TextArea)[0];
    assert.ok(textarea);
    assert.equal(textarea.props.placeholder, '¡Me encantó este libro!');
    h.unmount();
  } finally { teardown(); }
});

test('rating names the group and stars, reports the actual value and preserves draft updates', async () => {
  const store = setup();
  const h = harness();
  try {
    h.render(); await flush();
    let tree = h.render();
    let rate = findAll(tree, Rate)[0];
    assert.equal(rate.props['aria-label'], 'Calificación de tu reseña');
    assert.match(text(tree), /Sin calificación/);
    const star = React.createElement('li', null, React.createElement('div', { role: 'radio', 'aria-checked': true }));
    let radio = rate.props.characterRender(star, { index: 0 }).props.children;
    assert.equal(radio.props['aria-label'], '1 estrella de 5');
    assert.equal(radio.props['aria-checked'], false);

    rate.props.onChange(4);
    tree = h.render(); rate = findAll(tree, Rate)[0];
    assert.equal(rate.props.value, 4);
    assert.match(text(tree), /4 de 5 estrellas/);
    assert.equal(JSON.parse(store.get('review-draft:user-a:book-a')).draft.rating, 4);
    for (let index = 0; index < 5; index++) {
      radio = rate.props.characterRender(star, { index }).props.children;
      assert.equal(radio.props['aria-checked'], index === 3);
      assert.equal(radio.props['aria-label'], `${index + 1} ${index === 0 ? 'estrella' : 'estrellas'} de 5`);
    }
    const html = require('react-dom/server').renderToStaticMarkup(React.createElement(require('antd').Rate, rate.props));
    assert.match(html, /aria-label="Calificación de tu reseña"/);
    assert.equal((html.match(/aria-checked="true"/g) || []).length, 1);
    assert.match(html, /aria-label="4 estrellas de 5"/);
    rate.props.onChange(0);
    assert.match(text(h.render()), /Sin calificación/);
    assert.equal(JSON.parse(store.get('review-draft:user-a:book-a')).draft.rating, 0);
  } finally { h.unmount(); teardown(); }
});

test('review rating styles scope selected, outlined, hover and focus states', () => {
  const css = require('node:fs').readFileSync(path.join(root, 'app/globals.css'), 'utf8');
  assert.match(css, /\.review-rating \.ant-rate \.ant-rate-star\s*\{[^}]*color: var\(--gold\)/);
  assert.match(css, /\.review-rating \.ant-rate \.ant-rate-star-zero \.ant-rate-star-second svg\s*\{[^}]*fill: none;[^}]*stroke: currentColor/);
  assert.match(css, /\.review-rating \.ant-rate:hover \.ant-rate-star-full\s*\{[^}]*color: var\(--accent-hover\)/);
  assert.match(css, /\.review-rating \.ant-rate:focus-visible,[\s\S]*?outline: 3px solid var\(--focus\)/);
});

test('creation blocks rapid duplicates, shows pending and preserves later edits', async () => {
  setup(); const post = deferred(); let calls = 0;
  services.postReview = () => { calls++; return post.promise; };
  const h = harness(); try {
    h.render(); await flush(); let tree = h.render();
    findAll(tree, TextArea)[0].props.onChange({ target: { value: 'first' } });
    findAll(tree, Rate)[0].props.onChange(4); tree = h.render();
    const click = button(tree, 'Publicar').props.onClick;
    const first = click(); await click(); assert.equal(calls, 1);
    tree = h.render(); assert.equal(button(tree, 'Publicar').props.loading, true); assert.equal(button(tree, 'Publicar').props.disabled, true);
    findAll(tree, TextArea)[0].props.onChange({ target: { value: 'later' } });
    post.resolve([undefined, 'Creada']); await first; await flush();
    assert.equal(findAll(h.render(), TextArea)[0].props.value, 'later');
    assert.equal(JSON.parse(sessionStorage.getItem('review-draft:user-a:book-a')).draft.comment, 'later');
  } finally { h.unmount(); teardown(); }
});

test('delete pending blocks duplicates and failed refresh marks stale with retry', async () => {
  setup(); const deletion = deferred(); let calls = 0, loads = 0;
  services.getAllReviews = async () => { loads++; return loads === 2 ? ['error', undefined] : [undefined, [item]]; };
  services.deleteReview = () => { calls++; return deletion.promise; };
  const h = harness(); try {
    h.render(); await flush(); let tree = h.render(); const remove = findAll(tree, Card)[0].props.onDelete;
    const first = remove(); await remove(); assert.equal(calls, 1);
    tree = h.render(); assert.equal(findAll(tree, Card)[0].props.pending, true); assert.equal(findAll(tree, Card)[0].props.disabled, true);
    deletion.resolve([undefined, 'Borrada']); await first; await flush(); tree = h.render();
    assert.match(text(tree), /podrían no estar actualizadas/);
    button(tree, 'Reintentar').props.onClick(); await flush(); assert.doesNotMatch(text(h.render()), /podrían no estar actualizadas/);
  } finally { h.unmount(); teardown(); }
});

test('uncertain mutation preserves draft and requires explicit refresh and acknowledgement', async () => {
  const store = setup(); services.postReview = async () => { throw new Error('network'); };
  const h = harness(); try {
    h.render(); await flush(); let tree = h.render();
    findAll(tree, TextArea)[0].props.onChange({ target: { value: 'draft' } }); findAll(tree, Rate)[0].props.onChange(3);
    await button(h.render(), 'Publicar').props.onClick(); tree = h.render();
    assert.match(text(tree), /No se pudo confirmar/); assert.equal(button(tree, 'Publicar').props.disabled, true);
    assert.equal(store.get('review-uncertain:user-a:book-a'), '1'); assert.equal(findAll(tree, TextArea)[0].props.value, 'draft');
    button(tree, 'Actualizar reseñas').props.onClick(); await flush(); tree = h.render();
    assert.ok(button(tree, 'Ya revisé')); button(tree, 'Ya revisé').props.onClick();
    assert.equal(button(h.render(), 'Publicar').props.disabled, false); assert.equal(store.has('review-uncertain:user-a:book-a'), false);
  } finally { h.unmount(); teardown(); }
});

test('initial failure retries; overlapping loads ignore stale results and navigation ignores feedback', async () => {
  setup(); const slow = deferred(), fast = deferred(); let n = 0;
  services.getAllReviews = () => { n++; return n === 1 ? Promise.reject(new Error('offline')) : n === 2 ? slow.promise : fast.promise; };
  const h = harness(); try {
    h.render(); await flush(); let tree = h.render(); assert.match(text(tree), /No se pudieron cargar/);
    const retry = button(tree, 'Reintentar').props.onClick; retry(); retry();
    fast.resolve([undefined, [item]]); await flush(); slow.resolve([undefined, []]); await flush();
    assert.equal(findAll(h.render(), Card).length, 1);
    const deletion = deferred(); services.deleteReview = () => deletion.promise;
    const result = findAll(h.render(), Card)[0].props.onDelete();
    window.location.pathname = '/'; deletion.resolve([undefined, 'Borrada']); await result;
    assert.equal(messages.length, 0); assert.equal(n, 3);
  } finally { h.unmount(); teardown(); }
});

test('service validates actual list and mutation contracts; uncertain errors reject', async () => {
  setup(); try {
    global.fetch = async () => new Response(JSON.stringify([item]), { status: 200 });
    assert.equal((await service.getAllReviews('book-a'))[1][0].id, item.id);
    for (const body of ['{}', 'null', '[{"id":"x"}]', 'not-json']) {
      global.fetch = async () => new Response(body, { status: 200 });
      await assert.rejects(service.getAllReviews('book-a'));
    }
    for (const body of ['{}', 'null', '{"message":""}', 'not-json']) {
      global.fetch = async () => new Response(body, { status: 200 });
      await assert.rejects(service.postReview({})); await assert.rejects(service.deleteReview('review-a'));
    }
    global.fetch = async () => new Response('{"error":"no"}', { status: 500 });
    await assert.rejects(service.postReview({})); await assert.rejects(service.deleteReview('review-a'));
    global.fetch = async () => { throw new Error('offline'); };
    await assert.rejects(service.postReview({})); await assert.rejects(service.deleteReview('review-a'));
  } finally { teardown(); }
});

test('rejected creation preserves the draft without claiming success or uncertainty', async () => {
  const store = setup(); services.postReview = async () => ['No autorizado', undefined];
  const h = harness(); try {
    h.render(); await flush(); let tree = h.render();
    findAll(tree, TextArea)[0].props.onChange({ target: { value: 'draft' } }); findAll(tree, Rate)[0].props.onChange(2);
    await button(h.render(), 'Publicar').props.onClick(); tree = h.render();
    assert.equal(findAll(tree, TextArea)[0].props.value, 'draft');
    assert.deepEqual(messages, [['error', 'No autorizado']]);
    assert.equal(store.has('review-uncertain:user-a:book-a'), false);
  } finally { h.unmount(); teardown(); }
});

test('uncertain deletion locks actions until a successful inspection and survives remount', async () => {
  const store = setup(); let failLoad = false;
  services.getAllReviews = async () => failLoad ? ['offline', undefined] : [undefined, [item]];
  services.deleteReview = async () => { throw new Error('connection lost'); };
  let h = harness(); try {
    h.render(); await flush(); await findAll(h.render(), Card)[0].props.onDelete();
    assert.equal(findAll(h.render(), Card)[0].props.disabled, true);
    h.unmount(); h = harness(); h.render(); await flush(); let tree = h.render();
    assert.match(text(tree), /No se pudo confirmar/); assert.equal(store.get('review-uncertain:user-a:book-a'), '1');
    failLoad = true; button(tree, 'Actualizar reseñas').props.onClick(); await flush(); tree = h.render();
    assert.equal(button(tree, 'Ya revisé'), undefined); assert.match(text(tree), /podrían no estar actualizadas/);
    assert.equal(button(tree, 'Reintentar'), undefined);
    failLoad = false; button(tree, 'Actualizar reseñas').props.onClick(); await flush(); tree = h.render();
    assert.ok(button(tree, 'Ya revisé'));
  } finally { h.unmount(); teardown(); }
});

test('uncertain creation has one guarded recovery action and keeps later draft edits', async () => {
  const store = setup(); const post = deferred(), refresh = deferred(); let loads = 0, posted;
  services.getAllReviews = () => { loads++; return loads === 1 ? Promise.resolve([undefined, [item]]) : refresh.promise; };
  services.postReview = (body) => { posted = body; return post.promise; };
  const h = harness(); try {
    h.render(); await flush(); let tree = h.render();
    findAll(tree, TextArea)[0].props.onChange({ target: { value: 'submitted' } });
    findAll(tree, Rate)[0].props.onChange(4);
    const submission = button(h.render(), 'Publicar').props.onClick();
    findAll(h.render(), TextArea)[0].props.onChange({ target: { value: 'later edit' } });
    post.reject(new Error('offline')); await submission; tree = h.render();
    assert.equal(posted.comment, 'submitted');
    assert.equal(findAll(tree, TextArea)[0].props.value, 'later edit');
    assert.equal(JSON.parse(store.get('review-draft:user-a:book-a')).draft.comment, 'later edit');
    assert.equal(button(tree, 'Reintentar'), undefined);
    assert.equal(findAll(tree, Button).filter((b) => text(b).includes('Actualizar reseñas')).length, 1);
    assert.equal(button(tree, 'Ya revisé'), undefined);
    const update = button(tree, 'Actualizar reseñas').props.onClick;
    update(); update(); tree = h.render();
    assert.equal(loads, 2);
    assert.equal(button(tree, 'Actualizar reseñas').props.loading, true);
    assert.equal(button(tree, 'Actualizar reseñas').props.disabled, true);
    assert.match(text(tree), /Actualizando reseñas/);
    assert.equal(button(tree, 'Publicar').props.disabled, true);
    refresh.resolve([undefined, [item]]); await flush(); tree = h.render();
    assert.equal(button(tree, 'Actualizar reseñas').props.loading, false);
    assert.equal(button(tree, 'Publicar').props.disabled, true);
    assert.ok(button(tree, 'Ya revisé'));
    button(tree, 'Ya revisé').props.onClick(); tree = h.render();
    assert.equal(button(tree, 'Publicar').props.disabled, false);
    assert.equal(findAll(tree, TextArea)[0].props.value, 'later edit');
    assert.equal(store.has('review-uncertain:user-a:book-a'), false);
  } finally { h.unmount(); teardown(); }
});

test('uncertain initial load error has one recovery control and failed refresh cannot unlock it', async () => {
  const store = setup(); let loads = 0;
  services.getAllReviews = async () => { loads++; return ['offline', undefined]; };
  services.postReview = async () => { throw new Error('offline'); };
  const h = harness(); try {
    h.render(); await flush(); let tree = h.render();
    findAll(tree, TextArea)[0].props.onChange({ target: { value: 'draft' } });
    findAll(tree, Rate)[0].props.onChange(3);
    await button(h.render(), 'Publicar').props.onClick(); tree = h.render();
    assert.match(text(tree), /No se pudieron cargar/);
    assert.equal(button(tree, 'Reintentar'), undefined);
    assert.equal(findAll(tree, Button).filter((b) => text(b).includes('Actualizar reseñas')).length, 1);
    button(tree, 'Actualizar reseñas').props.onClick(); await flush(); tree = h.render();
    assert.equal(loads, 2);
    assert.equal(button(tree, 'Ya revisé'), undefined);
    assert.equal(button(tree, 'Publicar').props.disabled, true);
    assert.equal(store.get('review-uncertain:user-a:book-a'), '1');
  } finally { h.unmount(); teardown(); }
});

test('unmounted mutation does not notify or refresh and leaves a recovery marker', async () => {
  const store = setup(); const post = deferred(); let loads = 0;
  services.getAllReviews = async () => { loads++; return [undefined, []]; };
  services.postReview = () => post.promise;
  const h = harness(); try {
    h.render(); await flush(); let tree = h.render();
    findAll(tree, TextArea)[0].props.onChange({ target: { value: 'draft' } }); findAll(tree, Rate)[0].props.onChange(4);
    const pending = button(h.render(), 'Publicar').props.onClick(); h.unmount();
    post.resolve([undefined, 'Creada']); await pending;
    assert.equal(loads, 1); assert.deepEqual(messages, []); assert.equal(store.get('review-uncertain:user-a:book-a'), '1');
  } finally { teardown(); }
});
