import { UserController } from '../controllers/user.controller';
import {
  validateRegisterData,
  validateLoginData,
} from '../middlewares/user.middleware';
import { Router } from 'express';
import { loginLimiters, registerLimiters } from '../middlewares/auth-rate-limit.middleware';

const userRouter = Router();

// Routes
userRouter.post('/register', registerLimiters.ip, validateRegisterData, registerLimiters.account, UserController.register);
userRouter.post('/login', loginLimiters.ip, validateLoginData, loginLimiters.account, UserController.login);

export default userRouter;
