// ─── REGISTER ─────────────────────────────────────────────────────────────────

import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

type UserType = 'individual' | 'company';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './register.html',
  styleUrls: ['./register.scss'],
})
export class RegisterComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);

  userType = signal<UserType>('individual');
  loading = signal(false);
  error = signal('');
  showPassword = signal(false);

  form = this.fb.group({
    firstName: ['', [Validators.required, Validators.minLength(2)]],
    lastName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', Validators.required],
    password: ['', [Validators.required, Validators.minLength(6)]],
    // Entreprise uniquement
    companyName: [''],
    industry: [''],
    // Consentement
    terms: [false, Validators.requiredTrue],
  });

  setUserType(type: UserType): void {
    this.userType.set(type);
    const companyName = this.form.get('companyName')!;
    if (type === 'company') {
      companyName.setValidators(Validators.required);
    } else {
      companyName.clearValidators();
    }
    companyName.updateValueAndValidity();
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.error.set('');

    try {
      await this.auth.register({
        ...this.form.value,
        userType: this.userType(),
      });
      this.router.navigate(['/register-pending']);
    } catch (e: any) {
      this.error.set(this.friendlyError(e));
    } finally {
      this.loading.set(false);
    }
  }

  private friendlyError(e: any): string {
    const msg: Record<string, string> = {
      'auth/email-already-in-use': 'Cet email est déjà utilisé.',
      'auth/invalid-email': 'Adresse email invalide.',
      'auth/weak-password': 'Mot de passe trop faible (min. 6 caractères).',
    };
    return msg[e.code] ?? e.message ?? 'Une erreur est survenue.';
  }

  togglePassword(): void { this.showPassword.update((v) => !v); }

  get f() { return this.form.controls; }
}
