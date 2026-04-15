import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isLoggedIn) return true;
  return router.createUrlTree(['/login']);
};

export const roleGuard = (allowedRoles: string[]): CanActivateFn => () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn) return router.createUrlTree(['/login']);
  if (auth.hasRole(...allowedRoles)) return true;
  // Students are redirected to their profile
  return router.createUrlTree(['/profile']);
};
