// src/app/core/interceptors/auth.interceptor.ts
import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, BehaviorSubject, from } from 'rxjs';
import { catchError, filter, take, switchMap } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private isRefreshing = false;
  private refreshTokenSubject: BehaviorSubject<any> = new BehaviorSubject<any>(null);

  constructor(private authService: AuthService) {}

  intercept(req: any, next: any) {
    // Ajouter le token d'authentification aux requêtes sortantes
    const authReq = this.addAuthToken(req);

    return next.handle(authReq).pipe(
      catchError((error: HttpErrorResponse) => {
        // Gérer les erreurs 401 (Unauthorized)
        if (error.status === 401 && !req.url.includes('/auth/refresh')) {
          return this.handle401Error(authReq, next);
        }

        // Gérer les erreurs 403 (Forbidden)
        if (error.status === 403) {
          this.handle403Error();
        }

        // Propager l'erreur
        return throwError(() => error);
      })
    );
  }

  private addAuthToken(request: HttpRequest<any>): HttpRequest<any> {
    const token = this.getAuthToken();

    if (!token) {
      return request;
    }

    // Exclure certaines URLs qui ne nécessitent pas d'authentification
    if (this.isPublicRequest(request.url)) {
      return request;
    }

    return request.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
  }

  private getAuthToken(): string | null {
    // Récupérer le token depuis le service d'authentification
    const user = this.authService.currentUser;
    // Note: Dans une implémentation réelle, vous stockeriez le token JWT
    // Pour Firebase, l'authentification est gérée côté client
    return user ? user.uid : null;
  }

  private isPublicRequest(url: string): boolean {
    const publicEndpoints = [
      '/auth/login',
      '/auth/register',
      '/auth/forgot-password',
      '/assets/',
      '/config/'
    ];

    return publicEndpoints.some(endpoint => url.includes(endpoint));
  }

  private handle401Error(request: HttpRequest<any>, next: HttpHandler):any{
  if (!this.isRefreshing) {
    this.isRefreshing = true;
    this.refreshTokenSubject.next(null);

    // Convertir la Promise en Observable et gérer le rafraîchissement
    // return from(this.authService.refreshToken()).pipe(
    //   switchMap((token: string) => {
    //     this.isRefreshing = false;
    //     this.refreshTokenSubject.next(token);
        
    //     // Renvoyer la requête originale avec le nouveau token
    //     return next.handle(this.addAuthToken(request));
    //   }),
    //   catchError((error) => {
    //     this.isRefreshing = false;
    //     this.refreshTokenSubject.next(null);
        
    //     // En cas d'échec du rafraîchissement, déconnecter l'utilisateur
    //     this.authService.logout();
    //     return throwError(() => error);
    //   })
    // );
  } else {
    // Attendre que le token soit rafraîchi par une autre requête
    return this.refreshTokenSubject.pipe(
      filter(token => token !== null),
      take(1),
      switchMap((token: string) => {
        // Renvoyer la requête originale avec le nouveau token
        return next.handle(this.addAuthToken(request));
      })
    );
  }
}

  private handle403Error(): void {
    // Rediriger vers la page d'accès refusé ou déconnecter l'utilisateur
    console.warn('Accès refusé - Redirection vers la page d\'accueil');
    // this.router.navigate(['/access-denied']);
  }
}