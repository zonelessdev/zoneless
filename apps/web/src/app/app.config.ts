import {
  ApplicationConfig,
  provideZonelessChangeDetection,
} from '@angular/core';
import {
  provideRouter,
  withInMemoryScrolling,
  withPreloading,
} from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { DashboardPreloadingStrategy } from './core';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(
      routes,
      withInMemoryScrolling({
        scrollPositionRestoration: 'enabled',
        anchorScrolling: 'enabled',
      }),
      // Warm dashboard side-menu chunks only — not checkout/onboard/etc.
      withPreloading(DashboardPreloadingStrategy)
    ),
    provideHttpClient(),
    provideZonelessChangeDetection(),
  ],
};
