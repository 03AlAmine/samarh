// ─── LOGIN ────────────────────────────────────────────────────────────────────
// Deux étapes : 1) Code communauté ou "ADMIN"  2) Login + mot de passe

import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { FirebaseService } from '../../../core/services/firebase.service';
import { EmployeService } from '../../../core/services/employe.service';
import { Communaute } from '../../../core/models/user.model';

type Step = 'code' | 'login';
type LoginMode = 'admin' | 'communaute';

const ADMIN_CODES = ['ADMIN', 'admin', 'superadmin'];

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './login.html',
  styleUrls: ['./login.scss'],
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private firebase = inject(FirebaseService);
  private employeService = inject(EmployeService);
  private router = inject(Router);

  // State
  step = signal<Step>('code');
  mode = signal<LoginMode | null>(null);
  communaute = signal<Communaute | null>(null);
  loading = signal(false);
  error = signal('');
  showPassword = signal(false);

  // Étape 1 : code d'accès
  codeForm = this.fb.group({
    code: ['', Validators.required],
  });

  // Étape 2 : identifiants
  loginForm = this.fb.group({
    login: ['', Validators.required],
    password: ['', [Validators.required, Validators.minLength(4)]],
    rememberMe: [false],
  });

  // ── Étape 1 : valider le code ─────────────────────────────────────────────

  async validateCode(): Promise<void> {
    if (this.codeForm.invalid) return;
    const code = this.codeForm.value.code!.trim();

    this.loading.set(true);
    this.error.set('');

    try {
      if (ADMIN_CODES.includes(code)) {
        this.mode.set('admin');
        this.loginForm.get('login')!.setValidators([Validators.required, Validators.email]);
        this.loginForm.get('login')!.updateValueAndValidity();
        this.step.set('login');
        return;
      }

      // Chercher la communauté par son ID ou son code
      const communautes = await this.firebase.adminGet<Record<string, Communaute>>('communautes');
      if (!communautes) throw new Error('Aucune communauté trouvée.');

      const found = Object.values(communautes).find(
        (c: any) =>
          c.id === code ||
          c.code === code ||
          c.codeAcces === code ||
          c.communauteCode === code,
      ) as Communaute | undefined;

      if (!found) throw new Error('Code invalide. Vérifiez votre code d\'accès.');

      // Initialiser la base Firebase client
      if (found.firebaseConfig) {
        await this.firebase.initClientDatabase(found.firebaseConfig, found.id);
      }

      this.communaute.set(found);
      this.mode.set('communaute');
      this.loginForm.get('login')!.setValidators([Validators.required]);
      this.loginForm.get('login')!.updateValueAndValidity();
      this.step.set('login');
    } catch (e: any) {
      this.error.set(e.message || 'Code invalide.');
    } finally {
      this.loading.set(false);
    }
  }

  // ── Étape 2 : connexion ───────────────────────────────────────────────────

  async submit(): Promise<void> {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    const { login, password, rememberMe } = this.loginForm.value;
    this.loading.set(true);
    this.error.set('');

    try {
      if (this.mode() === 'admin') {
        await this.auth.login(login!, password!, rememberMe ?? false);
        this.router.navigate([this.auth.getDefaultRoute()]);
      } else {
        await this.loginCommunaute(login!, password!, rememberMe ?? false);
      }
    } catch (e: any) {
      this.error.set(this.friendlyError(e));
    } finally {
      this.loading.set(false);
    }
  }

  private async loginCommunaute(login: string, password: string, rememberMe: boolean): Promise<void> {
    const employe = await this.employeService.findByLogin(login, password);
    if (!employe) throw new Error('Login ou mot de passe incorrect.');

    await this.auth.loginCommunaute(employe, this.communaute()!.id, rememberMe);
    this.router.navigate(['/dashboard']);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  back(): void {
    this.step.set('code');
    this.mode.set(null);
    this.communaute.set(null);
    this.error.set('');
    this.loginForm.reset();
  }

  togglePassword(): void {
    this.showPassword.update((v) => !v);
  }

  private friendlyError(e: any): string {
    const msg: Record<string, string> = {
      'auth/user-not-found': 'Aucun compte trouvé avec cet email.',
      'auth/wrong-password': 'Mot de passe incorrect.',
      'auth/invalid-credential': 'Identifiants invalides.',
      'auth/too-many-requests': 'Trop de tentatives. Réessayez plus tard.',
    };
    return msg[e.code] ?? e.message ?? 'Une erreur est survenue.';
  }

  get f() { return this.loginForm.controls; }
  get fc() { return this.codeForm.controls; }
}
