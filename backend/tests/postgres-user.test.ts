import './helpers/test-app';
import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { TEST_SECRET } from './helpers/test-env';
import { PostgresUserClient, PostgresUserRepository } from '../src/database/postgres-user';
import { UserModel } from '../src/models/user.model';
import { User } from '../src/types/user.type';

const user: User = { id: '', username: 'Synthetic', email: 'case@example.test', password: 'synthetic-password', createdAt: '' };

test('PostgreSQL user creation uses a generated UUID, parameterized input and cost-10 bcrypt', async () => {
  let parameters: unknown[] = [];
  const repo = new PostgresUserRepository({ async query(sql, values) {
    assert.match(sql, /VALUES \(\$1, \$2, \$3, \$4\)/);
    parameters = values;
    return { rows: [], rowCount: 1 };
  } });
  const result = await repo.create(user);
  assert.match(result.id, /^[0-9a-f-]{36}$/);
  assert.equal(result.changes, true);
  assert.deepEqual(parameters.slice(0, 3), [result.id, user.username, user.email]);
  assert.equal(bcrypt.getRounds(parameters[3] as string), 10);
  assert.ok(bcrypt.compareSync(user.password, parameters[3] as string));
});

test('user login contract matches SQLite for valid, invalid and case-sensitive email', async () => {
  const inserted = await UserModel.create(user);
  const hash = bcrypt.hashSync(user.password, 10);
  const client: PostgresUserClient = { async query(sql, values) {
    assert.match(sql, /WHERE email = \$1/);
    return { rows: values[0] === user.email ? [{ id: inserted.id, username: user.username, password: hash }] : [], rowCount: 1 };
  } };
  const pg = new PostgresUserRepository(client);
  for (const repo of [pg, UserModel]) {
    const { token } = await repo.find(user);
    const claims = jwt.verify(token, TEST_SECRET) as jwt.JwtPayload;
    assert.equal(claims.id, inserted.id);
    assert.equal(claims.username, user.username);
    assert.equal(claims.exp! - claims.iat!, 6 * 60 * 60);
    await assert.rejects(repo.find({ ...user, password: 'wrong' }), { message: 'Credenciales inválidas.' });
    await assert.rejects(repo.find({ ...user, email: 'CASE@example.test' }), { message: 'Credenciales inválidas.' });
  }
});

test('only the email unique constraint maps to the established duplicate response code', async () => {
  for (const [code, constraint, expected] of [
    ['23505', 'users_email_key', 'SQLITE_CONSTRAINT_UNIQUE'],
    ['23505', 'users_pkey', undefined],
    ['08006', 'users_email_key', undefined],
  ]) {
    const repo = new PostgresUserRepository({ async query() { throw Object.assign(new Error('private driver detail'), { code, constraint }); } });
    await assert.rejects(repo.create(user), (error: Error & { code?: string }) => {
      assert.equal(error.code, expected);
      assert.doesNotMatch(error.message, /private driver detail/);
      return true;
    });
  }
});

test('unexpected lookup failures are sanitized and empty inserts retain changes=false', async () => {
  const repo = new PostgresUserRepository({ async query(sql) {
    if (sql.startsWith('SELECT')) throw new Error('private SQL and connection detail');
    return { rows: [], rowCount: 0 };
  } });
  assert.equal((await repo.create(user)).changes, false);
  await assert.rejects(repo.find(user), { message: 'User data access failed' });
});
