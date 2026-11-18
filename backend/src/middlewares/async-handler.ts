import { NextFunction, Request, RequestHandler, Response } from 'express';

export class AsyncHandlerError extends Error {}

// Express 4 does not forward rejected handler promises on its own.
export function asyncHandler(
  handler: (req: Request, res: Response) => Promise<void>
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve().then(() => handler(req, res)).catch(() => next(new AsyncHandlerError()));
  };
}
