/**
 * Rate limiting middleware for API protection
 */

import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  keyGenerator?: (req: Request) => string; // Custom key generator
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

const store: RateLimitStore = {};

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const key of Object.keys(store)) {
    if (store[key].resetTime < now) {
      delete store[key];
    }
  }
}, 60000); // Clean every minute

/**
 * Create a rate limiter middleware
 */
export function RateLimiter(options: RateLimitOptions) {
  const {
    windowMs,
    maxRequests,
    keyGenerator = (req: Request) => req.ip || 'unknown',
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyGenerator(req);
    const now = Date.now();

    // Initialize or reset if window expired
    if (!store[key] || store[key].resetTime < now) {
      store[key] = {
        count: 0,
        resetTime: now + windowMs,
      };
    }

    store[key].count++;

    // Set rate limit headers
    const remaining = Math.max(0, maxRequests - store[key].count);
    const resetTime = Math.ceil(store[key].resetTime / 1000);

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', resetTime);

    // Check if rate limited
    if (store[key].count > maxRequests) {
      res.setHeader(
        'Retry-After',
        Math.ceil((store[key].resetTime - now) / 1000)
      );
      throw new AppError(
        ERRORS.RATE_LIMITED.message,
        ERRORS.RATE_LIMITED.status,
        ERRORS.RATE_LIMITED.type
      );
    }

    next();
  };
}

/**
 * Pre-configured rate limiters for different use cases
 */
export const RateLimiters = {
  // Standard API rate limit: 5000 requests per 15 minutes
  standard: RateLimiter({
    windowMs: 15 * 60 * 1000,
    maxRequests: 5000,
  }),

  // Strict rate limit for sensitive operations: 100 requests per minute
  strict: RateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 100,
  }),

  // Auth rate limit: 100 attempts per 15 minutes
  auth: RateLimiter({
    windowMs: 15 * 60 * 1000,
    maxRequests: 100,
  }),

  // Rate limit by API key instead of IP
  byApiKey: RateLimiter({
    windowMs: 15 * 60 * 1000,
    maxRequests: 10000,
    keyGenerator: (req: Request) => {
      const apiKey = req.headers['x-api-key'] as string;
      return apiKey || req.ip || 'unknown';
    },
  }),
};
