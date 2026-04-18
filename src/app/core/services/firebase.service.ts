// ─── FIREBASE SERVICE ────────────────────────────────────────────────────────
// Service unique de bas niveau pour toutes les opérations Firebase RTDB.
// Gère deux bases : la base "admin" (SaaS) et la base "client" (communauté).

import { Injectable, inject, Injector, runInInjectionContext, OnDestroy } from '@angular/core';
import { Database } from '@angular/fire/database';
import { initializeApp, getApps, deleteApp, FirebaseApp } from 'firebase/app';
import {
  getDatabase,
  ref,
  get,
  set,
  update,
  remove,
  push,
  onValue,
  query,
  orderByChild,
  startAt,
  endAt,
  equalTo,
  Database as RtdbDatabase,
} from 'firebase/database';
import { Observable, Subject } from 'rxjs';
import { shareReplay } from 'rxjs/operators';
import { FirebaseClientConfig } from '../models/user.model';

const CLIENT_APP_NAME = 'sama-rh-client';

@Injectable({ providedIn: 'root' })
export class FirebaseService implements OnDestroy {
  private _angularFireDb = inject(Database);
  private injector = inject(Injector);

  private adminDb!: RtdbDatabase;
  private clientApp: FirebaseApp | null = null;
  private clientDatabase: RtdbDatabase | null = null;
  private currentCommunauteId: string | null = null;
  private destroy$ = new Subject<void>();

  constructor() {
    runInInjectionContext(this.injector, () => {
      const app: FirebaseApp = (this._angularFireDb as any).app;
      this.adminDb = getDatabase(app);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.destroyClientApp();
  }

  // ── BASE ADMIN ────────────────────────────────────────────────────────────

  async adminGet<T = any>(path: string): Promise<T | null> {
    const snapshot = await get(ref(this.adminDb, path));
    return snapshot.exists() ? snapshot.val() : null;
  }

  async adminSet(path: string, data: any): Promise<void> {
    await set(ref(this.adminDb, path), data);
  }

  async adminUpdate(path: string, data: Record<string, any>): Promise<void> {
    await update(ref(this.adminDb, path), data);
  }

  async adminRemove(path: string): Promise<void> {
    await remove(ref(this.adminDb, path));
  }

  async adminPush(path: string, data: any): Promise<string> {
    const newRef = push(ref(this.adminDb, path));
    await set(newRef, { ...data, id: newRef.key });
    return newRef.key!;
  }

  adminListen<T = any>(path: string): Observable<T | null> {
    return new Observable<T | null>((observer) => {
      const unsubscribe = onValue(
        ref(this.adminDb, path),
        (snapshot) => observer.next(snapshot.exists() ? snapshot.val() : null),
        (error) => observer.error(error),
      );
      return () => unsubscribe();
    }).pipe(shareReplay(1));
  }

  // ── BASE CLIENT (communauté) ──────────────────────────────────────────────

  async initClientDatabase(config: FirebaseClientConfig, communauteId: string): Promise<void> {
    if (this.currentCommunauteId === communauteId && this.clientDatabase) return;
    this.destroyClientApp();
    const existingApp = getApps().find((a) => a.name === CLIENT_APP_NAME);
    if (existingApp) await deleteApp(existingApp);
    this.clientApp = initializeApp(config, CLIENT_APP_NAME);
    this.clientDatabase = getDatabase(this.clientApp, config.databaseURL);
    this.currentCommunauteId = communauteId;
  }

  private destroyClientApp(): void {
    if (this.clientApp) {
      deleteApp(this.clientApp).catch(() => {});
      this.clientApp = null;
      this.clientDatabase = null;
      this.currentCommunauteId = null;
    }
  }

  get hasClientDatabase(): boolean { return this.clientDatabase !== null; }
  get communauteId(): string | null { return this.currentCommunauteId; }

  private requireClientDb(): RtdbDatabase {
    if (!this.clientDatabase) {
      throw new Error("Base client non initialisée. Appelez initClientDatabase() d'abord.");
    }
    return this.clientDatabase;
  }

  async clientGet<T = any>(path: string): Promise<T | null> {
    const snapshot = await get(ref(this.requireClientDb(), path));
    return snapshot.exists() ? snapshot.val() : null;
  }

  async clientSet(path: string, data: any): Promise<void> {
    await set(ref(this.requireClientDb(), path), data);
  }

  async clientUpdate(path: string, data: any): Promise<void> {
    await update(ref(this.requireClientDb(), path), data);
  }

  async clientRemove(path: string): Promise<void> {
    await remove(ref(this.requireClientDb(), path));
  }

  async clientPush(path: string, data: any): Promise<string> {
    const db = this.requireClientDb();
    const newRef = push(ref(db, path));
    await set(newRef, { ...data, id: newRef.key });
    return newRef.key!;
  }

  clientListen<T = any>(path: string): Observable<T | null> {
    return new Observable<T | null>((observer) => {
      const db = this.requireClientDb();
      const unsubscribe = onValue(
        ref(db, path),
        (snapshot) => observer.next(snapshot.exists() ? snapshot.val() : null),
        (error) => observer.error(error),
      );
      return () => unsubscribe();
    }).pipe(shareReplay(1));
  }

  clientListenList<T = any>(path: string): Observable<T[]> {
    return new Observable<T[]>((observer) => {
      const db = this.requireClientDb();
      const unsubscribe = onValue(
        ref(db, path),
        (snapshot) => {
          if (!snapshot.exists()) { observer.next([]); return; }
          const items: T[] = [];
          snapshot.forEach((child) => { items.push({ id: child.key, ...child.val() }); });
          observer.next(items);
        },
        (error) => observer.error(error),
      );
      return () => unsubscribe();
    }).pipe(shareReplay(1));
  }

  async clientGetList<T = any>(path: string): Promise<T[]> {
    const snapshot = await get(ref(this.requireClientDb(), path));
    if (!snapshot.exists()) return [];
    const items: T[] = [];
    snapshot.forEach((child) => { items.push({ id: child.key, ...child.val() } as T); });
    return items;
  }

  // ── REQUÊTES FILTRÉES ─────────────────────────────────────────────────────

  /**
   * Lecture unique filtrée par un champ enfant (ex: orderByChild('date')).
   * Utilisé pour récupérer les Login d'une date ou d'une plage précise
   * sans télécharger toute la collection.
   *
   * @param path     Chemin de la collection (ex: 'Login')
   * @param child    Champ sur lequel filtrer (ex: 'date')
   * @param start    Valeur de début (incluse)
   * @param end      Valeur de fin (incluse) — si omis, égalité exacte sur start
   */
  async clientQueryByChild<T = any>(
    path: string,
    child: string,
    start: string,
    end?: string,
  ): Promise<T[]> {
    const db = this.requireClientDb();
    const baseRef = ref(db, path);
    const q = end != null
      ? query(baseRef, orderByChild(child), startAt(start), endAt(end))
      : query(baseRef, orderByChild(child), equalTo(start));

    const snapshot = await get(q);
    if (!snapshot.exists()) return [];
    const items: T[] = [];
    snapshot.forEach((child) => { items.push({ id: child.key, ...child.val() } as T); });
    return items;
  }

  /**
   * Écoute temps réel filtrée par un champ enfant.
   * Utilisé pour écouter les Login d'une seule date en temps réel.
   */
  clientListenByChild<T = any>(
    path: string,
    child: string,
    start: string,
    end?: string,
  ): Observable<T[]> {
    return new Observable<T[]>((observer) => {
      const db = this.requireClientDb();
      const baseRef = ref(db, path);
      const q = end != null
        ? query(baseRef, orderByChild(child), startAt(start), endAt(end))
        : query(baseRef, orderByChild(child), equalTo(start));

      const unsubscribe = onValue(
        q,
        (snapshot) => {
          if (!snapshot.exists()) { observer.next([]); return; }
          const items: T[] = [];
          snapshot.forEach((child) => { items.push({ id: child.key, ...child.val() }); });
          observer.next(items);
        },
        (error) => observer.error(error),
      );
      return () => unsubscribe();
    });
    // Pas de shareReplay ici : le filtre dépend de paramètres dynamiques
    // L'appelant gère le cache si besoin
  }
}
