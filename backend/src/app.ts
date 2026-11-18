import './config/config';
import { UserModel } from './models/user.model';
import { BookModel } from './models/book.model';
import { ReviewModel } from './models/review.model';
import { createApplication } from './application';

export default createApplication({ users: UserModel, books: BookModel, reviews: ReviewModel });
