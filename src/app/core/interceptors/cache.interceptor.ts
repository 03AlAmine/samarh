// src/app/core/interceptors/cache.interceptor.ts
import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpResponse } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap, shareReplay } from 'rxjs/operators';

interface CacheEntry {
  response: HttpResponse<any>;
  expiry: number;
}

@Injectable()
export class CacheInterceptor implements HttpInterceptor {
  private cache = new Map<string, CacheEntry>();
  private readonly DEFAULT_CACHE_DURATION = 300000; // 5 minutes

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Ne mettre en cache que les requêtes GET
    if (req.method !== 'GET') {
      return next.handle(req);
    }

    // Vérifier si la requête doit être mise en cache
    if (!this.shouldCache(req)) {
      return next.handle(req);
    }

    const cacheKey = this.createCacheKey(req);
    const cachedEntry = this.cache.get(cacheKey);

    // Retourner la réponse mise en cache si elle est valide
    if (cachedEntry && cachedEntry.expiry > Date.now()) {
      return of(cachedEntry.response.clone());
    }

    // Sinon, faire la requête et mettre en cache
    return next.handle(req).pipe(
      tap(event => {
        if (event instanceof HttpResponse) {
          const cacheDuration = this.getCacheDuration(req);
          const expiry = Date.now() + cacheDuration;
          
          this.cache.set(cacheKey, {
            response: event.clone(),
            expiry
          });
        }
      }),
      shareReplay(1) // Partager la réponse entre plusieurs subscribers
    );
  }

  private shouldCache(req: HttpRequest<any>): boolean {
    const cacheableEndpoints = [
      '/courses/list',
      '/teachers/list',
      '/config/',
      '/settings/'
    ];

    return cacheableEndpoints.some(endpoint => req.url.includes(endpoint));
  }

  private createCacheKey(req: HttpRequest<any>): string {
    return `${req.url}-${JSON.stringify(req.params)}`;
  }

  private getCacheDuration(req: HttpRequest<any>): number {
    const cacheConfig: { [key: string]: number } = {
      '/courses/list': 600000, // 10 minutes
      '/teachers/list': 900000, // 15 minutes
      '/config/': 3600000, // 1 heure
      '/settings/': 1800000 // 30 minutes
    };

    for (const endpoint in cacheConfig) {
      if (req.url.includes(endpoint)) {
        return cacheConfig[endpoint];
      }
    }

    return this.DEFAULT_CACHE_DURATION;
  }

  // Méthode pour vider le cache manuellement
  clearCache(): void {
    this.cache.clear();
  }

  // Méthode pour vider des entrées spécifiques
  clearCacheByKey(key: string): void {
    this.cache.delete(key);
  }
}