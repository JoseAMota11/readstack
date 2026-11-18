import { timingSafeEqual } from 'node:crypto';
import { RequestHandler } from 'express';

export function stagingRegistrationGate(value: string | undefined): RequestHandler | undefined {
  if (value === undefined) return undefined;
  // This rejects obvious low-diversity values, but cannot prove random generation.
  if (value.length !== 64 || !/^[0-9a-f]{64}$/.test(value) || new Set(value).size < 12 || /^(.{1,32})\1+$/.test(value)) {
    throw new Error('Invalid STAGING_REGISTRATION_SECRET configuration');
  }
  const expected = Buffer.from(value, 'ascii');
  return (req, res, next) => {
    const supplied = req.get('X-Staging-Registration-Secret');
    const candidate = Buffer.from(supplied ?? '', 'utf8');
    if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) return next();
    res.status(403).json({ error: 'Registro no autorizado.' });
  };
}
