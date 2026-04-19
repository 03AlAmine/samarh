import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from './core/services/auth.service';
import { ShellComponent } from './layout/shell/shell';

// Routes qui affichent le layout shell (sidebar + header)
const SHELL_ROUTES = [
  '/dashboard',
  '/employes',
  '/services',
  '/pointages',
  '/cartes',
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
              <path d="M12 2L2 7l10 5 10-5-10-5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
              <path d="M2 17l10 5 10-5" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
              <path d="M2 12l10 5 10-5" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
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
  `,
  styles: [`
    .app-splash {
      position: fixed; inset: 0;
      background: var(--color-background-primary, #fff);
      display: flex; align-items: center; justify-content: center;
      z-index: 9999;
    }
    .splash-inner {
      display: flex; flex-direction: column; align-items: center; gap: 24px;
    }
    .splash-logo {
      display: flex; align-items: center; gap: 10px;
      font-size: 22px; font-weight: 400; color: #111827;
      svg { color: #4f7df3; }
      strong { color: #4f7df3; }
    }
    .splash-spinner {
      width: 32px; height: 32px;
      border: 3px solid #e5e7eb;
      border-top-color: #4f7df3;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  `],
})
export class AppComponent implements OnInit {
  private router = inject(Router);
  private auth   = inject(AuthService);

  showShell  = false;
  authReady  = signal(false);

  ngOnInit(): void {
    // Attendre que l'auth soit prête (session restaurée + DB client initialisée)
    this.auth.authReady$.pipe(
      filter(ready => ready),
    ).subscribe(() => {
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
