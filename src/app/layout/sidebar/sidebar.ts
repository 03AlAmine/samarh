// sidebar/sidebar.ts
import { Component, input, computed, output, HostListener, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AppUser } from '../../core/models/user.model';

interface NavItem {
  label: string;
  route: string;
  icon: string;
  adminOnly?: boolean;
  communauteOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Tableau de bord',  route: '/dashboard',               icon: 'grid'      },
  { label: 'Employés',         route: '/employes',                 icon: 'users',     communauteOnly: true },
  { label: 'Services',         route: '/services',                 icon: 'briefcase', communauteOnly: true },
  { label: 'Pointages',        route: '/pointages',                icon: 'clock',     communauteOnly: true },
  { label: 'Cartes',           route: '/cartes',                   icon: 'id-card',   communauteOnly: true },
  { label: 'Communautés',      route: '/admin/communautes',        icon: 'globe',     adminOnly: true },
  { label: 'Utilisateurs',     route: '/admin/utilisateurs',       icon: 'shield',    adminOnly: true },
  { label: 'Inscriptions',     route: '/admin/register-requests',  icon: 'user-plus', adminOnly: true },
];

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class SidebarComponent {
  user        = input<AppUser | null>(null);
  currentRoute = input<string>('');
  sidebarOpen  = input<boolean>(false);
  isCollapsed  = input<boolean>(false);

  collapsedChange = output<boolean>();

  // Détection mobile
  screenWidth = signal(window.innerWidth);

  isMobile = computed(() => this.screenWidth() < 1024);

  @HostListener('window:resize')
  onResize(): void {
    this.screenWidth.set(window.innerWidth);
  }

  filteredNavItems = computed(() => {
    const u = this.user() as any;
    if (!u) return [];

    const isAdmin       = u.userType === 'admin';
    const hasCommunaute = !!u.communauteId || u.isCommunauteUser;

    return NAV_ITEMS.filter(item => {
      if (item.adminOnly)      return isAdmin;
      if (item.communauteOnly) return hasCommunaute || isAdmin;
      return true;
    });
  });

  isActive(route: string): boolean {
    return this.currentRoute().startsWith(route);
  }

  toggleCollapse(): void {
    this.collapsedChange.emit(!this.isCollapsed());
  }

  userInitials(): string {
    const u = this.user();
    if (!u) return '?';
    if (u.firstName && u.lastName) return `${u.firstName[0]}${u.lastName[0]}`.toUpperCase();
    if (u.firstName) return u.firstName.substring(0, 2).toUpperCase();
    if (u.lastName)  return u.lastName.substring(0, 2).toUpperCase();
    return (u as any).login?.substring(0, 2).toUpperCase() || '?';
  }

  userLabel(): string {
    const u = this.user() as any;
    if (!u) return '';
    if (u.isCommunauteUser) {
      if (u.firstName && u.lastName) return `${u.firstName} ${u.lastName}`;
      return u.login || u.matricule || 'Employé';
    }
    if (u.userType === 'company') return u.companyName || 'Entreprise';
    return `${u.firstName} ${u.lastName}`;
  }

  roleLabel(): string {
    const u = this.user() as any;
    if (!u) return '';
    if (u.userType === 'admin')                              return 'Super Admin';
    if ((u as any).isAdmin && u.communauteId)                return 'Admin Communauté';
    if (u.isCommunauteUser && u.role === 'Chargé de compte') return 'Chargé de compte';
    if (u.isCommunauteUser && u.role === 'Administrateur')   return 'Admin';
    if (u.isCommunauteUser)                                  return u.poste || 'Employé';
    if (u.userType === 'company')                            return 'Gérant';
    return 'Individuel';
  }
}
