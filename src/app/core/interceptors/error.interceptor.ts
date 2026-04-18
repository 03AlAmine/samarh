// src/app/core/interceptors/error.interceptor.ts
import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Router } from '@angular/router';
import { NotificationService } from '../services/notification.service';

export interface ApiError {
  status: number;
  message: string;
  code?: string;
  details?: any;
  timestamp: string;
}

@Injectable()
export class ErrorInterceptor implements HttpInterceptor {
  constructor(
    private router: Router,
    private notificationService: NotificationService
  ) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(req).pipe(
      catchError((error: HttpErrorResponse) => {
        const apiError: ApiError = this.formatError(error);

        // Gérer les erreurs selon leur type
        this.handleError(apiError, req);

        // Propager l'erreur formatée
        return throwError(() => apiError);
      })
    );
  }

  private formatError(error: HttpErrorResponse): ApiError {
    const apiError: ApiError = {
      status: error.status,
      message: this.getErrorMessage(error),
      code: error.error?.code || this.getErrorCode(error.status),
      details: error.error?.details || error.error,
      timestamp: new Date().toISOString()
    };

    return apiError;
  }

  private getErrorMessage(error: HttpErrorResponse): string {
    if (error.error instanceof ErrorEvent) {
      // Erreur côté client
      return `Erreur client: ${error.error.message}`;
    } else {
      // Erreur côté serveur
      return error.error?.message || error.message || `Erreur ${error.status}: ${error.statusText}`;
    }
  }

  private getErrorCode(status: number): string {
    const errorCodes: { [key: number]: string } = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'VALIDATION_ERROR',
      429: 'RATE_LIMIT_EXCEEDED',
      500: 'INTERNAL_SERVER_ERROR',
      502: 'BAD_GATEWAY',
      503: 'SERVICE_UNAVAILABLE'
    };

    return errorCodes[status] || 'UNKNOWN_ERROR';
  }

  private handleError(error: ApiError, request: HttpRequest<any>): void {
    // Ne pas afficher les notifications pour certaines erreurs
    if (this.shouldIgnoreError(error, request)) {
      return;
    }

    // Afficher une notification à l'utilisateur
    this.showUserNotification(error);

    // Actions spécifiques selon le type d'erreur
    switch (error.status) {
      case 401:
        this.handleUnauthorizedError();
        break;
      case 403:
        this.handleForbiddenError();
        break;
      case 404:
        this.handleNotFoundError(request);
        break;
      case 429:
        this.handleRateLimitError();
        break;
      case 500:
        this.handleServerError();
        break;
      case 503:
        this.handleServiceUnavailableError();
        break;
      default:
        this.handleGenericError(error);
        break;
    }

    // Logger l'erreur
    this.logError(error, request);
  }

  private shouldIgnoreError(error: ApiError, request: HttpRequest<any>): boolean {
    // Ignorer les erreurs 401 pour les requêtes d'authentification
    if (error.status === 401 && request.url.includes('/auth/')) {
      return true;
    }

    // Ignorer les erreurs 404 pour certaines ressources
    if (error.status === 404 && request.url.includes('/assets/')) {
      return true;
    }

    return false;
  }

  private showUserNotification(error: ApiError): void {
    const notificationConfig = this.getNotificationConfig(error);

    if (notificationConfig.showToUser) {
      this.notificationService.sendNotification({
        userId: 'current-user', // Serait remplacé par l'ID réel
        title: notificationConfig.title,
        message: notificationConfig.message,
        type: 'system',
        priority: notificationConfig.priority
      });
    }
  }

  private getNotificationConfig(error: ApiError): {
    showToUser: boolean;
    title: string;
    message: string;
    priority: 'low' | 'medium' | 'high'
  } {
    const configs: { [key: number]: any } = {
      400: {
        showToUser: true,
        title: 'Requête invalide',
        message: 'Les données envoyées sont incorrectes.',
        priority: 'medium'
      },
      401: {
        showToUser: true,
        title: 'Session expirée',
        message: 'Votre session a expiré. Veuillez vous reconnecter.',
        priority: 'high'
      },
      403: {
        showToUser: true,
        title: 'Accès refusé',
        message: 'Vous n\'avez pas les permissions nécessaires.',
        priority: 'high'
      },
      404: {
        showToUser: true,
        title: 'Ressource non trouvée',
        message: 'La ressource demandée n\'existe pas.',
        priority: 'medium'
      },
      429: {
        showToUser: true,
        title: 'Trop de requêtes',
        message: 'Veuillez patienter avant de réessayer.',
        priority: 'medium'
      },
      500: {
        showToUser: true,
        title: 'Erreur serveur',
        message: 'Une erreur interne est survenue. Notre équipe a été notifiée.',
        priority: 'high'
      },
      503: {
        showToUser: true,
        title: 'Service indisponible',
        message: 'Le service est temporairement indisponible. Veuillez réessayer plus tard.',
        priority: 'high'
      }
    };

    return configs[error.status] || {
      showToUser: true,
      title: 'Erreur',
      message: 'Une erreur inattendue est survenue.',
      priority: 'medium'
    };
  }

  private handleUnauthorizedError(): void {
    // Déconnecter l'utilisateur et rediriger vers la page de login
    this.router.navigate(['/login'], {
      queryParams: {
        returnUrl: this.router.url,
        sessionExpired: true
      }
    });
  }

  private handleForbiddenError(): void {
    // Rediriger vers la page d'accès refusé
    this.router.navigate(['/access-denied']);
  }

  private handleNotFoundError(request: HttpRequest<any>): void {
    console.warn(`Ressource non trouvée: ${request.url}`);
  }

  private handleRateLimitError(): void {
    // Afficher un message spécifique pour les limites de taux
    setTimeout(() => {
      this.notificationService.sendNotification({
        userId: 'current-user',
        title: 'Limite atteinte',
        message: 'Vous pouvez maintenant réessayer.',
        type: 'system',
        priority: 'low'
      });
    }, 30000); // Après 30 secondes
  }

  private handleServerError(): void {
    // Logger l'erreur côté serveur
    console.error('Erreur serveur 500 détectée');
  }

  private handleServiceUnavailableError(): void {
    // Rediriger vers une page de maintenance
    this.router.navigate(['/maintenance']);
  }

  private handleGenericError(error: ApiError): void {
    // Logger les erreurs génériques
    console.warn(`Erreur ${error.status}: ${error.message}`);
  }

  private logError(error: ApiError, request: HttpRequest<any>): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      url: request.url,
      method: request.method,
      status: error.status,
      message: error.message,
      code: error.code,
      userAgent: navigator.userAgent,
      details: error.details
    };

    // Envoyer les logs à un service de logging
    this.sendToLoggingService(logEntry);
  }

  private sendToLoggingService(logEntry: any): void {
    // Implémentation pour envoyer les logs à un service externe
    // Ex: Firebase Analytics, Sentry, ou console en développement
    // if (environment.production) {
    //   // Envoyer à un service de logging en production
    //   console.log('Log error:', logEntry);
    // } else {
    //   console.error('Error intercepted:', logEntry);
    // }
  }
}
