/**
 * Zoneless API Server
 * Express + MongoDB backend
 *
 * Multi-tenant architecture supporting multiple independent platforms.
 */

import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import * as path from 'path';

import router from './routes';
import { ErrorHandler } from './middleware/ErrorHandler';
import { RateLimiters } from './middleware/RateLimiter';
import { RequestLoggerWithSkip } from './middleware/RequestLogger';
import { RequestContextMiddleware } from './middleware/RequestContext';
import { AppError } from './utils/AppError';
import { ERRORS } from './utils/Errors';
import { AuthenticatedUser } from '@zoneless/shared-types';
import {
  InitializeAppConfig,
  GetAppConfig,
  IsSingleTenantMode,
} from './modules/AppConfig';
import { db } from './modules/Database';
import { GetTopUpMonitor, TopUpMonitor } from './modules/TopUpMonitor';
import { AccountModule } from './modules/Account';
import { ExternalWalletModule } from './modules/ExternalWallet';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user: AuthenticatedUser;
    }
  }
}

// Get app config (secrets will be empty until InitializeAppConfig is called)
const appConfig = GetAppConfig();

// Server port (from env or default)
const port = parseInt(process.env.API_PORT || process.env.PORT || '3333', 10);

const app = express();

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// Request logging (skip health checks)
app.use(RequestLoggerWithSkip(['/api/health']));

// CORS
app.use(
  cors({
    origin: appConfig.dashboardUrl,
    credentials: true,
  })
);

// Body parsing
app.use(express.json({ limit: '10kb' })); // Limit body size
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Request context (idempotency key, request ID) - must be before routes
app.use(RequestContextMiddleware);

// Rate limiting - apply to all API routes
app.use('/v1', RateLimiters.byApiKey);

// Mount all v1 routes
app.use('/v1', router);

// Health check (no rate limiting)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    mongodb:
      mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

// Catch-all for other routes
app.all('*', (req, res, next) => {
  next(
    new AppError(
      `Route ${req.method} ${req.path} not found`,
      ERRORS.ROUTE_NOT_FOUND.status,
      ERRORS.ROUTE_NOT_FOUND.type
    )
  );
});

// Global Error Handler
app.use(ErrorHandler);

/**
 * Log security warnings for production deployments.
 * Warns when APP_SECRET is loaded from database instead of environment variables.
 */
function LogSecurityWarnings(): void {
  if (!process.env.APP_SECRET) {
    console.log('');
    console.log('⚠️  Production Security Recommendation:');
    console.log(
      '   • APP_SECRET not set - using auto-generated value from database'
    );
    console.log('');
    console.log(
      '   For production deployments, set APP_SECRET in your .env file.'
    );
    console.log('   See https://zoneless.com/docs/deployment for details.');
    console.log('');
  }
}

/**
 * Count the number of platform accounts with wallets configured.
 * Used to determine if TopUp monitor should start.
 */
async function GetPlatformWalletCount(): Promise<number> {
  const accountModule = new AccountModule(db);
  const externalWalletModule = new ExternalWalletModule(db);

  const platformAccounts = await accountModule.GetPlatformAccounts();

  let walletCount = 0;
  for (const account of platformAccounts) {
    const wallets = await externalWalletModule.GetExternalWalletsByAccount(
      account.id
    );
    if (wallets.length > 0) {
      walletCount++;
    }
  }

  return walletCount;
}

// MongoDB connection and server start
async function StartServer() {
  try {
    await mongoose.connect(appConfig.mongodbUri);
    console.log('✅ Connected to MongoDB');

    await db.EnsureCollections();

    // Initialize app secrets (from env or auto-generated in DB)
    await InitializeAppConfig(db);

    // Check for existing platform wallets
    const walletCount = await GetPlatformWalletCount();

    if (walletCount === 0) {
      const setupUrl = `${appConfig.dashboardUrl}/setup`;
      console.log('');
      console.log(
        '╔════════════════════════════════════════════════════════════════╗'
      );
      console.log(
        '║                  🔧 READY FOR SETUP 🔧                         ║'
      );
      console.log(
        '╠════════════════════════════════════════════════════════════════╣'
      );
      console.log(
        '║  No platform accounts configured yet.                          ║'
      );
      console.log(`║  Visit: ${setupUrl.padEnd(52)} ║`);
      console.log(
        '╚════════════════════════════════════════════════════════════════╝'
      );
      console.log('');
    } else {
      console.log(`✅ Found ${walletCount} platform wallet(s) configured`);
    }

    // Production security warnings
    LogSecurityWarnings();

    // Start TopUp Monitor if enabled
    if (TopUpMonitor.IsEnabled()) {
      if (walletCount > 0) {
        const topUpMonitor = GetTopUpMonitor(db);
        topUpMonitor.Start();
        console.log(
          `💰 TopUp Monitor started (polling ${walletCount} wallet(s))`
        );
      }
    }

    const server = app.listen(port, () => {
      console.log(`🚀 API running at http://localhost:${port}/v1`);
      console.log(`📊 Health check at http://localhost:${port}/api/health`);
      console.log('');
      const livemode = appConfig.livemode;
      console.log(
        livemode
          ? '💰 Solana: mainnet-beta (live USDC)'
          : '🧪 Solana: devnet (test mode)'
      );
      if (IsSingleTenantMode()) {
        console.log('🔒 Single-tenant mode: Only one platform allowed');
      } else {
        console.log('🌐 Multi-tenant mode: Multiple platforms supported');
      }
    });

    server.on('error', console.error);

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      console.log(`${signal} received, shutting down gracefully...`);

      // Stop TopUp Monitor
      if (TopUpMonitor.IsEnabled()) {
        const topUpMonitor = GetTopUpMonitor(db);
        topUpMonitor.Stop();
      }

      server.close(async () => {
        await mongoose.connection.close();
        console.log('Server closed');
        process.exit(0);
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error);
    process.exit(1);
  }
}

StartServer();
