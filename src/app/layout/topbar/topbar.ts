// topbar/topbar.ts
import { Component, inject, output, signal, OnInit, OnDestroy, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { EmployeService } from '../../core/services/employe.service';
import { AppUser } from '../../core/models/user.model';
import { Subject, takeUntil } from 'rxjs';

interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  route: string;
  type: 'employe' | 'service';
  iconBg: string;
}

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './topbar.html',
  styleUrl: './topbar.scss',
})
export class TopbarComponent implements OnInit, OnDestroy {
  private auth = inject(AuthService);
  private employeService = inject(EmployeService);
  private router = inject(Router);
  private destroy$ = new Subject<void>();

  toggleSidebar = output<void>();
  userMenuOpen = signal(false);
  user = signal<AppUser | null>(null);

  // Recherche
  searchQuery = signal('');
  showSearchResults = signal(false);
  searchResults = signal<SearchResult[]>([]);
  allEmployes: any[] = [];
  allServices: any[] = [];

  // Notifications
  unreadCount = signal(3);

  constructor() {
    this.auth.user$.pipe(takeUntil(this.destroy$)).subscribe((u) => this.user.set(u));

    this.employeService.employes$.pipe(takeUntil(this.destroy$)).subscribe((employes) => {
      this.allEmployes = employes;
    });

    this.employeService.services$.pipe(takeUntil(this.destroy$)).subscribe((services) => {
      this.allServices = services;
    });

    let timeoutId: any;
    effect(() => {
      const query = this.searchQuery();
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        this.performSearch(query);
      }, 300);
    });
  }

  ngOnInit(): void {
    document.addEventListener('keydown', this.handleKeyboardShortcut.bind(this));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    document.removeEventListener('keydown', this.handleKeyboardShortcut.bind(this));
  }

  private handleKeyboardShortcut(e: KeyboardEvent): void {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      const searchInput = document.querySelector('.search-bar input') as HTMLInputElement;
      if (searchInput) {
        searchInput.focus();
      }
    }
    if (e.key === 'Escape') {
      this.showSearchResults.set(false);
    }
  }

  onSearch(query: string): void {
    this.searchQuery.set(query);
  }

  clearSearch(): void {
    this.searchQuery.set('');
    this.showSearchResults.set(false);
    const input = document.querySelector('.search-bar input') as HTMLInputElement;
    if (input) input.focus();
  }

  private performSearch(query: string): void {
    if (!query || query.length < 2) {
      this.searchResults.set([]);
      return;
    }

    const lowerQuery = query.toLowerCase();
    const results: SearchResult[] = [];

    const employesMatch = this.allEmployes
      .filter(
        (e) =>
          e.prenom?.toLowerCase().includes(lowerQuery) ||
          e.nom?.toLowerCase().includes(lowerQuery) ||
          e.matricule?.toLowerCase().includes(lowerQuery) ||
          `${e.prenom} ${e.nom}`.toLowerCase().includes(lowerQuery),
      )
      .slice(0, 5);

    employesMatch.forEach((e) => {
      results.push({
        id: e.id,
        title: `${e.prenom} ${e.nom}`,
        subtitle: `${e.poste || 'Employé'} · ${e.matricule}`,
        route: `/employes/${e.id}`,
        type: 'employe',
        iconBg: this.getAvatarColor(e.id),
      });
    });

    const servicesMatch = this.allServices
      .filter(
        (s) =>
          s.nom?.toLowerCase().includes(lowerQuery) ||
          s.matricule?.toLowerCase().includes(lowerQuery),
      )
      .slice(0, 5);

    servicesMatch.forEach((s) => {
      results.push({
        id: s.id,
        title: s.nom,
        subtitle: `${s.matricule} · ${this.getEffectifService(s.matricule)} employés`,
        route: `/services`,
        type: 'service',
        iconBg: this.getServiceColor(s.matricule),
      });
    });

    this.searchResults.set(results.slice(0, 8));
  }

  private getEffectifService(matricule: string): number {
    return this.allEmployes.filter((e) => e.service === matricule && e.statut !== 'archive').length;
  }

  private getAvatarColor(id: string): string {
    const colors = ['#4f7df3', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
    const idx = id?.split('').reduce((a, c) => a + c.charCodeAt(0), 0) || 0;
    return colors[idx % colors.length];
  }

  private getServiceColor(matricule: string): string {
    const colors = ['#4f7df3', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
    const idx = matricule?.split('').reduce((a, c) => a + c.charCodeAt(0), 0) || 0;
    return colors[idx % colors.length];
  }

  userFirstName(): string {
    const u = this.user() as any;
    if (!u) return '';
    if (u.firstName) return u.firstName;
    if (u.prenom) return u.prenom;
    return 'Utilisateur';
  }

  currentDate(): string {
    return new Date().toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }

  userInitials(): string {
    const u = this.user();
    if (!u) return '?';
    if (u.firstName && u.lastName) return `${u.firstName[0]}${u.lastName[0]}`.toUpperCase();
    if (u.firstName) return u.firstName.substring(0, 2).toUpperCase();
    if (u.lastName) return u.lastName.substring(0, 2).toUpperCase();
    return (u as any).login?.substring(0, 2).toUpperCase() || '?';
  }

  userLabel(): string {
    const u = this.user() as any;
    if (!u) return '';
    if (u.isCommunauteUser) {
      if (u.firstName && u.lastName) return `${u.firstName} ${u.lastName}`;
      if (u.prenom && u.nom) return `${u.prenom} ${u.nom}`;
      return u.login || u.matricule || 'Employé';
    }
    if (u.userType === 'company') return u.companyName || 'Entreprise';
    return `${u.firstName} ${u.lastName}`;
  }

  roleLabel(): string {
    const u = this.user() as any;
    if (!u) return '';
    if (u.userType === 'admin') return 'Super Admin';
    if (this.auth.isAdmin && u.communauteId) return 'Admin Communauté';
    if (u.isCommunauteUser && u.role === 'Chargé de compte') return 'Chargé de compte';
    if (u.isCommunauteUser && u.role === 'Administrateur') return 'Admin';
    if (u.isCommunauteUser) return u.poste || 'Employé';
    if (u.userType === 'company') return 'Gérant';
    return 'Individuel';
  }

  toggleUserMenu(): void {
    this.userMenuOpen.update((v) => !v);
  }

  closeMenu(): void {
    this.userMenuOpen.set(false);
  }

  toggleNotif(): void {
    console.log('Notifications');
  }

  openCreateEmploye(): void {
    this.router.navigate(['/employes'], { queryParams: { action: 'create' } });
  }

  openQuickPointage(): void {
    this.router.navigate(['/pointages']);
  }

  userEmail(): string {
    const u = this.user() as any;
    if (!u) return '';
    return u.email || '';
  }

  onBlur(): void {
    setTimeout(() => {
      this.showSearchResults.set(false);
    }, 200);
  }

  async logout(): Promise<void> {
    await this.auth.logout();
  }
}
