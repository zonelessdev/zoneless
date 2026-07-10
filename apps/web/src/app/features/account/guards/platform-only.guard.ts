import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../../../core';

export const platformOnlyGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isPlatform() || auth.dashboardType() === 'full') {
    return true;
  }

  return router.createUrlTree(['/account/home']);
};
