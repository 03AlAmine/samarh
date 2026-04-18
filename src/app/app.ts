import { Component, inject, OnInit } from '@angular/core';
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
  '/admin',
  '/profil',
];

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterModule, ShellComponent],
  template: `
    @if (showShell) {
      <app-shell></app-shell>
    } @else {
      <router-outlet></router-outlet>
    }
  `,
})
export class AppComponent implements OnInit {
  private router = inject(Router);
  private auth = inject(AuthService);

  showShell = false;

  ngOnInit(): void {
    this.updateShell(this.router.url);

    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe((e: any) => this.updateShell(e.urlAfterRedirects));
  }

  private updateShell(url: string): void {
    this.showShell = SHELL_ROUTES.some((r) => url.startsWith(r));
  }
}
