// src/app/core/guards/public.guard.ts
import { Injectable, inject } from '@angular/core';
import { CanActivate, Router, ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map, take, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class publicGuard implements CanActivate {
  private authService = inject(AuthService);
  private router = inject(Router);

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean | UrlTree> {
    return this.authService.user$.pipe(
      take(1),
      map((user:any) => {
        // Si l'utilisateur est déjà connecté, on le redirige vers son dashboard
        if (user) {
          return this.redirectToDashboard(user.role);
        }

        // Si non connecté, on autorise l'accès à la route publique
        return true;
      })
    );
  }

  private redirectToDashboard(role: string): UrlTree {
    const routes: { [key: string]: string } = {
      'user': '/dashboard',
      'admin': '/admin/dashboard'
    };

    const dashboardRoute = routes[role] || '/';
    return this.router.createUrlTree([dashboardRoute]);
  }
}
