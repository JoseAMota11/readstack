const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  return resolve.call(this, request.startsWith('@/') ? path.join(root, request.slice(2)) : request, ...args);
};
require.extensions['.ts'] = (module, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true,
  } });
  module._compile(outputText, filename);
};

const Cookies = require('js-cookie');
const original = { get: Cookies.get, set: Cookies.set, remove: Cookies.remove, window: global.window, document: global.document, fetch: global.fetch };
const token = (suffix = 'one', exp = Math.floor(Date.now() / 1000) + 3600) =>
  `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.${suffix}`;

let cookie, events, documentEvents, messages, channels, observer, helpers, authenticatedFetch, redirects;
class Channel {
  constructor(name) { this.name = name; this.closed = false; channels.push(this); }
  postMessage(message) { messages.push(message); }
  close() { this.closed = true; }
}

beforeEach(() => {
  cookie = undefined; events = new Map(); documentEvents = new Map(); messages = []; channels = []; redirects = [];
  Cookies.get = () => cookie;
  Cookies.set = (_name, value) => { cookie = value; };
  Cookies.remove = () => { cookie = undefined; return 'removed'; };
  global.window = {
    BroadcastChannel: Channel,
    addEventListener: (name, fn) => events.set(name, fn),
    removeEventListener: (name) => events.delete(name),
    location: { pathname: '/', search: '', assign: (url) => redirects.push(url) },
  };
  global.document = {
    visibilityState: 'visible',
    addEventListener: (name, fn) => documentEvents.set(name, fn),
    removeEventListener: (name) => documentEvents.delete(name),
  };
  for (const file of ['../utils/session-observer.ts', '../utils/cookies-handlers.ts', '../services/authenticated-fetch.ts']) delete require.cache[require.resolve(file)];
  observer = require('../utils/session-observer.ts');
  helpers = require('../utils/cookies-handlers.ts');
  authenticatedFetch = require('../services/authenticated-fetch.ts').authenticatedFetch;
});
afterEach(() => {
  Object.assign(Cookies, { get: original.get, set: original.set, remove: original.remove });
  global.window = original.window; global.document = original.document; global.fetch = original.fetch;
});

test('subscriptions clean up, tolerate replay, and keep snapshots stable while observed', () => {
  assert.equal(observer.getServerSessionSnapshot().state, 'unknown');
  let calls = 0;
  const unsubscribe = observer.subscribeSession(() => calls++);
  assert.equal(calls, 1);
  const initial = observer.getSessionSnapshot();
  assert.equal(initial.state, 'unavailable');
  assert.equal(observer.reconcileSession(), initial);
  assert.equal(observer.getSessionSnapshot(), initial);
  const same = () => calls++;
  const a = observer.subscribeSession(same); const b = observer.subscribeSession(same);
  a(); a();
  helpers.setToken(token());
  assert.equal(calls, 3);
  b(); unsubscribe(); unsubscribe();
  assert.equal(events.size, 0); assert.equal(documentEvents.size, 0);
  assert.equal(channels[0].closed, true);
  const generation = observer.getSessionSnapshot().generation;
  const replay = observer.subscribeSession(() => {});
  assert.ok(observer.getSessionSnapshot().generation > generation);
  replay();
});

test('helper notifications are synchronous after cookie and version changes, including identical login and logout', () => {
  const seen = [];
  const off = observer.subscribeSession(() => seen.push([helpers.getToken(), helpers.getSessionVersion(), observer.getSessionSnapshot().state]));
  seen.length = 0;
  const one = token(); const two = token('two');
  helpers.setToken(one); helpers.setToken(one); helpers.setToken(two);
  assert.equal(helpers.removeToken(), 'removed');
  assert.deepEqual(seen, [[one, 1, 'plausible'], [one, 2, 'plausible'], [two, 3, 'plausible'], [undefined, 4, 'unavailable']]);
  assert.throws(() => helpers.setToken('invalid'));
  assert.equal(seen.length, 4);
  assert.deepEqual(messages, Array(4).fill({ type: 'invalidate' }));
  off();
});

test('failed cookie operations preserve helper exception and version behavior without notifications', () => {
  let calls = 0; const off = observer.subscribeSession(() => calls++); calls = 0;
  Cookies.set = () => { throw new Error('set failed'); };
  assert.throws(() => helpers.setToken(token()), /set failed/);
  assert.equal(helpers.getSessionVersion(), 0);
  Cookies.remove = () => { throw new Error('remove failed'); };
  assert.throws(() => helpers.removeToken(), /remove failed/);
  assert.equal(helpers.getSessionVersion(), 1);
  assert.equal(calls, 0); assert.deepEqual(messages, []); off();
});

test('nested notifications and throwing or unsubscribing listeners cannot interrupt dispatch', () => {
  const offFirst = observer.subscribeSession(() => {});
  let calls = 0, nested = false;
  const offThrow = observer.subscribeSession(() => { throw new Error('listener'); });
  let offLater = () => {};
  const offNested = observer.subscribeSession(() => {
    calls++;
    if (!nested) { nested = true; offLater(); cookie = token('external'); observer.reconcileSession(); }
  });
  let later = 0; offLater = observer.subscribeSession(() => later++);
  assert.doesNotThrow(() => helpers.setToken(token()));
  assert.equal(calls, 2); assert.equal(later, 0);
  assert.equal(observer.getSessionSnapshot().state, 'plausible');
  offFirst(); offThrow(); offNested(); offLater();
});

test('cross-tab messages invalidate even for A to B to A and are never rebroadcast', () => {
  cookie = token(); const off = observer.subscribeSession(() => {});
  const receiver = channels[0]; const before = observer.getSessionSnapshot().generation;
  cookie = token('two'); receiver.onmessage({ data: { type: 'invalidate' } });
  cookie = token(); receiver.onmessage({ data: { type: 'invalidate' } });
  receiver.onmessage({ data: { type: 'invalidate' } });
  assert.equal(observer.getSessionSnapshot().generation, before + 3);
  receiver.onmessage({ data: { type: 'other' } });
  assert.equal(observer.getSessionSnapshot().generation, before + 3);
  assert.deepEqual(messages, []); off();
});

test('unavailable, throwing, or closed channels cannot block authentication', () => {
  for (const implementation of [undefined, class { constructor() { throw new Error('unsupported'); } }, class extends Channel { postMessage() { throw new Error('closed'); } close() { throw new Error('close'); } }]) {
    global.window.BroadcastChannel = implementation;
    const off = observer.subscribeSession(() => { throw new Error('listener'); });
    assert.doesNotThrow(() => helpers.setToken(token()));
    assert.doesNotThrow(() => helpers.removeToken());
    assert.doesNotThrow(off);
  }
});

test('focus, visibility and pageshow reconcile changes and expiry', () => {
  cookie = token(); const off = observer.subscribeSession(() => {});
  let previous = observer.getSessionSnapshot();
  events.get('focus')(); assert.equal(observer.getSessionSnapshot(), previous);
  cookie = token('two'); events.get('focus')();
  assert.ok(observer.getSessionSnapshot().generation > previous.generation);
  previous = observer.getSessionSnapshot(); cookie = undefined;
  document.visibilityState = 'hidden'; documentEvents.get('visibilitychange')();
  assert.equal(observer.getSessionSnapshot(), previous);
  document.visibilityState = 'visible'; documentEvents.get('visibilitychange')();
  assert.equal(observer.getSessionSnapshot().state, 'unavailable');
  cookie = token('expired', 1); events.get('pageshow')({ persisted: true });
  assert.equal(observer.getSessionSnapshot().state, 'unavailable');
  previous = observer.getSessionSnapshot(); observer.reconcileSession();
  assert.equal(observer.getSessionSnapshot(), previous);
  events.get('pageshow')({ persisted: true });
  assert.ok(observer.getSessionSnapshot().generation > previous.generation);
  previous = observer.getSessionSnapshot();
  documentEvents.get('visibilitychange')();
  assert.ok(observer.getSessionSnapshot().generation > previous.generation); off();
});

test('observation gaps invalidate on reactivation and boundary checks, even with the same final cookie', () => {
  cookie = token(); const off = observer.subscribeSession(() => {});
  const before = observer.getSessionSnapshot().generation; off();
  cookie = token('two'); cookie = token(); // No observer can infer this sequence from the final value.
  assert.ok(observer.reconcileSession().generation > before);
  const after = observer.getSessionSnapshot().generation;
  assert.ok(observer.reconcileSession().generation > after);
  const last = observer.getSessionSnapshot().generation;
  const again = observer.subscribeSession(() => {});
  assert.ok(observer.getSessionSnapshot().generation > last); again();
});

test('current 401 notifies despite listener exceptions, while stale 401 does not remove newer sessions', async () => {
  cookie = token(); let calls = 0;
  const off = observer.subscribeSession(() => { calls++; throw new Error('listener'); });
  calls = 0;
  global.fetch = async () => new Response(null, { status: 401 });
  await authenticatedFetch('http://localhost/test');
  assert.equal(calls, 1); assert.equal(cookie, undefined); assert.deepEqual(redirects, ['/login']);
  redirects.length = 0; cookie = token(); observer.reconcileSession(); calls = 0;
  global.fetch = async () => { helpers.setToken(token()); return new Response(null, { status: 401 }); };
  await authenticatedFetch('http://localhost/test');
  assert.equal(calls, 1); assert.equal(cookie, token()); assert.deepEqual(redirects, []);
  off();
});

test('private invalidation counts every successful helper mutation, including identical tokens and repeated logout', () => {
  const off = observer.subscribeSession(() => {});
  const start = observer.getSessionSnapshot().privateStateGeneration;
  const one = token();
  helpers.setToken(one); helpers.setToken(one); helpers.removeToken(); helpers.removeToken();
  assert.equal(observer.getSessionSnapshot().privateStateGeneration, start + 4);
  assert.deepEqual(Object.keys(observer.getSessionSnapshot()).sort(), ['generation', 'privateStateGeneration', 'state']);
  assert.equal(observer.getServerSessionSnapshot().privateStateGeneration, 0);
  off();
});

test('ordinary visibility reconciliation preserves private state but cannot undo a preceding hint', () => {
  cookie = token(); const off = observer.subscribeSession(() => {});
  const start = observer.getSessionSnapshot();
  document.visibilityState = 'hidden'; documentEvents.get('visibilitychange')();
  document.visibilityState = 'visible'; documentEvents.get('visibilitychange')();
  let current = observer.getSessionSnapshot();
  assert.equal(current.generation, start.generation + 1);
  assert.equal(current.privateStateGeneration, start.privateStateGeneration);
  channels[0].onmessage({ data: { type: 'invalidate' } });
  const hinted = observer.getSessionSnapshot();
  assert.equal(hinted.privateStateGeneration, current.privateStateGeneration + 1);
  documentEvents.get('visibilitychange')(); current = observer.getSessionSnapshot();
  assert.equal(current.generation, hinted.generation + 1);
  assert.equal(current.privateStateGeneration, hinted.privateStateGeneration);
  off();
});

test('replacement, disappearance, unreadable cookies and unavailable visibility invalidate', () => {
  cookie = token(); const off = observer.subscribeSession(() => {});
  let previous = observer.getSessionSnapshot();
  for (const next of [token('two'), undefined]) {
    cookie = next; observer.reconcileSession();
    const current = observer.getSessionSnapshot();
    assert.equal(current.privateStateGeneration, previous.privateStateGeneration + 1);
    previous = current;
  }
  documentEvents.get('visibilitychange')();
  assert.equal(observer.getSessionSnapshot().privateStateGeneration, previous.privateStateGeneration + 1);
  Cookies.get = () => { throw new Error('blocked'); };
  previous = observer.getSessionSnapshot(); observer.reconcileSession();
  assert.equal(observer.getSessionSnapshot().state, 'unknown');
  assert.equal(observer.getSessionSnapshot().privateStateGeneration, previous.privateStateGeneration + 1);
  previous = observer.getSessionSnapshot(); documentEvents.get('visibilitychange')();
  assert.equal(observer.getSessionSnapshot().privateStateGeneration, previous.privateStateGeneration + 1);
  Cookies.get = () => cookie;
  previous = observer.getSessionSnapshot(); observer.reconcileSession();
  assert.equal(observer.getSessionSnapshot().privateStateGeneration, previous.privateStateGeneration + 1);
  off();
});

test('subscription gaps and persisted pageshow invalidate even when the cookie is unchanged', () => {
  cookie = token(); let off = observer.subscribeSession(() => {});
  let previous = observer.getSessionSnapshot();
  events.get('pageshow')({ persisted: false });
  assert.equal(observer.getSessionSnapshot(), previous);
  events.get('pageshow')({ persisted: true });
  assert.equal(observer.getSessionSnapshot().privateStateGeneration, previous.privateStateGeneration + 1);
  off(); previous = observer.getSessionSnapshot();
  observer.reconcileSession();
  assert.equal(observer.getSessionSnapshot().privateStateGeneration, previous.privateStateGeneration + 1);
  previous = observer.getSessionSnapshot(); off = observer.subscribeSession(() => {});
  assert.equal(observer.getSessionSnapshot().privateStateGeneration, previous.privateStateGeneration + 1);
  off();
});

test('expiry is detected at the next reconciliation, not by a background timer', () => {
  const now = Date.now; let time = now(); Date.now = () => time;
  try {
    cookie = token('expiring', Math.floor(time / 1000) + 2);
    const off = observer.subscribeSession(() => {});
    const previous = observer.getSessionSnapshot();
    time += 3000;
    assert.equal(observer.getSessionSnapshot(), previous);
    observer.reconcileSession();
    assert.equal(observer.getSessionSnapshot().state, 'unavailable');
    assert.equal(observer.getSessionSnapshot().privateStateGeneration, previous.privateStateGeneration + 1);
    off();
  } finally { Date.now = now; }
});

test('reentrant notifications publish cumulative counters before each subscriber runs', () => {
  cookie = token(); const off = observer.subscribeSession(() => {});
  const start = observer.getSessionSnapshot(); let nested = false; const seen = [];
  const first = observer.subscribeSession(() => {
    seen.push(observer.getSessionSnapshot().privateStateGeneration);
    if (!nested) {
      nested = true;
      channels[0].onmessage({ data: { type: 'invalidate' } });
      documentEvents.get('visibilitychange')();
    }
  });
  const second = observer.subscribeSession(() => seen.push(observer.getSessionSnapshot().privateStateGeneration));
  helpers.setToken(cookie);
  assert.deepEqual(seen, [start.privateStateGeneration + 1, start.privateStateGeneration + 2, start.privateStateGeneration + 2, start.privateStateGeneration + 2]);
  assert.equal(observer.getSessionSnapshot().generation, start.generation + 3);
  first(); second(); off();
});
