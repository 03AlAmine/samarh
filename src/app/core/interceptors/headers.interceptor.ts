// src/app/core/interceptors/headers.interceptor.ts
import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable()
export class HeadersInterceptor implements HttpInterceptor {
  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Cloner la requête et ajouter les headers
    const modifiedReq = req.clone({
      setHeaders: {
        'X-Application': 'tandem-immo',
        'X-Version': '1.0.0',
        'Accept-Language': 'fr-FR',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    return next.handle(modifiedReq);
  }
}