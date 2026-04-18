// src/app/core/guards/admin.guard.ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map, take } from 'rxjs/operators';

export const adminGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.user$.pipe(
    take(1),
    map((user:any) => {
      // Si l'utilisateur n'est pas connecté
      if (!user) {
        router.navigate(['/login']);
        return false;
      }

      // Si l'utilisateur n'est pas admin
      if (user.role !== 'admin') {
        // Rediriger vers le dashboard approprié selon le rôle
        switch (user.role) {
          case 'user':
            router.navigate(['/resume']);
            break;
          default:
            router.navigate(['/access-denied']);
        }
        return false;
      }

      // Accès autorisé pour les admins
      return true;
    })
  );
};