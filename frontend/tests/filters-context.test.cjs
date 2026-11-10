const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');

require.extensions['.tsx'] = (module, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
    esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX,
  } });
  module._compile(outputText, filename);
};

const original = Object.fromEntries(['useState', 'useRef', 'useMemo', 'useCallback', 'useEffect'].map((name) => [name, React[name]]));
const { FiltersProvider } = require('../context/filters.context.tsx');
after(() => Object.assign(React, original));

// A small hook harness; lifecycle replay approximates Strict Mode, not a browser renderer.
function harness() {
  const slots = [];
  let cursor = 0;
  let effects = [];
  React.useState = (initial) => {
    const i = cursor++;
    if (!(i in slots)) slots[i] = initial;
    return [slots[i], (update) => { slots[i] = typeof update === 'function' ? update(slots[i]) : update; }];
  };
  React.useRef = (initial) => {
    const i = cursor++;
    if (!(i in slots)) slots[i] = { current: initial };
    return slots[i];
  };
  React.useMemo = (factory, deps) => {
    const i = cursor++;
    if (!slots[i] || deps.some((dep, index) => !Object.is(dep, slots[i].deps[index]))) {
      slots[i] = { value: factory(), deps };
    }
    return slots[i].value;
  };
  React.useCallback = (callback, deps) => React.useMemo(() => callback, deps);
  React.useEffect = (effect, deps) => {
    const i = cursor++;
    if (!slots[i] || deps.some((dep, index) => !Object.is(dep, slots[i].deps[index]))) {
      effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { effect, deps, cleanup: effect() }; });
    }
  };
  return {
    render() {
      cursor = 0;
      const value = FiltersProvider({ children: null }).props.value;
      const pending = effects; effects = []; pending.forEach((effect) => effect());
      return value;
    },
    replayEffects() { slots.forEach((slot) => { if (slot?.effect) { slot.cleanup?.(); slot.cleanup = slot.effect(); } }); },
    unmount() { slots.forEach((slot) => slot?.cleanup?.()); },
  };
}

function setup(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const h = harness();
  t.after(() => h.unmount());
  return h;
}

test('coalesces rapid independent changes and keeps the latest value per key', (t) => {
  const h = setup(t); const initial = h.render();
  initial.handleSetFilters({ title: 'first', current: '1' });
  t.mock.timers.tick(200);
  initial.handleSetFilters({ author: 'author', current: '1' });
  initial.handleSetFilters({ title: 'latest', genre: 'genre' });
  t.mock.timers.tick(399);
  assert.deepEqual(h.render().filters, {});
  t.mock.timers.tick(1);
  const applied = h.render();
  assert.deepEqual(applied.filters, { title: 'latest', author: 'author', genre: 'genre', current: '1' });
  assert.equal(applied.handleSetFilters, initial.handleSetFilters);
});

test('preserves clearing values and skips effectively unchanged updates', (t) => {
  const h = setup(t); const update = h.render().handleSetFilters;
  update({ title: 'title', author: 'author', year: 2024, genre: 'genre' });
  t.mock.timers.tick(400);
  const before = h.render().filters;
  update({ title: '', year: null, genre: undefined });
  update({ author: 'new author' });
  t.mock.timers.tick(400);
  const cleared = h.render().filters;
  assert.deepEqual(cleared, { title: '', author: 'new author', year: null, genre: undefined });
  assert.notEqual(cleared, before);
  update({ title: undefined, year: '', genre: null, author: 'new author' });
  t.mock.timers.tick(400);
  assert.equal(h.render().filters, cleared);
});

test('pagination patches respect event order and retain independent changes', (t) => {
  const h = setup(t); const update = h.render().handleSetFilters;
  update({ title: 'title', current: '1' });
  update({ current: '3', size: '10' });
  t.mock.timers.tick(400);
  assert.deepEqual(h.render().filters, { title: 'title', current: '3', size: '10' });
  update({ current: '4', size: '10' });
  update({ author: 'author', current: '1' });
  t.mock.timers.tick(400);
  assert.deepEqual(h.render().filters, { title: 'title', author: 'author', current: '1', size: '10' });
});

test('cleanup cancels and discards patches, including during effect replay', (t) => {
  const h = setup(t); const update = h.render().handleSetFilters;
  update({ title: 'discarded' });
  h.replayEffects();
  update({ author: 'retained' });
  t.mock.timers.tick(400);
  assert.deepEqual(h.render().filters, { author: 'retained' });
  update({ title: 'unmounted' });
  h.unmount();
  t.mock.timers.tick(400);
  assert.deepEqual(h.render().filters, { author: 'retained' });
  const fresh = harness();
  assert.deepEqual(fresh.render().filters, {});
  fresh.unmount();
});
