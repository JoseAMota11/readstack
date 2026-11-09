const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

// Use the project's existing TypeScript compiler with Node's built-in test runner.
const root = path.resolve(__dirname, '..');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  return resolve.call(this, request.startsWith('@/') ? path.join(root, request.slice(2)) : request, ...args);
};
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true,
  } });
  module._compile(outputText, filename);
};

const Cookies = require('js-cookie');
const { tokenExpiry, safeReturnPath } = require('../utils/session.ts');
const { setToken, getTokenDecoded } = require('../utils/cookies-handlers.ts');
const { proxy, config } = require('../proxy.ts');
const { NextRequest } = require('next/server');
const { unstable_doesMiddlewareMatch } = require('next/experimental/testing/server');
const { authenticatedFetch, responseError } = require('../services/authenticated-fetch.ts');
const { readReviewDraft, writeReviewDraft, cleanupReviewDrafts } = require('../utils/review-draft.ts');
process.env.NEXT_PUBLIC_API_URL = 'http://localhost:4000/api/v1';
const { verifyLoginSession } = require('../services/login-session.ts');
const books = require('../services/book.service.ts');
const reviews = require('../services/review.service.ts');
const { loginUser } = require('../services/login.service.ts');
const { registerUser } = require('../services/register.service.ts');

const token = (exp) => `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.signature`;
const future = () => Math.floor(Date.now() / 1000) + 3600;
let cookie;
let removed;
let redirected;
const original = { get: Cookies.get, set: Cookies.set, remove: Cookies.remove, fetch: global.fetch, window: global.window };

beforeEach(() => {
  cookie = undefined;
  removed = false;
  redirected = undefined;
  Cookies.get = () => cookie;
  Cookies.set = (_name, value, options) => { cookie = value; return options; };
  Cookies.remove = () => { removed = true; cookie = undefined; };
  global.window = { location: { pathname: '/book/123', search: '?tab=reviews', assign: (value) => { redirected = value; } } };
});
afterEach(() => {
  Object.assign(Cookies, { get: original.get, set: original.set, remove: original.remove });
  global.fetch = original.fetch;
  global.window = original.window;
});

test('authentication forms explicitly use POST in their rendered JSX', () => {
  for (const file of ['app/login/page.tsx', 'app/register/page.tsx']) {
    const ast = ts.createSourceFile(file, fs.readFileSync(path.join(root, file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const forms = [];
    const visit = (node) => {
      if (ts.isJsxOpeningElement(node) && node.tagName.getText(ast) === 'form') forms.push(node);
      ts.forEachChild(node, visit);
    };
    visit(ast);
    assert.equal(forms.length, 1);
    assert.ok(forms[0].attributes.properties.some((attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(ast) === 'method' && attribute.initializer?.text === 'post'));
  }
});

test('hydrated login and registration preserve JSON POST success contracts', async () => {
  const payload = { email: 'synthetic@example.test', password: 'synthetic' };
  const signed = token(future());
  global.fetch = async (url, init) => {
    assert.equal(init.method, 'POST');
    assert.equal(init.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(init.body), payload);
    return new Response(JSON.stringify(url.endsWith('/login') ? { token: signed } : { message: 'ok' }), { status: 200 });
  };
  assert.deepEqual(await loginUser(payload), [undefined, signed]);
  assert.deepEqual(await registerUser(payload), [undefined, 'ok']);
});

test('public authentication failures always return an error without affecting the session', async () => {
  const payload = { email: 'synthetic@example.test', password: 'synthetic' };
  const cases = [
    [JSON.stringify({ error: 'error field' }), 'error field'],
    [JSON.stringify({ message: 'message field' }), 'message field'],
    [JSON.stringify({ error: '', message: 'message fallback' }), 'message fallback'],
    [JSON.stringify({ error: 42, message: null }), 'Ocurrió un error inesperado.'],
    [JSON.stringify({}), 'Ocurrió un error inesperado.'],
    ['null', 'Ocurrió un error inesperado.'],
    ['{invalid', 'Ocurrió un error inesperado.'],
    ['not json', 'Ocurrió un error inesperado.'],
    ['', 'Ocurrió un error inesperado.'],
  ];
  for (const operation of [loginUser, registerUser]) {
    for (const status of [400, 401, 409, 429, 500]) {
      for (const [body, expected] of cases) {
        cookie = token(future());
        const currentCookie = cookie;
        global.fetch = async () => new Response(body, { status });
        assert.deepEqual(await operation(payload), [expected, undefined]);
        assert.equal(cookie, currentCookie);
        assert.equal(removed, false);
        assert.equal(redirected, undefined);
      }
    }
  }
});

test('cookie expiration uses absolute JWT expiry and rejects invalid tokens', () => {
  const exp = future();
  let expires;
  Cookies.set = (_name, _value, options) => { expires = options.expires; };
  setToken(token(exp));
  assert.ok(expires instanceof Date);
  assert.equal(expires.getTime(), exp * 1000);
  for (const value of [undefined, '', 'invalid', `bad.${token(future()).split('.')[1]}.signature`, token(1), token(undefined)]) {
    assert.equal(tokenExpiry(value), null);
    assert.throws(() => setToken(value));
    cookie = value;
    assert.equal(getTokenDecoded(), null);
  }
});

test('framework matcher covers private routes and excludes public routes and assets', () => {
  assert.deepEqual(config.matcher, ['/', '/book/:path*']);
  for (const url of ['/', '/book', '/book/', '/book/123', '/book/123/edit?tab=x']) {
    assert.equal(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url }), true, url);
  }
  for (const url of ['/login', '/register', '/books', '/_next/static/example.js', '/favicon.ico']) {
    assert.equal(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url }), false, url);
  }
});

test('proxy protects private routes and permits valid sessions', () => {
  for (const value of [undefined, 'bad', token(1)]) {
    const headers = value ? { cookie: `token=${value}` } : {};
    for (const route of ['/', '/book', '/book/123', '/book/123/edit']) {
      const response = proxy(new NextRequest(`http://localhost:3000${route}`, { headers }));
      assert.equal(response.status, 307);
      assert.equal(new URL(response.headers.get('location')).pathname, '/login');
    }
  }
  for (const route of ['/', '/book', '/book/123?tab=x', '/book/123/edit']) {
    const response = proxy(new NextRequest(`http://localhost:3000${route}`, { headers: { cookie: `token=${token(future())}` } }));
    assert.equal(response.headers.get('x-middleware-next'), '1');
  }
  for (const route of ['/login', '/register']) assert.equal(proxy(new NextRequest(`http://localhost:3000${route}`)).headers.get('x-middleware-next'), '1');
});

test('proxy preserves current deep-link redirect destinations', () => {
  for (const [route, expected] of [
    ['/', '/login'],
    ['/book', '/login'],
    ['/book/123/edit?tab=reviews&view=all', '/login?returnTo=%2Fbook%2F123%2Fedit%3Ftab%3Dreviews%26view%3Dall'],
    ['/?page=2', '/login?returnTo=%2F%3Fpage%3D2'],
  ]) {
    const response = proxy(new NextRequest(`http://localhost:3000${route}`));
    assert.equal(response.status, 307);
    assert.equal(response.headers.get('location'), `http://localhost:3000${expected}`);
  }
});

test('return destinations are restricted to local private routes', () => {
  assert.equal(safeReturnPath('/book/123/edit?tab=x'), '/book/123/edit?tab=x');
  assert.equal(safeReturnPath('/?page=2#ignored'), '/?page=2');
  for (const value of [null, '', '/book', '//evil.test', '/\\evil.test', 'https://evil.test', '/login', '/register', '/book/../login']) assert.equal(safeReturnPath(value), '/');
});

test('login session verification requires a backend success and ignores response bodies', async () => {
  for (const value of [undefined, 'bad', token(1)]) {
    cookie = value;
    global.fetch = () => { throw new Error('unexpected request'); };
    assert.equal(await verifyLoginSession(new AbortController().signal), 'anonymous');
  }
  cookie = token(future());
  global.fetch = async (url, init) => {
    assert.equal(url, 'http://localhost:4000/api/v1/books?size=1');
    assert.equal(init.headers.Authorization, `Bearer ${cookie}`);
    assert.equal(init.cache, 'no-store');
    assert.equal(init.redirect, 'error');
    return { ok: true, status: 200, get body() { throw new Error('body must not be read'); } };
  };
  assert.equal(await verifyLoginSession(new AbortController().signal), 'authenticated');
});

test('login session verification rejects 401 without disturbing newer sessions', async () => {
  cookie = token(future());
  global.fetch = async () => new Response(null, { status: 401 });
  assert.equal(await verifyLoginSession(new AbortController().signal), 'anonymous');
  assert.equal(removed, true);
  removed = false;
  cookie = token(future());
  global.fetch = async () => { cookie = token(future() + 1); return new Response(null, { status: 401 }); };
  assert.equal(await verifyLoginSession(new AbortController().signal), 'stale');
  assert.equal(removed, false);
  const sameToken = token(future());
  cookie = sameToken;
  global.fetch = async () => { setToken(sameToken); return new Response(null, { status: 401 }); };
  assert.equal(await verifyLoginSession(new AbortController().signal), 'stale');
  assert.equal(removed, false);
});

test('login session verification preserves sessions on failures and ignores cancelled or stale successes', async () => {
  cookie = token(future());
  for (const status of [403, 404, 500]) {
    global.fetch = async () => new Response(null, { status });
    assert.equal(await verifyLoginSession(new AbortController().signal), 'unavailable');
    assert.equal(removed, false);
  }
  global.fetch = async () => { throw new Error('offline'); };
  assert.equal(await verifyLoginSession(new AbortController().signal), 'unavailable');
  const controller = new AbortController();
  global.fetch = async () => { controller.abort(); return new Response(null, { status: 401 }); };
  assert.equal(await verifyLoginSession(controller.signal), 'stale');
  assert.equal(removed, false);
  global.fetch = async () => { cookie = token(future() + 1); return new Response(null, { status: 200 }); };
  assert.equal(await verifyLoginSession(new AbortController().signal), 'stale');
});

test('401 clears only the rejected session and returns a failure', async () => {
  cookie = token(future());
  global.fetch = async (_input, init) => {
    assert.equal(init.headers.get('Authorization'), `Bearer ${cookie}`);
    return new Response(JSON.stringify({ message: 'expired' }), { status: 401 });
  };
  const response = await authenticatedFetch('http://localhost/api');
  assert.equal(await responseError(response), 'expired');
  assert.equal(removed, true);
  assert.equal(redirected, '/login?returnTo=%2Fbook%2F123%3Ftab%3Dreviews');
});

test('late 401 does not clear a newer session; other failures do not redirect', async () => {
  cookie = token(future());
  global.fetch = async () => { cookie = token(future() + 1); return new Response(null, { status: 401 }); };
  await authenticatedFetch('http://localhost/api');
  assert.equal(removed, false);
  assert.equal(redirected, undefined);
  for (const status of [403, 404, 500]) {
    global.fetch = async () => new Response('not json', { status });
    const response = await authenticatedFetch('http://localhost/api');
    assert.ok(await responseError(response));
    assert.equal(removed, false);
    assert.equal(redirected, undefined);
  }
  global.fetch = async () => { throw new Error('offline'); };
  await assert.rejects(authenticatedFetch('http://localhost/api'));
  assert.equal(removed, false);
  assert.equal(redirected, undefined);
});

test('late 401 does not clear a newly set session even if the token is identical', async () => {
  const sameToken = token(future());
  cookie = sameToken;
  global.fetch = async () => { setToken(sameToken); return new Response(null, { status: 401 }); };
  await authenticatedFetch('http://localhost/api');
  assert.equal(removed, false);
  assert.equal(redirected, undefined);
});

test('401 recovers if the rejected cookie expired while the request was in flight', async () => {
  cookie = token(future());
  global.fetch = async () => { cookie = undefined; return new Response(null, { status: 401 }); };
  await authenticatedFetch('http://localhost/api');
  assert.equal(removed, true);
  assert.ok(redirected.startsWith('/login'));
});

test('protected book and review operations never report 401 as success', async () => {
  const operations = [
    () => books.getOneBook('123'), () => books.createBook({}),
    () => books.updateBook('123', {}), () => books.deleteBook('123'),
    () => reviews.getAllReviews('123'),
    () => reviews.postReview({}), () => reviews.deleteReview('123'),
  ];
  global.fetch = async () => new Response(JSON.stringify({ message: 'expired' }), { status: 401 });
  for (const operation of operations) {
    cookie = token(future());
    const [error, value] = await operation();
    assert.equal(error, 'expired');
    assert.equal(value, undefined);
  }
  cookie = token(future());
  await assert.rejects(books.exportBookCSV('123'), /expired/);
  cookie = token(future());
  await assert.rejects(books.getAllBooks(), /expired/);
});

test('review drafts survive a failed request and remain scoped to the user and book', async () => {
  const previous = global.sessionStorage;
  const values = new Map();
  global.sessionStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  try {
    const key = 'review-draft:user-a:book-a';
    writeReviewDraft(key, { comment: 'synthetic draft', rating: 4 });
    global.fetch = async () => new Response(JSON.stringify({ message: 'expired' }), { status: 401 });
    cookie = token(future());
    const [error] = await reviews.postReview({});
    assert.ok(error);
    assert.deepEqual(readReviewDraft(key), { comment: 'synthetic draft', rating: 4 });
    assert.equal(readReviewDraft('review-draft:user-b:book-a'), null);
    assert.equal(readReviewDraft('review-draft:user-a:book-b'), null);
    writeReviewDraft(key, null);
    assert.equal(readReviewDraft(key), null);
  } finally {
    global.sessionStorage = previous;
  }
});

test('draft cleanup expires abandoned entries, preserves recent and legacy drafts, and handles unavailable storage', () => {
  const previous = global.sessionStorage;
  const now = Date.now;
  const values = new Map();
  global.sessionStorage = {
    get length() { return values.size; }, key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  try {
    Date.now = () => 100000000;
    writeReviewDraft('review-draft:user-a:old', { comment: 'old', rating: 1 });
    values.set('review-draft:user-a:legacy', JSON.stringify({ comment: 'legacy', rating: 2 }));
    values.set('unrelated', 'preserve');
    Date.now = () => 100000000 + 24 * 60 * 60 * 1000;
    cleanupReviewDrafts();
    assert.equal(readReviewDraft('review-draft:user-a:old'), null);
    assert.deepEqual(readReviewDraft('review-draft:user-a:legacy'), { comment: 'legacy', rating: 2 });
    assert.equal(values.get('unrelated'), 'preserve');
    global.sessionStorage = { get length() { throw new Error('unavailable'); }, getItem() { throw new Error('unavailable'); }, setItem() { throw new Error('unavailable'); }, removeItem() { throw new Error('unavailable'); } };
    assert.doesNotThrow(() => cleanupReviewDrafts());
    assert.doesNotThrow(() => writeReviewDraft('review-draft:user-a:book-a', { comment: 'x', rating: 1 }));
    assert.equal(readReviewDraft('review-draft:user-a:book-a'), null);
  } finally {
    Date.now = now;
    global.sessionStorage = previous;
  }
});
