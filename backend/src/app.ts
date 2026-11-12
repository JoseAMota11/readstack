import './config/config';
import express, { ErrorRequestHandler } from 'express';
import cors from 'cors';
import userRouter from './routes/user.route';
import bookRouter from './routes/book.route';
import reviewRouter from './routes/review.route';
import { AsyncHandlerError } from './middlewares/async-handler';

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Routes
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

export default app;
