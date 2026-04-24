// services.guard.ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map, take } from 'rxjs/operators';

export const servicesGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.user$.pipe(
    take(1),
    map((user: any) => {
      if (!user) {
        router.navigate(['/login']);
        return false;
      }
      // Seuls admin et chargé de compte peuvent voir les services
      if (auth.isAdmin || auth.canEditEmployes) {
        return true;
      }
      router.navigate(['/dashboard']);
      return false;
    })
  );
};
