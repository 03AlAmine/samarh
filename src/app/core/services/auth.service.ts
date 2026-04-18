// ─── AUTH SERVICE ─────────────────────────────────────────────────────────────
// Gère l'authentification Firebase ET la session employé (sans Firebase Auth).
// Remplace : auth.service, firebase-config.service (logique session)

import { Injectable, inject } from '@angular/core';
import {
  Auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  browserLocalPersistence,
  browserSessionPersistence,
  setPersistence,
  UserCredential,
} from '@angular/fire/auth';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, filter, firstValueFrom } from 'rxjs';
import { map } from 'rxjs/operators';
import { AppUser, EmployeeUser, Communaute, FirebaseClientConfig } from '../models/user.model';
import { FirebaseService } from './firebase.service';

const SESSION_KEY = 'communauteSession';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private auth = inject(Auth);
  private router = inject(Router);
  private fb = inject(FirebaseService);

  private userSubject = new BehaviorSubject<AppUser | null>(null);
  /** Stream de l'utilisateur courant */
  user$ = this.userSubject.asObservable();

  /** Vrai dès que l'initialisation est terminée (guards peuvent passer) */
  authReady$ = new BehaviorSubject<boolean>(false);
  authInitialized: any;

  constructor() {
    this.init();
  }

  // ── INIT ──────────────────────────────────────────────────────────────────

  private async init(): Promise<void> {
    // 1. Restaurer session communauté (synchrone, pas de flash)
    const restored = this.restoreSessionFromStorage();

    if (!restored) {
      // 2. Écouter Firebase Auth pour les admins / gérants
      this.auth.onAuthStateChanged(async (firebaseUser) => {
        if (firebaseUser) {
          const userData = await this.fb.adminGet<AppUser>(`users/${firebaseUser.uid}`);
          if (userData) {
            this.userSubject.next(userData);
            await this.loadCommunauteDb(userData);
          }
        } else {
          this.userSubject.next(null);
        }
        this.authReady$.next(true);
      });
    } else {
      this.authReady$.next(true);
    }
  }

  // ── SESSION COMMUNAUTÉ (employé sans Firebase Auth) ───────────────────────

  private restoreSessionFromStorage(): boolean {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
      if (!raw) return false;

      const session = JSON.parse(raw);
      if (!session.communauteId || !session.login) return false;

      // Expiration localStorage
      if (session.expiry && session.expiry < Date.now()) {
        localStorage.removeItem(SESSION_KEY);
        return false;
      }

      const user: EmployeeUser = this.buildEmployeeUser(session);
      this.userSubject.next(user);

      // Charger la DB client en arrière-plan
      this.fb.adminGet<Communaute>(`communautes/${session.communauteId}`)
        .then((communaute) => {
          if (communaute?.firebaseConfig) {
            this.fb.initClientDatabase(communaute.firebaseConfig, session.communauteId);
          }
        })
        .catch(() => {});

      return true;
    } catch {
      return false;
    }
  }

  /** Connexion d'un employé via login/mot de passe communauté */
  async loginCommunaute(employe: any, communauteId: string, rememberMe = false): Promise<void> {
    const user: EmployeeUser = this.buildEmployeeUser({ ...employe, communauteId });
    this.userSubject.next(user);

    // Charger la base Firebase de la communauté
    const communaute = await this.fb.adminGet<Communaute>(`communautes/${communauteId}`);
    if (communaute?.firebaseConfig) {
      await this.fb.initClientDatabase(communaute.firebaseConfig, communauteId);
    }

    // Sauvegarder la session
    const sessionData = {
      uid: employe.id || '',
      login: employe.login || '',
      nom: employe.nom || '',
      prenom: employe.prenom || '',
      matricule: employe.matricule || '',
      services: employe.services || [],
      communauteId,
      communauteNom: communaute?.nom || '',
      timestamp: Date.now(),
      ...(rememberMe ? { expiry: Date.now() + 30 * 24 * 60 * 60 * 1000 } : {}),
    };

    sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
    if (rememberMe) localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
  }

  // ── FIREBASE AUTH (admin / gérant) ────────────────────────────────────────

  async login(email: string, password: string, rememberMe = false): Promise<void> {
    const persistence = rememberMe ? browserLocalPersistence : browserSessionPersistence;
    await setPersistence(this.auth, persistence);

    const cred: UserCredential = await signInWithEmailAndPassword(this.auth, email, password);
    const userData = await this.fb.adminGet<AppUser>(`users/${cred.user.uid}`);

    if (!userData) throw new Error('Compte introuvable en base de données.');
    if (userData.status === 'pending') throw new Error('Compte en attente de validation.');
    if (userData.status === 'rejected') throw new Error('Inscription rejetée.');
    if (userData.status === 'suspended') throw new Error('Compte suspendu.');

    await this.fb.adminUpdate(`users/${cred.user.uid}`, { lastLogin: new Date().toISOString() });
    await this.loadCommunauteDb(userData);
    this.userSubject.next(userData);
  }

  async register(userData: any): Promise<void> {
    const cred = await createUserWithEmailAndPassword(this.auth, userData.email, userData.password);
    const user: any = {
      uid: cred.user.uid,
      email: userData.email,
      firstName: userData.firstName || '',
      lastName: userData.lastName || '',
      phone: userData.phone || '',
      userType: userData.userType || 'individual',
      accountType: 'free',
      status: userData.userType === 'employee' ? 'active' : 'pending',
      createdAt: new Date().toISOString(),
      emailVerified: false,
      ...(userData.companyName ? { companyName: userData.companyName } : {}),
    };

    await this.fb.adminSet(`users/${user.uid}`, user);
    if (user.status === 'pending') {
      await this.fb.adminSet(`pending_users/${user.uid}`, {
        ...user,
        submittedAt: new Date().toISOString(),
      });
    }
  }

  async logout(): Promise<void> {
    sessionStorage.removeItem(SESSION_KEY);
    // Conserver la session "se souvenir de moi" seulement si expiry > now
    const local = localStorage.getItem(SESSION_KEY);
    if (local) {
      const parsed = JSON.parse(local);
      if (!parsed.expiry || parsed.expiry < Date.now()) {
        localStorage.removeItem(SESSION_KEY);
      }
    }

    if (this.auth.currentUser) {
      await signOut(this.auth);
    }

    this.userSubject.next(null);
    this.router.navigate(['/login']);
  }

  // ── GESTION INSCRIPTIONS ──────────────────────────────────────────────────

  async approveUser(userId: string, adminId: string): Promise<void> {
    const userData = await this.fb.adminGet<any>(`users/${userId}`);
    if (!userData) throw new Error('Utilisateur introuvable');

    const now = new Date().toISOString();
    const updates: Record<string, any> = {
      [`users/${userId}/status`]: 'active',
      [`users/${userId}/activatedAt`]: now,
      [`users/${userId}/activatedBy`]: adminId,
      [`pending_users/${userId}/status`]: 'approved',
      [`pending_users/${userId}/reviewDate`]: now,
    };

    // Créer une communauté si ce n'est pas un employé
    if (userData.userType !== 'employee') {
      const communauteId = await this.createCommunaute(userData);
      updates[`users/${userId}/communauteId`] = communauteId;
    }

    await this.fb.adminUpdate('', updates);
    await this.fb.adminSet(`notifications/${userId}/${Date.now()}`, {
      type: 'account_approved',
      title: 'Compte activé',
      message: 'Votre compte a été approuvé.',
      createdAt: now,
      read: false,
    });
  }

  async rejectUser(userId: string, adminId: string, reason: string): Promise<void> {
    const now = new Date().toISOString();
    await this.fb.adminUpdate('', {
      [`users/${userId}/status`]: 'rejected',
      [`users/${userId}/rejectedAt`]: now,
      [`users/${userId}/rejectionReason`]: reason,
      [`pending_users/${userId}/status`]: 'rejected',
      [`pending_users/${userId}/reviewDate`]: now,
    });
  }

  // ── HELPERS ───────────────────────────────────────────────────────────────

  private async loadCommunauteDb(user: AppUser): Promise<void> {
    const communauteId = (user as any).communauteId;
    if (!communauteId) return;
    const communaute = await this.fb.adminGet<Communaute>(`communautes/${communauteId}`);
    if (communaute?.firebaseConfig) {
      await this.fb.initClientDatabase(communaute.firebaseConfig, communauteId);
    }
  }

  private async createCommunaute(userData: any): Promise<string> {
    const nom = userData.userType === 'company'
      ? userData.companyName
      : `${userData.firstName} ${userData.lastName}`;

    const id = await this.fb.adminPush('communautes', {
      uidAdmin: userData.uid,
      nom,
      type: userData.userType === 'company' ? 'company' : 'individual',
      membres: [userData.uid],
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return id;
  }

  private buildEmployeeUser(session: any): EmployeeUser {
    return {
      uid: session.uid || session.userId || `local_${Date.now()}`,
      email: session.email || '',
      firstName: session.prenom || session.firstName || '',
      lastName: session.nom || session.lastName || '',
      phone: session.telephone || session.phone || '',
      userType: 'employee',
      accountType: 'free',
      status: 'active',
      createdAt: session.createdAt || new Date().toISOString(),
      emailVerified: false,
      isCommunauteUser: true,
      login: session.login,
      matricule: session.matricule || '',
      services: session.services ?? [],
      role: session.role || '',
      communauteId: session.communauteId,
      communauteNom: session.communauteNom || '',
    };
  }

  // ── GETTERS ───────────────────────────────────────────────────────────────

  get currentUser(): AppUser | null {
    return this.userSubject.value;
  }

  get isLoggedIn(): boolean {
    return this.userSubject.value !== null;
  }

  get isAdmin(): boolean {
    const u = this.userSubject.value as any;
    if (!u) return false;
    // Super admin SaaS
    if (u.userType === 'admin') return true;
    // Employé communauté avec rôle admin :
    //   - services = "Tous" (string)  ← cas Firebase réel
    //   - services = ["Tous"] (array) ← cas normalisé
    //   - role = "Administrateur"     ← champ role explicite
    if (u.services === 'Tous') return true;
    if (Array.isArray(u.services) && u.services[0] === 'Tous') return true;
    if (u.role === 'Administrateur' || u.role === 'admin') return true;
    // Gérant de communauté connecté via Firebase Auth (company ou individual avec communauteId)
    if (!u.isCommunauteUser && u.communauteId && (u.userType === 'company' || u.userType === 'individual')) return true;
    return false;
  }

  get isCommunauteUser(): boolean {
    return (this.userSubject.value as any)?.isCommunauteUser === true;
  }

  get communauteId(): string | null {
    return (this.userSubject.value as any)?.communauteId ?? null;
  }

  /** Route par défaut selon le rôle */
  getDefaultRoute(): string {
    const user: any = this.currentUser;
    if (!user) return '/login';
    if (user.status === 'pending') return '/register-pending';
    if (user.userType === 'admin' && !user.communauteId) return '/admin/dashboard';
    if (user.communauteId) return '/dashboard';
    return '/dashboard';
  }

  /** Attend que l'auth soit prête (pour les guards) */
  waitForAuth(): Promise<boolean> {
    return firstValueFrom(
      this.authReady$.pipe(filter((ready) => ready))
    );
  }
}
