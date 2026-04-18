// src/app/core/interceptors/loading.interceptor.ts
import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { LoadingService } from '../services/loading.service';

@Injectable()
export class LoadingInterceptor implements HttpInterceptor {
  private requests: HttpRequest<any>[] = [];

  constructor(private loadingService: LoadingService) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Ignorer les requêtes pour certains endpoints
    if (this.shouldIgnoreLoading(req)) {
      return next.handle(req);
    }

    this.requests.push(req);
    this.loadingService.show();

    return next.handle(req).pipe(
      tap({
        next: (event) => {
          if (event instanceof HttpResponse) {
            this.removeRequest(req);
          }
        },
        error: () => {
          this.removeRequest(req);
        },
        finalize: () => {
          this.removeRequest(req);
        }
      })
    );
  }

  private removeRequest(req: HttpRequest<any>): void {
    const index = this.requests.indexOf(req);
    if (index >= 0) {
      this.requests.splice(index, 1);
    }

    if (this.requests.length === 0) {
      this.loadingService.hide();
    }
  }

  private shouldIgnoreLoading(req: HttpRequest<any>): boolean {
    const ignoreEndpoints = [
      '/assets/',
      '/notification/',
      '/chat/',
      '/meet/'
    ];

    return ignoreEndpoints.some(endpoint => req.url.includes(endpoint));
  }
}
