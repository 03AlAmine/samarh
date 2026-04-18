// ─── GUARDS ──────────────────────────────────────────────────────────────────
// Deux guards fonctionnels : authGuard (protège les routes privées)
// et adminGuard (protège les routes admin uniquement)

import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './core/services/auth.service';

/** Protège toute route nécessitant d'être connecté */
export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.waitForAuth();

  const user = auth.currentUser as any;

  if (!user) {
    router.navigate(['/login']);
    return false;
  }

  if (user.status === 'pending') {
    router.navigate(['/register-pending']);
    return false;
  }

  if (user.status !== 'active') {
    router.navigate(['/login'], { queryParams: { error: 'compte_inactif' } });
    return false;
  }

  return true;
};

/** Protège les routes réservées à l'admin SaaS */
export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.waitForAuth();

  if (!auth.isAdmin) {
    router.navigate(['/dashboard']);
    return false;
  }

  return true;
};

/** Redirige vers le dashboard si déjà connecté (pages login/register) */
export const publicGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.waitForAuth();

  if (auth.isLoggedIn) {
    router.navigate([auth.getDefaultRoute()]);
    return false;
  }

  return true;
};
