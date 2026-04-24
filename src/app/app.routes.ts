import { Routes } from '@angular/router';
import { authGuard, adminGuard, publicGuard } from './core/guards';
import { servicesGuard } from './core/guards/services.guard';

export const routes: Routes = [
  // ── Publiques ──────────────────────────────────────────────────────────────
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then((c) => c.LoginComponent),
    canActivate: [publicGuard],
    title: 'Connexion',
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./features/auth/register/register').then((c) => c.RegisterComponent),
    canActivate: [publicGuard],
    title: 'Inscription',
  },
  {
    path: 'register-pending',
    loadComponent: () =>
      import('./features/auth/register-pending/register-pending').then(
        (c) => c.RegisterPendingComponent,
      ),
    // Pas de publicGuard — un utilisateur "pending" est connecté mais pas encore actif
    title: 'Demande en attente',
  },

  // ── Protégées (tout utilisateur connecté) ─────────────────────────────────
  {
    path: 'dashboard',
    loadComponent: () => import('./features/dashboard/dashboard').then((c) => c.DashboardComponent),
    canActivate: [authGuard],
    title: 'Tableau de bord',
  },
  {
    path: 'employes',
    loadComponent: () =>
      import('./features/employes/list-employes/list-employes').then(
        (c) => c.ListEmployesComponent,
      ),
    canActivate: [authGuard],
    title: 'Employés',
  },
  {
    path: 'employes/:id',
    loadComponent: () =>
      import('./features/employes/detail-employe/detail-employe').then(
        (c) => c.DetailEmployeComponent,
      ),
    canActivate: [authGuard],
    title: 'Détail employé',
  },
  {
    path: 'services',
    loadComponent: () =>
      import('./features/services/list-services/list-services').then(
        (c) => c.ListServicesComponent,
      ),
    canActivate: [servicesGuard],
    title: 'Services',
  },
  {
    path: 'pointages',
    loadComponent: () => import('./features/pointages/pointages').then((c) => c.PointagesComponent),
    canActivate: [authGuard],
    title: 'Pointages',
  },
  {
    path: 'cartes',
    loadComponent: () => import('./features/cartes/cartes').then((c) => c.CartesComponent),
    canActivate: [authGuard],
    title: 'Cartes employés',
  },

  // ── Admin SaaS uniquement ──────────────────────────────────────────────────
  {
    path: 'admin/communautes',
    loadComponent: () =>
      import('./features/admin/communautes/communautes').then((c) => c.CommunautesComponent),
    canActivate: [authGuard, adminGuard],
    title: 'Communautés',
  },
  {
    path: 'admin/utilisateurs',
    loadComponent: () =>
      import('./features/admin/utilisateurs/utilisateurs').then((c) => c.UtilisateursComponent),
    canActivate: [authGuard, adminGuard],
    title: 'Utilisateurs',
  },
  {
    path: 'admin/register-requests',
    loadComponent: () =>
      import('./features/admin/register-requests/register-requests').then(
        (c) => c.RegisterRequestsComponent,
      ),
    canActivate: [authGuard, adminGuard],
    title: "Demandes d'inscription",
  },

  // ── Profil ─────────────────────────────────────────────────────────────────
  {
    path: 'profil',
    loadComponent: () => import('./features/auth/profil/profil').then((c) => c.ProfilComponent),
    canActivate: [authGuard],
    title: 'Mon profil',
  },

  // ── Accueil & fallback ─────────────────────────────────────────────────────
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full',
  },
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
