// ─── SHELL LAYOUT ─────────────────────────────────────────────────────────────
// Composant racine qui encapsule la sidebar + header + contenu.
// Adapte le menu selon le rôle (admin SaaS vs gérant communauté).

import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { Subject, filter, takeUntil } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { ToastComponent } from '../../features/shared/toast/toast.component';
import { ConfirmDialogComponent } from '../../features/shared/confirm-dialog/confirm-dialog.component';
import { AppUser } from '../../core/models/user.model';

interface NavItem {
  label: string;
  route: string;
  icon: string;
  adminOnly?: boolean;
  communauteOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Tableau de bord', route: '/dashboard', icon: 'grid' },
  { label: 'Employés', route: '/employes', icon: 'users', communauteOnly: true },
  { label: 'Services', route: '/services', icon: 'briefcase', communauteOnly: true },
  { label: 'Pointages', route: '/pointages', icon: 'clock', communauteOnly: true },
  { label: 'Cartes', route: '/cartes', icon: 'id-card', communauteOnly: true },
  { label: 'Communautés', route: '/admin/communautes', icon: 'globe', adminOnly: true },
  { label: 'Utilisateurs', route: '/admin/utilisateurs', icon: 'shield', adminOnly: true },
  {
    label: 'Inscriptions',
    route: '/admin/register-requests',
    icon: 'user-plus',
    adminOnly: true,
  },
];

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterModule, ToastComponent, ConfirmDialogComponent],
  templateUrl: './shell.html',
  styleUrls: ['./shell.scss'],
})
export class ShellComponent implements OnInit, OnDestroy {
  private auth = inject(AuthService);
  private router = inject(Router);
  private destroy$ = new Subject<void>();

  // Signals
  sidebarOpen = signal(false);
  userMenuOpen = signal(false);
  currentRoute = signal('');

  user = signal<AppUser | null>(null);

  navItems = computed(() => {
    const u = this.user() as any;
    if (!u) return [];

    const isAdmin = this.auth.isAdmin;
    const hasCommunaute = !!u.communauteId || u.isCommunauteUser;

    return NAV_ITEMS.filter((item) => {
      if (item.adminOnly) return isAdmin;
      if (item.communauteOnly) return hasCommunaute || isAdmin;
      return true;
    });
  });

// shell.ts

userInitials(): string {
  const u = this.user();
  if (!u) return '?';

  // Utiliser firstName/lastName (déjà remplis par buildEmployeeUser)
  if (u.firstName && u.lastName) {
    return `${u.firstName[0]}${u.lastName[0]}`.toUpperCase();
  }
  if (u.firstName) {
    return u.firstName.substring(0, 2).toUpperCase();
  }
  if (u.lastName) {
    return u.lastName.substring(0, 2).toUpperCase();
  }
  // Fallback sur login pour les employés sans nom
  const login = (u as any).login;
  if (login) return login.substring(0, 2).toUpperCase();

  return '?';
}

userLabel = computed(() => {
  const u = this.user() as any;
  if (!u) return '';

  if (u.isCommunauteUser) {
    // Utiliser firstName/lastName (déjà remplis par buildEmployeeUser)
    if (u.firstName && u.lastName) return `${u.firstName} ${u.lastName}`;
    return u.login || u.matricule || 'Employé';
  }

  if (u.userType === 'company') return u.companyName || 'Entreprise';
  return `${u.firstName} ${u.lastName}`;
});

  roleLabel = computed(() => {
    const u = this.user() as any;
    if (!u) return '';
    if (u.userType === 'admin') return 'Super Admin';
    if (u.userType === 'company' || u.userType === 'individual') return 'Gérant';
    if (u.isCommunauteUser) return u.poste || 'Employé';
    if (u.userType === 'company') return 'Gérant';
    return 'Individuel';
  });

  ngOnInit(): void {
    this.auth.user$.pipe(takeUntil(this.destroy$)).subscribe((u) => this.user.set(u));

    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntil(this.destroy$),
      )
      .subscribe((e: any) => {
        this.currentRoute.set(e.urlAfterRedirects);
        this.sidebarOpen.set(false);
        this.userMenuOpen.set(false);
      });

    this.currentRoute.set(this.router.url);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  isActive(route: string): boolean {
    return this.currentRoute().startsWith(route);
  }

  toggleSidebar(): void {
    this.sidebarOpen.update((v) => !v);
  }

  toggleUserMenu(): void {
    this.userMenuOpen.update((v) => !v);
  }

  async logout(): Promise<void> {
    await this.auth.logout();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (!target.closest('.user-menu-trigger') && !target.closest('.user-dropdown')) {
      this.userMenuOpen.set(false);
    }
    if (
      !target.closest('.sidebar-toggle') &&
      !target.closest('.sidebar') &&
      window.innerWidth < 1024
    ) {
      this.sidebarOpen.set(false);
    }
  }
}
