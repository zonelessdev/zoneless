/**
 * Request logging middleware
 */

import { Request, Response, NextFunction } from 'express';
import { Logger } from '../utils/Logger';

/**
 * Middleware to log all incoming requests
 */
export function RequestLogger(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();

  // Log request
  Logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  // Capture response
  const originalSend = res.send;
  res.send = function (body) {
    const duration = Date.now() - startTime;

    Logger.info('Request completed', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
    });

    return originalSend.call(this, body);
  };

  next();
}

/**
 * Skip logging for certain paths (e.g., health checks)
 */
export function RequestLoggerWithSkip(skipPaths: string[] = ['/api/health']) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (skipPaths.includes(req.path)) {
      return next();
    }

    return RequestLogger(req, res, next);
  };
}
