import { Env } from '../types/env.type';

const secretKey = process.env.SECRET_KEY;

if (!secretKey || secretKey.length !== 64 || !/^[0-9a-f]{64}$/i.test(secretKey)) {
  throw new Error('SECRET_KEY must be exactly 64 hexadecimal characters.');
}

export const config: Env = {
  SECRET_KEY: secretKey,
  PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
};
