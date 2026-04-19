import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map, take } from 'rxjs/operators';

export const adminGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  return auth.user$.pipe(
    take(1),
    map((user: any) => {
      if (!user) {
        router.navigate(['/login']);
        return false;
      }
      // Utilise isAdmin : couvre super-admin, gérant, employé Tous/Administrateur
      if (auth.isAdmin) return true;
      router.navigate(['/dashboard']);
      return false;
    }),
  );
};
