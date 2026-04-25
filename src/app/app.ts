// app.component.ts - version corrigée avec le modal de confirmation
import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from './core/services/auth.service';
import { ConfirmDialogService } from './core/services/confirm-dialog.service';
import { ShellComponent } from './layout/shell/shell';

// Routes qui affichent le layout shell (sidebar + header)
const SHELL_ROUTES = [
  '/dashboard',
  '/employes',
  '/services',
  '/pointages',
  '/cartes',
  '/statistiques',
  '/admin',
  '/profil',
];

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterModule, ShellComponent],
  template: `
    <!-- ── Loader global : affiché jusqu'à ce que l'auth soit initialisée ── -->
    @if (!authReady()) {
      <div class="app-splash">
        <div class="splash-inner">
          <div class="splash-logo">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2L2 7l10 5 10-5-10-5Z"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linejoin="round"
              />
              <path
                d="M2 17l10 5 10-5"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linejoin="round"
              />
              <path
                d="M2 12l10 5 10-5"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linejoin="round"
              />
            </svg>
            <span><strong>Sama</strong>RH</span>
          </div>
          <div class="splash-spinner"></div>
        </div>
      </div>
    }

    @if (authReady()) {
      @if (showShell) {
        <app-shell></app-shell>
      } @else {
        <router-outlet></router-outlet>
      }
    }

    <!-- ✅ MODAL DE CONFIRMATION (AJOUTER ICI) -->
    @if (confirmDialog.options(); as opt) {
      <div class="confirm-overlay" (click)="confirmDialog.cancel()">
        <div class="confirm-modal" (click)="$event.stopPropagation()">
          <div class="confirm-header">
            <h3>{{ opt.title || 'Confirmation' }}</h3>
          </div>
          <div class="confirm-body">
            <p>{{ opt.message }}</p>
          </div>
          <div class="confirm-footer">
            <button class="btn-cancel" (click)="confirmDialog.cancel()">
              {{ opt.cancelLabel || 'Annuler' }}
            </button>
            <button
              class="btn-confirm"
              [class.btn-danger]="opt.type === 'danger'"
              [class.btn-warning]="opt.type === 'warning'"
              [class.btn-info]="opt.type === 'info'"
              (click)="confirmDialog.confirm()"
            >
              {{ opt.confirmLabel || 'Confirmer' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .app-splash {
        position: fixed;
        inset: 0;
        background: var(--color-background-primary, #fff);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
      }
      .splash-inner {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 24px;
      }
      .splash-logo {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 22px;
        font-weight: 400;
        color: #111827;
        svg {
          color: #4f7df3;
        }
        strong {
          color: #4f7df3;
        }
      }
      .splash-spinner {
        width: 32px;
        height: 32px;
        border: 3px solid #e5e7eb;
        border-top-color: #4f7df3;
        border-radius: 50%;
        animation: spin 0.7s linear infinite;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      /* ✅ STYLES DU MODAL DE CONFIRMATION */
      .confirm-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(4px);
        z-index: 2000;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: fadeIn 0.2s ease;
      }

      .confirm-modal {
        background: white;
        border-radius: 20px;
        width: 90%;
        max-width: 400px;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
        animation: slideUp 0.2s ease;
        overflow: hidden;
      }

      .confirm-header {
        padding: 20px 24px 0;
        h3 {
          font-size: 18px;
          font-weight: 600;
          margin: 0;
          color: #1e293b;
        }
      }

      .confirm-body {
        padding: 16px 24px;
        p {
          font-size: 14px;
          color: #475569;
          margin: 0;
          line-height: 1.5;
        }
      }

      .confirm-footer {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        padding: 16px 24px 24px;
        background: #f8fafc;

        button {
          padding: 8px 20px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
        }

        .btn-cancel {
          background: transparent;
          color: #64748b;
          &:hover {
            background: #e2e8f0;
          }
        }

        .btn-confirm {
          background: #3b82f6;
          color: white;
          &:hover {
            background: #2563eb;
          }
          &.btn-danger {
            background: #ef4444;
            &:hover {
              background: #dc2626;
            }
          }
          &.btn-warning {
            background: #f59e0b;
            &:hover {
              background: #d97706;
            }
          }
        }
      }

      @keyframes fadeIn {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      @keyframes slideUp {
        from {
          transform: translateY(20px);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }
    `,
  ],
})
export class AppComponent implements OnInit {
  private router = inject(Router);
  private auth = inject(AuthService);

  // ✅ Injecter ConfirmDialogService
  confirmDialog = inject(ConfirmDialogService);

  showShell = false;
  authReady = signal(false);

  ngOnInit(): void {
    // Attendre que l'auth soit prête (session restaurée + DB client initialisée)
    this.auth.authReady$.pipe(filter((ready) => ready)).subscribe(() => {
      this.authReady.set(true);
    });

    this.updateShell(this.router.url);

    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe((e: any) => this.updateShell(e.urlAfterRedirects));
  }

  private updateShell(url: string): void {
    this.showShell = SHELL_ROUTES.some((r) => url.startsWith(r));
  }
}
