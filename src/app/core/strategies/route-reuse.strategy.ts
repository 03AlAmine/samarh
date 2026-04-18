// src/app/core/strategies/route-reuse.strategy.ts
import { RouteReuseStrategy, ActivatedRouteSnapshot, DetachedRouteHandle } from '@angular/router';

export class AppRouteReuseStrategy implements RouteReuseStrategy {
  private storedRoutes = new Map<string, DetachedRouteHandle>();

  /**
   * Détermine si une route doit être détachée (mise en cache)
   */
  shouldDetach(route: ActivatedRouteSnapshot): boolean {
    // Routes à mettre en cache
    const cacheableRoutes = [
      'communaute/dashboard',
      'communaute/employes',
      'communaute/services',
      'communaute/pointages'
    ];

    const routePath = this.getRoutePath(route);
    return cacheableRoutes.includes(routePath);
  }

  /**
   * Stocke la route détachée
   */
  store(route: ActivatedRouteSnapshot, handle: DetachedRouteHandle): void {
    const routePath = this.getRoutePath(route);
    if (routePath) {
      this.storedRoutes.set(routePath, handle);
    }
  }

  /**
   * Détermine si une route doit être rattachée (restaurée depuis le cache)
   */
  shouldAttach(route: ActivatedRouteSnapshot): boolean {
    const routePath = this.getRoutePath(route);
    const shouldAttach = routePath ? this.storedRoutes.has(routePath) : false;

    if (shouldAttach) {
    }

    return shouldAttach;
  }

  /**
   * Récupère la route mise en cache
   */
  retrieve(route: ActivatedRouteSnapshot): DetachedRouteHandle | null {
    const routePath = this.getRoutePath(route);
    return routePath ? this.storedRoutes.get(routePath) || null : null;
  }

  /**
   * Détermine si une route doit être réutilisée
   */
  shouldReuseRoute(future: ActivatedRouteSnapshot, curr: ActivatedRouteSnapshot): boolean {
    return future.routeConfig === curr.routeConfig;
  }

  /**
   * Extrait le chemin de la route
   */
  private getRoutePath(route: ActivatedRouteSnapshot): string {
    let path = '';
    let current: ActivatedRouteSnapshot | null = route;

    while (current) {
      if (current.routeConfig?.path) {
        path = current.routeConfig.path + (path ? '/' + path : '');
      }
      current = current.parent;
    }

    return path;
  }

  /**
   * Vide le cache pour une route spécifique
   */
  clearCache(routePath?: string): void {
    if (routePath) {
      this.storedRoutes.delete(routePath);
    } else {
      this.storedRoutes.clear();
    }
  }
}
