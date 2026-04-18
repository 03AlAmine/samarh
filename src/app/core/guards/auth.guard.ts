// src/app/core/guards/auth.guard.ts
import { Injectable } from '@angular/core';
import { Router, ActivatedRouteSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { Observable } from 'rxjs';
import { filter, map, take, timeout } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class authGuard {
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  canActivate(route: ActivatedRouteSnapshot): Observable<boolean> {
    // ✅ Attendre l'initialisation avec timeout pour éviter le blocage infini
    return this.authService.authReady$.pipe(
      filter(initialized => initialized === true),
      take(1),
      timeout(5000), // Timeout après 5 secondes
      map(() => {
        const currentUser: any = this.authService.currentUser;

        // ✅ Si utilisateur communauté connecté, autoriser immédiatement
        if (currentUser && (currentUser as any).isCommunauteUser === true) {
          // Vérifier si la route nécessite une communauté
          if (route.data['requiresCommunaute'] && !currentUser.communauteId) {
            return false;
          }
          return true;
        }

        // ✅ Vérification Firebase standard
        if (!currentUser) {
          this.router.navigate(['/login']);
          return false;
        }

        if (currentUser.status === 'pending') {
          this.router.navigate(['/register-pending']);
          return false;
        }

        if (currentUser.status !== 'active' && currentUser.status !== 'approved') {
          this.authService.logout();
          this.router.navigate(['/login'], {
            queryParams: { error: 'compte_inactif' }
          });
          return false;
        }

        if (route.data['requiresAdmin']) {
          if (currentUser.userType !== 'admin') {
            this.router.navigate(['/communaute/dashboard']);
            return false;
          }
        }

        if (route.data['requiresCommunaute']) {
          if (!currentUser.communauteId) {
            if (currentUser.userType === 'company' || currentUser.userType === 'individual') {
              this.router.navigate(['/creation-communaute']);
              return false;
            } else if (currentUser.userType === 'admin') {
              this.router.navigate(['/admin/dashboard']);
              return false;
            } else {
              this.router.navigate(['/dashboard']);
              return false;
            }
          }
        }

        return true;
      })
    );
  }
}
