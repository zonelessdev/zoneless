import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { AppError } from '../utils/AppError';

export const ValidateRequest =
  (schema: ZodSchema) => (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      // Format Zod errors into a readable string or array
      const errorMessage = result.error.issues
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join(', ');

      // Throw our custom AppError with 400 Bad Request
      next(
        new AppError(
          `Validation Error: ${errorMessage}`,
          400,
          'invalid_request_error'
        )
      );
      return;
    }

    next();
  };
