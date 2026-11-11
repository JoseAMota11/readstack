import { createHmac, randomBytes } from 'node:crypto';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';

// Never persist account identifiers in the in-memory stores.
const accountKeySecret = randomBytes(32);
const message = 'Demasiadas solicitudes. Inténtalo de nuevo más tarde.';

function positiveInteger(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(parsed) || parsed < 1 || parsed > 2147483647) {
    throw new Error(`${name} must be a positive integer no greater than 2147483647`);
  }
  return parsed;
}

function createAuthLimiters(route: 'LOGIN' | 'REGISTER', windowMs: number, ipMax: number, accountMax: number) {
  const window = positiveInteger(`AUTH_${route}_WINDOW_MS`, windowMs);
  const options = {
    windowMs: window,
    standardHeaders: 'draft-6' as const,
    legacyHeaders: false,
    message: { message, error: message },
  };

  return {
    ip: rateLimit({
      ...options,
      limit: positiveInteger(`AUTH_${route}_IP_MAX`, ipMax),
      // Opt in only when the direct peer is verified to be the client.
      skip: () => process.env.AUTH_IP_RATE_LIMIT_ENABLED !== 'true',
      // Use the socket peer even if trust proxy is changed elsewhere; never trust headers here.
      keyGenerator: (req) => ipKeyGenerator(req.socket.remoteAddress ?? 'unknown'),
      validate: { xForwardedForHeader: false },
    }),
    account: rateLimit({
      ...options,
      limit: positiveInteger(`AUTH_${route}_ACCOUNT_MAX`, accountMax),
      keyGenerator: (req) => createHmac('sha256', accountKeySecret)
        .update(req.body.email.trim().toLowerCase())
        .digest('hex'),
    }),
  };
}

export const loginLimiters = createAuthLimiters('LOGIN', 15 * 60 * 1000, 30, 10);
export const registerLimiters = createAuthLimiters('REGISTER', 60 * 60 * 1000, 10, 5);
