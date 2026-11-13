import './config/config';
import express, { ErrorRequestHandler } from 'express';
import { Repositories } from './database/composition';
import cors from 'cors';
import userRouter from './routes/user.route';
import bookRouter from './routes/book.route';
import reviewRouter from './routes/review.route';
import { AsyncHandlerError } from './middlewares/async-handler';

export function createApplication(repositories: Repositories) {
  const app = express();
  app.locals.repositories = repositories;

  // Middlewares
  app.use(cors());
  app.use(express.json());

  // Routes
  app.get('/healthz', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });
  app.use('/api/v1', userRouter);
  app.use('/api/v1', bookRouter);
  app.use('/api/v1', reviewRouter);

  const handleUnexpectedError: ErrorRequestHandler = (_error, _req, res, next) => {
    if (!(_error instanceof AsyncHandlerError)) {
      return next(_error);
    }
    if (res.headersSent) {
      return next(_error);
    }
    res.status(500).json({ error: 'Error interno del servidor. Por favor, inténtelo más tarde.' });
  };
  app.use(handleUnexpectedError);

  return app;
}
