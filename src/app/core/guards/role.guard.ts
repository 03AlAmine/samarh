// src/app/core/guards/role.guard.ts
import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map, take } from 'rxjs/operators';

export const roleGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Récupérer les rôles autorisés depuis la route data
  const requiredRoles = route.data['roles'] as string[];

  return authService.user$.pipe(
    take(1),
    map((user:any) => {
      if (!user) {
        router.navigate(['/login']);
        return false;
      }

      // Vérifier si l'utilisateur a un des rôles requis
      const hasRequiredRole = requiredRoles.includes(user.role);
      
      if (!hasRequiredRole) {
        // Rediriger vers la page d'accès refusé ou le dashboard
        router.navigate(['/access-denied']);
        return false;
      }

      return true;
    })
  );
};

// Version avec paramètre dynamique
export const roleGuardFactory = (roles: string[]): CanActivateFn => {
  return (route: ActivatedRouteSnapshot) => {
    const authService = inject(AuthService);
    const router = inject(Router);

    return authService.user$.pipe(
      take(1),
      map((user:any) => {
        if (!user) {
          router.navigate(['/login']);
          return false;
        }

        const hasRequiredRole = roles.includes(user.role);
        
        if (!hasRequiredRole) {
          router.navigate(['/access-denied']);
          return false;
        }

        return true;
      })
    );
  };
};