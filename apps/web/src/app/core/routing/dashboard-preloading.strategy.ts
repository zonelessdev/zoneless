import { Injectable, inject } from '@angular/core';
import { PreloadingStrategy, Route, Router } from '@angular/router';
import { Observable, of } from 'rxjs';

/**
 * Background-loads dashboard route chunks after the user is in `/account`.
 * Top-level non-dashboard routes should set `data: { preload: false }`.
 */
@Injectable({ providedIn: 'root' })
export class DashboardPreloadingStrategy implements PreloadingStrategy {
  private readonly router = inject(Router);

  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    if (route.data?.['preload'] === false) {
      return of(null);
    }

    // Avoid warming dashboard (or anything else) during checkout/auth flows.
    if (!this.router.url.startsWith('/account')) {
      return of(null);
    }

    return load();
  }
}
