// features/auth/login-employe/login-employe.component.ts
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthEmployeService } from '../../../core/services/auth-employe.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-login-employe',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="login-employe">
      <div class="login-card">
        <div class="login-header">
          <div class="logo">
            <i class="fas fa-building"></i>
            <span>Sama<span>RH</span></span>
          </div>
          <h2>Espace employé</h2>
          <p>Connectez-vous avec votre matricule ou email et votre code PIN</p>
        </div>

        <form (ngSubmit)="onSubmit()" class="login-form">
          <div class="form-group">
            <label>
              <i class="fas fa-id-card"></i>
              Matricule ou Email
            </label>
            <input
              type="text"
              [(ngModel)]="identifiant"
              name="identifiant"
              placeholder="EMP001 ou email@exemple.com"
              required
              autocomplete="off"
            >
          </div>

          <div class="form-group">
            <label>
              <i class="fas fa-lock"></i>
              Code PIN (4 chiffres)
            </label>
            <div class="pin-input">
              <input
                type="password"
                [(ngModel)]="pin"
                name="pin"
                maxlength="4"
                placeholder="••••"
                required
              >
              <button type="button" class="toggle-pin" (click)="togglePinVisibility()">
                <i class="fas" [class.fa-eye]="showPin" [class.fa-eye-slash]="!showPin"></i>
              </button>
            </div>
          </div>

          <button type="submit" class="btn-login" [disabled]="loading">
            @if (loading) {
              <i class="fas fa-spinner fa-spin"></i>
            } @else {
              <i class="fas fa-sign-in-alt"></i>
            }
            {{ loading ? 'Connexion...' : 'Se connecter' }}
          </button>
        </form>

        <div class="login-footer">
          <a routerLink="/login">Espace administrateur →</a>
        </div>
      </div>

      @if (errorMessage) {
        <div class="error-toast">
          <i class="fas fa-exclamation-circle"></i>
          {{ errorMessage }}
        </div>
      }
    </div>
  `,
  styles: [`
    .login-employe {
      min-height: 100vh;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .login-card {
      background: white;
      border-radius: 24px;
      padding: 40px;
      width: 100%;
      max-width: 420px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.15);
    }
    .login-header {
      text-align: center;
      margin-bottom: 32px;
    }
    .logo {
      font-size: 24px;
      font-weight: 600;
      color: #1e293b;
      margin-bottom: 20px;
      i { color: #4f7df3; margin-right: 8px; }
      span span { color: #4f7df3; }
    }
    .login-header h2 {
      font-size: 24px;
      font-weight: 700;
      color: #1e293b;
      margin-bottom: 8px;
    }
    .login-header p {
      color: #64748b;
      font-size: 13px;
    }
    .form-group {
      margin-bottom: 20px;
    }
    .form-group label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: #1e293b;
      margin-bottom: 8px;
    }
    .form-group label i {
      margin-right: 8px;
      color: #4f7df3;
    }
    .form-group input {
      width: 100%;
      padding: 12px 16px;
      border: 1.5px solid #e2e8f0;
      border-radius: 12px;
      font-size: 14px;
      transition: all 0.2s;
    }
    .form-group input:focus {
      outline: none;
      border-color: #4f7df3;
      box-shadow: 0 0 0 3px rgba(79,125,243,0.1);
    }
    .pin-input {
      position: relative;
    }
    .pin-input input {
      padding-right: 45px;
      font-family: monospace;
      font-size: 18px;
      letter-spacing: 4px;
    }
    .toggle-pin {
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      cursor: pointer;
      color: #94a3b8;
    }
    .btn-login {
      width: 100%;
      padding: 14px;
      background: #4f7df3;
      color: white;
      border: none;
      border-radius: 12px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-login:hover {
      background: #3b6ed8;
      transform: translateY(-1px);
    }
    .btn-login i { margin-right: 8px; }
    .login-footer {
      text-align: center;
      margin-top: 24px;
      padding-top: 20px;
      border-top: 1px solid #e2e8f0;
    }
    .login-footer a {
      color: #4f7df3;
      text-decoration: none;
      font-size: 13px;
    }
    .error-toast {
      position: fixed;
      bottom: 30px;
      left: 50%;
      transform: translateX(-50%);
      background: #ef4444;
      color: white;
      padding: 12px 24px;
      border-radius: 12px;
      font-size: 13px;
      animation: slideUp 0.3s ease;
    }
    @keyframes slideUp {
      from { opacity: 0; transform: translateX(-50%) translateY(20px); }
      to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
  `]
})
export class LoginEmployeComponent {
  private authEmploye = inject(AuthEmployeService);
  private router = inject(Router);
  private toast = inject(ToastService);

  identifiant = '';
  pin = '';
  loading = false;
  errorMessage = '';
  showPin = false;

  async onSubmit(): Promise<void> {
    if (!this.identifiant || !this.pin) {
      this.errorMessage = 'Veuillez remplir tous les champs';
      return;
    }

    if (!/^\d{4}$/.test(this.pin)) {
      this.errorMessage = 'Le code PIN doit comporter 4 chiffres';
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    try {
      const employe = await this.authEmploye.login(this.identifiant, this.pin);
      this.toast.success(`Bienvenue ${employe.prenom} ${employe.nom}`);
      this.router.navigate(['/espace-employe/dashboard']);
    } catch (error: any) {
      this.errorMessage = error.message;
    } finally {
      this.loading = false;
    }
  }

  togglePinVisibility(): void {
    this.showPin = !this.showPin;
    const input = document.querySelector('.pin-input input') as HTMLInputElement;
    if (input) input.type = this.showPin ? 'text' : 'password';
  }
}
