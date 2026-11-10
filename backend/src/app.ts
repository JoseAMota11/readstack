import './config/config';
import express from 'express';
import cors from 'cors';
import userRouter from './routes/user.route';
import bookRouter from './routes/book.route';
import reviewRouter from './routes/review.route';

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/v1', userRouter);
app.use('/api/v1', bookRouter);
app.use('/api/v1', reviewRouter);

export default app;
