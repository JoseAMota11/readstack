import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiagnostics, DiagnosticStage } from './db04i-diagnostics';

test('diagnostics classify fixed stages and never disclose rejection contents', () => {
  const output: string[] = [];
  const reporter = createDiagnostics((message) => output.push(message));
  const untrusted = new Error('synthetic-secret SELECT driver connection 192.0.2.1');
  reporter.fail(untrusted);
  for (const stage of ['observer', 'transaction', 'parity', 'security', 'rollback', 'cleanup'] as DiagnosticStage[]) {
    reporter.enter(stage);
    reporter.fail(untrusted);
  }
  assert.deepEqual(output, ['preflight', 'observer', 'transaction', 'parity', 'security', 'rollback', 'cleanup']
    .map((stage) => `DB-04I failed: ${stage}.`));
  assert.throws(() => reporter.enter('synthetic-secret' as DiagnosticStage), /Invalid diagnostic stage/);
  reporter.fail({ toString() { throw new Error('must not inspect'); } });
  assert.equal(output.at(-1), 'DB-04I failed: cleanup.');
  assert.doesNotMatch(output.join('\n'), /synthetic-secret|SELECT|driver|connection|192\.0\.2\.1/);
});

test('a primary failure retains its stage when rollback and cleanup also fail', async () => {
  const output: string[] = [];
  const reporter = createDiagnostics((message) => output.push(message));
  try {
    reporter.enter('security');
    throw new Error('private primary detail');
  } catch (error) {
    reporter.fail(error);
  } finally {
    reporter.enter('rollback');
    try { throw new Error('private rollback detail'); } catch (error) { reporter.fail(error); }
    reporter.enter('cleanup');
    try { throw 'private cleanup detail'; } catch (error) { reporter.fail(error); }
  }
  assert.deepEqual(output, ['DB-04I failed: security.', 'DB-04I failed: rollback.', 'DB-04I failed: cleanup.']);
});
