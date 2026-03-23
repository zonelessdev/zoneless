/**
 * Global error handler with environment-aware responses
 */

import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import { Logger } from '../utils/Logger';
import { ERRORS } from '../utils/Errors';

const isProduction = process.env.NODE_ENV === 'production';

export const ErrorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
) => {
  // Log the full error internally
  Logger.error('API Error', err, {
    path: req.path,
    method: req.method,
    ip: req.ip,
    userId: req.user?.account,
  });

  // If it's our custom AppError, use its status and message
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        message: err.message,
        type: err.type,
        // Include request ID for tracing in production
        ...(isProduction && { request_id: req.headers['x-request-id'] }),
      },
    });
    return;
  }

  // Type guard for Error objects
  const error = err as Error & { code?: number; name?: string };

  // Handle Mongoose validation errors
  if (error.name === 'ValidationError') {
    res.status(400).json({
      error: {
        message: isProduction ? 'Validation error' : error.message,
        type: 'validation_error',
      },
    });
    return;
  }

  // Handle Mongoose duplicate key errors
  if (error.code === 11000) {
    res.status(409).json({
      error: {
        message: 'Resource already exists',
        type: 'conflict',
      },
    });
    return;
  }

  // Handle JSON parsing errors
  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({
      error: {
        message: 'Invalid JSON in request body',
        type: 'invalid_request_error',
      },
    });
    return;
  }

  // Default 500 Error - hide details in production
  res.status(ERRORS.INTERNAL_ERROR.status).json({
    error: {
      message: isProduction
        ? ERRORS.INTERNAL_ERROR.message
        : error.message || ERRORS.INTERNAL_ERROR.message,
      type: ERRORS.INTERNAL_ERROR.type,
      // Only include stack in development
      ...(!isProduction && { stack: error.stack }),
    },
  });
};
