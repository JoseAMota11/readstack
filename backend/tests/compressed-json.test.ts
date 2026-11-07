import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { gzipSync } from 'node:zlib';
import { app } from './helpers/test-app';

test('compressed JSON with trailing bytes does not stop the server', async () => {
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    assert.ok(address && typeof address !== 'string');

    const send = (body: Buffer) => new Promise<number>((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1',
        port: address.port,
        path: '/api/v1/nonexistent',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Encoding': 'gzip',
          'Content-Length': body.length,
        },
      }, (res) => {
        res.resume();
        res.once('end', () => resolve(res.statusCode as number));
        res.once('error', reject);
      });
      req.once('error', reject);
      req.setTimeout(2000, () => req.destroy(new Error('Request timed out')));
      req.end(body);
    });

    const valid = gzipSync(Buffer.from('{"synthetic":true}'));
    assert.equal(await send(valid), 404);
    // Exercise the trailing-byte pattern from the body-parser advisory. The
    // network and decoder scheduling are not controlled by this smoke test.
    const malformed = Buffer.concat([valid, Buffer.from([0]), Buffer.alloc(100 * 1024, 0x58)]);
    assert.equal(await send(malformed), 404);
    await delay(200);
    assert.equal(await send(valid), 404);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
