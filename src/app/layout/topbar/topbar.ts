import {
  Component, inject, output, signal, OnInit, OnDestroy,
  effect, ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { EmployeService } from '../../core/services/employe.service';
import { NotificationService, AppNotification } from '../../core/services/notification.service';
import { AppUser } from '../../core/models/user.model';

interface SearchResult {
  id: string; title: string; subtitle: string;
  route: string; type: 'employe' | 'service'; iconBg: string;
}

@Component({
  selector: 'app-topbar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule],
  templateUrl: './topbar.html',
  styleUrls: ['./topbar.scss'],
})
export class TopbarComponent implements OnInit, OnDestroy {
  private auth           = inject(AuthService);
  private employeService = inject(EmployeService);
  private router         = inject(Router);
  readonly notifSvc      = inject(NotificationService);
  private destroy$       = new Subject<void>();

  toggleSidebar = output<void>();

  user            = signal<AppUser | null>(null);
  userMenuOpen    = signal(false);
  notifPanelOpen  = signal(false);
  unreadCount     = signal(0);
  notifications   = signal<AppNotification[]>([]);

  // Recherche
  searchQuery       = signal('');
  showSearchResults = signal(false);
  searchLoading     = signal(false);
  searchResults     = signal<SearchResult[]>([]);
  private searchCache = new Map<string, SearchResult[]>();
  allEmployes: any[] = [];
  allServices: any[] = [];

  constructor() {
    this.auth.user$.pipe(takeUntil(this.destroy$)).subscribe(u => this.user.set(u));

    this.employeService.employes$.pipe(takeUntil(this.destroy$))
      .subscribe(e => this.allEmployes = e);

    this.employeService.services$.pipe(takeUntil(this.destroy$))
      .subscribe(s => this.allServices = s);

    // Notifications temps réel
    this.notifSvc.notifications$.pipe(takeUntil(this.destroy$))
      .subscribe(list => this.notifications.set(list));

    this.notifSvc.unreadCount$.pipe(takeUntil(this.destroy$))
      .subscribe(n => this.unreadCount.set(n));

    // Recherche avec debounce
    let timer: any;
    effect(() => {
      const q = this.searchQuery();
      clearTimeout(timer);
      timer = setTimeout(() => this.performSearch(q), 300);
    });
  }

  ngOnInit(): void {
    document.addEventListener('keydown', this.onKeydown);
    document.addEventListener('click',   this.onOutsideClick);
  }

  ngOnDestroy(): void {
    this.destroy$.next(); this.destroy$.complete();
    document.removeEventListener('keydown', this.onKeydown);
    document.removeEventListener('click',   this.onOutsideClick);
  }

  private onKeydown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      (document.querySelector('.search-bar input') as HTMLInputElement)?.focus();
    }
    if (e.key === 'Escape') {
      this.showSearchResults.set(false);
      this.notifPanelOpen.set(false);
    }
  };

  private onOutsideClick = (e: MouseEvent) => {
    const t = e.target as HTMLElement;
    if (!t.closest('.user-menu-trigger') && !t.closest('.user-dropdown'))
      this.userMenuOpen.set(false);
    if (!t.closest('.search-wrapper'))
      this.showSearchResults.set(false);
    if (!t.closest('.notif-wrapper'))
      this.notifPanelOpen.set(false);
  };

  // ── Notifications ──────────────────────────────────────────────────────────

  toggleNotif(): void {
    this.notifPanelOpen.update(v => !v);
    this.userMenuOpen.set(false);
  }

  async markRead(n: AppNotification, e: Event): Promise<void> {
    e.stopPropagation();
    if (!n.read) await this.notifSvc.markRead(n.id);
  }

  async markAllRead(): Promise<void> {
    await this.notifSvc.markAllRead(this.notifications());
  }

  async deleteNotif(n: AppNotification, e: Event): Promise<void> {
    e.stopPropagation();
    await this.notifSvc.delete(n.id);
  }

  goToNotif(n: AppNotification): void {
    if (!n.read) this.notifSvc.markRead(n.id);
    this.notifPanelOpen.set(false);
    if (n.actionUrl) this.router.navigateByUrl(n.actionUrl);
  }

  timeAgo(d: string): string { return this.notifSvc.timeAgo(d); }
  notifColor(type: any): string { return this.notifSvc.colorFor(type); }

  // ── Recherche ─────────────────────────────────────────────────────────────

  onSearch(q: string): void { this.searchQuery.set(q); }
  clearSearch(): void {
    this.searchQuery.set('');
    this.showSearchResults.set(false);
    (document.querySelector('.search-bar input') as HTMLInputElement)?.focus();
  }
  onBlur(): void { setTimeout(() => this.showSearchResults.set(false), 200); }

  private async performSearch(q: string): Promise<void> {
    if (!q || q.length < 2) { this.searchResults.set([]); return; }
    if (this.searchCache.has(q)) { this.searchResults.set(this.searchCache.get(q)!); return; }
    this.searchLoading.set(true);
    const lq = q.toLowerCase();
    const results: SearchResult[] = [
      ...this.allEmployes.filter(e =>
        `${e.prenom} ${e.nom}`.toLowerCase().includes(lq) ||
        (e.matricule || '').toLowerCase().includes(lq)
      ).slice(0, 5).map(e => ({
        id: e.id, title: `${e.prenom} ${e.nom}`,
        subtitle: `${e.poste || 'Employé'} · ${e.matricule}`,
        route: `/employes/${e.id}`, type: 'employe' as const,
        iconBg: this.getColor(e.id),
      })),
      ...this.allServices.filter(s =>
        s.nom?.toLowerCase().includes(lq)
      ).slice(0, 3).map(s => ({
        id: s.id, title: s.nom,
        subtitle: `${s.matricule} · ${this.allEmployes.filter(e => e.service === s.matricule).length} employés`,
        route: '/services', type: 'service' as const,
        iconBg: this.getColor(s.matricule),
      })),
    ].slice(0, 8);
    this.searchCache.set(q, results);
    this.searchResults.set(results);
    this.searchLoading.set(false);
  }

  private getColor(s: string): string {
    const colors = ['#4f7df3','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4'];
    return colors[(s || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length];
  }

  // ── User helpers ──────────────────────────────────────────────────────────

  userFirstName(): string { return (this.user() as any)?.firstName || (this.user() as any)?.prenom || 'Utilisateur'; }
  currentDate(): string {
    return new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  userInitials(): string {
    const u = this.user();
    if (!u) return '?';
    if (u.firstName && u.lastName) return `${u.firstName[0]}${u.lastName[0]}`.toUpperCase();
    return (u as any).login?.substring(0, 2).toUpperCase() || '?';
  }
  userLabel(): string {
    const u = this.user() as any;
    if (!u) return '';
    return u.isCommunauteUser
      ? (u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.login || 'Employé')
      : (u.companyName || `${u.firstName} ${u.lastName}`);
  }
  roleLabel(): string {
    const u = this.user() as any;
    if (!u) return '';
    if (u.userType === 'admin') return 'Super Admin';
    if (this.auth.isAdmin) return 'Administrateur';
    if (u.role === 'Chargé de compte') return 'Chargé de compte';
    return u.poste || 'Employé';
  }
  userEmail(): string { return (this.user() as any)?.email || ''; }
  toggleUserMenu(): void { this.userMenuOpen.update(v => !v); this.notifPanelOpen.set(false); }
  closeMenu(): void { this.userMenuOpen.set(false); }
  openCreateEmploye(): void { this.router.navigate(['/employes'], { queryParams: { action: 'create' } }); }
  openQuickPointage(): void { this.router.navigate(['/pointages']); }
  async logout(): Promise<void> { await this.auth.logout(); }
}
