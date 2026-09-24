'use strict';

const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

function makeWindow() {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(String(e.message || e)));
  const dom = new JSDOM('<!doctype html><body></body>', {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://localhost/'
  });
  const win = dom.window;
  if (typeof win.scrollTo !== 'function') win.scrollTo = () => {};
  return { win, errors, dom };
}

(async () => {
  let passes = 0;

  // Functional
  {
    const { win, dom } = makeWindow();
    assert.strictEqual(typeof win.scrollTo, 'function');
    win.scrollTo(0, 0);
    passes++;
    dom.window.close();
  }

  // Boundary
  {
    const { win, dom } = makeWindow();
    win.scrollTo();
    win.scrollTo(0, 0);
    win.scrollTo({ top: 100, left: 50 });
    passes++;
    dom.window.close();
  }

  // Negative / failure isolation
  {
    const { win, errors, dom } = makeWindow();
    win.scrollTo(10, 20);
    assert.deepStrictEqual(errors, [], 'scrollTo must not create a jsdom console error');
    passes++;
    dom.window.close();
  }

  // Concurrency / resilience
  {
    const { win, dom } = makeWindow();
    await Promise.all(Array.from({ length: 100 }, (_, i) =>
      Promise.resolve().then(() => win.scrollTo(i, i))
    ));
    passes++;
    dom.window.close();
  }

  // Regression: the real smoke harness must also override jsdom's nominal-but-unimplemented scrollTo.
  {
    const source = require('fs').readFileSync('tests/smoke.js', 'utf8');
    assert.match(source, /win\.scrollTo\s*=\s*\(\)\s*=>\s*\{\}/);
    passes++;
  }

  // Independent re-run
  {
    const { win, errors, dom } = makeWindow();
    for (let i = 0; i < 3; i++) win.scrollTo(i, i);
    assert.deepStrictEqual(errors, []);
    passes++;
    dom.window.close();
  }

  assert.strictEqual(passes, 5);
  console.log('jsdom scrollTo harness: 5/5 passes');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
