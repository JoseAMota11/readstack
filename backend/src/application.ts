import './config/config';
import express, { ErrorRequestHandler } from 'express';
import { Repositories } from './database/composition';
import { configureCors } from './config/cors';
import userRouter from './routes/user.route';
import bookRouter from './routes/book.route';
import reviewRouter from './routes/review.route';
import { stagingRegistrationGate } from './middlewares/staging-registration.middleware';
import { registerLimiters } from './middlewares/auth-rate-limit.middleware';

export function createApplication(repositories: Repositories) {
  const app = express();
  app.locals.repositories = repositories;

  // Middlewares
  app.use(configureCors(process.env.CORS_ALLOWED_ORIGINS));
  const registrationGate = stagingRegistrationGate(process.env.STAGING_REGISTRATION_SECRET);
  if (registrationGate) {
    app.locals.stagingRegistrationGate = true;
    app.post('/api/v1/register', registerLimiters.ip, registrationGate);
  }
  app.disable('x-powered-by');
  const parseJson = express.json({ limit: '100kb' });
  app.use((req, res, next) => {
    parseJson(req, res, (error?: unknown) => {
      if (!error) return next();
      // Only classify errors originating from this parser invocation. Application
      // errors must not select an HTTP status by supplying parser-like properties.
      if (error instanceof Error) {
        const parserError = error as Error & { status?: number; type?: string; code?: string };
        if (parserError.status === 400 && (
          ['entity.parse.failed', 'request.aborted', 'request.size.invalid'].includes(parserError.type ?? '') ||
          ['Z_DATA_ERROR', 'Z_BUF_ERROR'].includes(parserError.code ?? '')
        )) {
          res.status(400).json({ error: 'JSON no válido.' });
          return;
        }
        if (parserError.status === 413 && parserError.type === 'entity.too.large') {
          res.status(413).json({ error: 'La solicitud es demasiado grande.' });
          return;
        }
        if (parserError.status === 415 &&
          ['encoding.unsupported', 'charset.unsupported'].includes(parserError.type ?? '')) {
          res.status(415).json({ error: 'Codificación no admitida.' });
          return;
        }
      }
      next(error);
    });
  });

  // Routes
  app.get('/healthz', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });
  app.use('/api/v1', userRouter);
  app.use('/api/v1', bookRouter);
  app.use('/api/v1', reviewRouter);

  const handleUnexpectedError: ErrorRequestHandler = (_error, _req, res, next) => {
    if (res.headersSent) {
      return next(_error);
    }
    res.status(500).json({ error: 'Error interno del servidor. Por favor, inténtelo más tarde.' });
  };
  app.use(handleUnexpectedError);

  return app;
}
