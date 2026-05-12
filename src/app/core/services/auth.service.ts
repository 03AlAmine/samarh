// auth.service.ts - version corrigée

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
import { AppUser, EmployeeUser, Communaute } from '../models/user.model';
import { FirebaseService } from './firebase.service';

const EMPLOYEE_SESSION_KEY = 'communauteSession';
const ADMIN_SESSION_KEY = 'adminSession';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private auth = inject(Auth);
  private router = inject(Router);
  private fb = inject(FirebaseService);

  private userSubject = new BehaviorSubject<AppUser | null>(null);
  user$ = this.userSubject.asObservable();
  authReady$ = new BehaviorSubject<boolean>(false);

  private isAuthInitialized = false;

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    if (this.isAuthInitialized) return;
    this.isAuthInitialized = true;

    // 1. D'abord, essayer de restaurer une session admin
    const adminRestored = this.restoreAdminSession();

    if (!adminRestored) {
      // 2. Sinon, essayer de restaurer une session employé
      const employeeRestored = this.restoreEmployeeSession();

      if (!employeeRestored) {
        // 3. Enfin, écouter Firebase Auth
        this.auth.onAuthStateChanged(async (firebaseUser) => {

          if (firebaseUser) {
            const userData = await this.fb.adminGet<AppUser>(`users/${firebaseUser.uid}`);

            if (userData) {
              const userWithId = { ...userData, uid: firebaseUser.uid };
              this.userSubject.next(userWithId);
              this.saveAdminSession(userWithId);
              await this.loadCommunauteDb(userWithId);
            } else {
              this.userSubject.next(null);
            }
          } else {
            this.userSubject.next(null);
          }
          this.authReady$.next(true);
        });
      }
    }
  }

  // ✅ Session Admin
  private saveAdminSession(user: AppUser): void {
    const sessionData = {
      uid: (user as any).uid,
      userType: user.userType,
      communauteId: (user as any).communauteId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      timestamp: Date.now(),
      isAdmin: true,
    };
    sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(sessionData));
    // Nettoyer toute session employé existante
    sessionStorage.removeItem(EMPLOYEE_SESSION_KEY);
  }

  private restoreAdminSession(): boolean {
    try {
      const raw = sessionStorage.getItem(ADMIN_SESSION_KEY);
      if (!raw) return false;

      const session = JSON.parse(raw);
      if (!session.uid) return false;

      // Session expirée après 24h
      if (session.timestamp && session.timestamp < Date.now() - 24 * 60 * 60 * 1000) {
        sessionStorage.removeItem(ADMIN_SESSION_KEY);
        return false;
      }

      const user: any = {
        uid: session.uid,
        userType: session.userType,
        email: session.email,
        firstName: session.firstName,
        lastName: session.lastName,
        communauteId: session.communauteId,
      };

      this.userSubject.next(user);
      return true;
    } catch {
      return false;
    }
  }

  // ✅ Session Employé
  private restoreEmployeeSession(): boolean {
    try {
      const raw = sessionStorage.getItem(EMPLOYEE_SESSION_KEY) || localStorage.getItem(EMPLOYEE_SESSION_KEY);
      if (!raw) return false;

      const session = JSON.parse(raw);
      if (!session.communauteId || !session.login) return false;

      if (session.expiry && session.expiry < Date.now()) {
        localStorage.removeItem(EMPLOYEE_SESSION_KEY);
        return false;
      }

      const user: EmployeeUser = this.buildEmployeeUser(session);
      this.userSubject.next(user);

      this.fb
        .adminGet<Communaute>(`communautes/${session.communauteId}`)
        .then(async (communaute) => {
          if (communaute?.firebaseConfig) {
            await this.fb.initClientDatabase(communaute.firebaseConfig, session.communauteId);
          }
          this.authReady$.next(true);
        })
        .catch(() => {
          this.authReady$.next(true);
        });

      return true;
    } catch {
      return false;
    }
  }

  // ── CONNEXION ADMIN ────────────────────────────────────────────────────────

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

    const userWithUid = { ...userData, uid: cred.user.uid };
    this.saveAdminSession(userWithUid);
    this.userSubject.next(userWithUid);

  }

  // ── CONNEXION EMPLOYÉ ──────────────────────────────────────────────────────

  async loginCommunaute(employe: any, communauteId: string, rememberMe = false): Promise<void> {
    // Nettoyer toute session admin existante
    sessionStorage.removeItem(ADMIN_SESSION_KEY);

    const user: EmployeeUser = this.buildEmployeeUser({ ...employe, communauteId });
    this.userSubject.next(user);

    const communaute = await this.fb.adminGet<Communaute>(`communautes/${communauteId}`);
    if (communaute?.firebaseConfig) {
      await this.fb.initClientDatabase(communaute.firebaseConfig, communauteId);
    }

    const sessionData = {
      uid: employe.id || '',
      login: employe.login || '',
      nom: employe.nom || '',
      prenom: employe.prenom || '',
      matricule: employe.matricule || '',
      services: employe.services || [],
      role: employe.role || '',
      communauteId,
      communauteNom: communaute?.nom || '',
      timestamp: Date.now(),
      ...(rememberMe ? { expiry: Date.now() + 30 * 24 * 60 * 60 * 1000 } : {}),
    };

    sessionStorage.setItem(EMPLOYEE_SESSION_KEY, JSON.stringify(sessionData));
    if (rememberMe) localStorage.setItem(EMPLOYEE_SESSION_KEY, JSON.stringify(sessionData));

  }

  // ── INSCRIPTION ────────────────────────────────────────────────────────────

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

  // ── GESTION DES INSCRIPTIONS ───────────────────────────────────────────────

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

    if (userData.userType !== 'employee') {
      const communauteId = await this.createCommunaute(userData);
      updates[`users/${userId}/communauteId`] = communauteId;
    }

    await this.fb.adminUpdate('', updates);

    await this.fb.adminSet(`notifications/${userId}/${Date.now()}`, {
      type: 'account_approved',
      title: 'Compte activé',
      message: 'Votre compte a été approuvé. Vous pouvez maintenant vous connecter.',
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
      [`users/${userId}/rejectedBy`]: adminId,
      [`pending_users/${userId}/status`]: 'rejected',
      [`pending_users/${userId}/reviewDate`]: now,
      [`pending_users/${userId}/rejectionReason`]: reason,
    });

    await this.fb.adminSet(`notifications/${userId}/${Date.now()}`, {
      type: 'account_rejected',
      title: 'Compte refusé',
      message: `Votre demande d'inscription a été refusée. Raison: ${reason}`,
      createdAt: now,
      read: false,
    });
  }

  // ── DÉCONNEXION ────────────────────────────────────────────────────────────

  async logout(): Promise<void> {
    // Nettoyer toutes les sessions
    sessionStorage.removeItem(EMPLOYEE_SESSION_KEY);
    sessionStorage.removeItem(ADMIN_SESSION_KEY);

    const local = localStorage.getItem(EMPLOYEE_SESSION_KEY);
    if (local) {
      const parsed = JSON.parse(local);
      if (!parsed.expiry || parsed.expiry < Date.now()) {
        localStorage.removeItem(EMPLOYEE_SESSION_KEY);
      }
    }

    if (this.auth.currentUser) {
      await signOut(this.auth);
    }

    this.userSubject.next(null);
    this.router.navigate(['/login']);
  }

  // ── HELPERS ────────────────────────────────────────────────────────────────

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
    let firstName = session.prenom || '';
    let lastName = session.nom || '';

    if (!firstName && lastName && lastName.includes(' ')) {
      const parts = lastName.trim().split(/\s+/);
      firstName = parts[0];
      lastName = parts.slice(1).join(' ');
    }

    return {
      uid: session.uid || session.userId || `local_${Date.now()}`,
      email: session.email || '',
      firstName: firstName,
      lastName: lastName,
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

  // ── GETTERS ────────────────────────────────────────────────────────────────

  get currentUser(): AppUser | null {
    return this.userSubject.value;
  }

  get isLoggedIn(): boolean {
    return this.userSubject.value !== null;
  }

  canManageService(serviceMatricule: string): boolean {
    if (this.isAdmin) return true;
    const u = this.userSubject.value as any;
    if (!u) return false;
    if (Array.isArray(u.services) && u.services.includes(serviceMatricule)) return true;
    return false;
  }

  get canEditEmployes(): boolean {
    if (this.isAdmin) return true;
    const u = this.userSubject.value as any;
    if (!u || !u.isCommunauteUser) return false;
    return Array.isArray(u.services) && u.services.length > 0 && u.services[0] !== 'Tous';
  }

  get isAdmin(): boolean {
    const u = this.userSubject.value as any;
    if (!u) return false;

    // Super admin SaaS
    if (u.userType === 'admin') return true;

    // Admin communauté via rôle
    if (u.services === 'Tous') return true;
    if (Array.isArray(u.services) && u.services[0] === 'Tous') return true;
    if (u.role === 'Administrateur' || u.role === 'admin') return true;

    return false;
  }

  get isCommunauteUser(): boolean {
    return (this.userSubject.value as any)?.isCommunauteUser === true;
  }

  get communauteId(): string | null {
    return (this.userSubject.value as any)?.communauteId ?? null;
  }

  getDefaultRoute(): string {
    const user: any = this.currentUser;
    if (!user) return '/login';
    if (user.status === 'pending') return '/register-pending';
    if (user.userType === 'admin' && !user.communauteId) return '/admin/dashboard';
    if (user.communauteId) return '/dashboard';
    return '/dashboard';
  }

  waitForAuth(): Promise<boolean> {
    return firstValueFrom(this.authReady$.pipe(filter((ready) => ready)));
  }
}
