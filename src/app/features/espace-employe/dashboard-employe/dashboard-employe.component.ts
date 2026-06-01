// features/espace-employe/dashboard-employe/dashboard-employe.component.ts
import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { AuthEmployeService } from '../../../core/services/auth-employe.service';
import { Employe } from '../../../core/models/employe.model';
import { DemandeConge, Justificatif, NotificationEmploye } from '../../../core/models/employe.model';
import { EmployeService } from '../../../core/services/employe.service';

@Component({
  selector: 'app-dashboard-employe',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterOutlet],
  template: `
    <div class="employe-space">
      <!-- Sidebar -->
      <aside class="sidebar-employe">
        <div class="sidebar-header">
          <div class="logo">
            <i class="fas fa-user-circle"></i>
            <span>Espace <strong>Employé</strong></span>
          </div>
        </div>

        <div class="user-info">
          <div class="avatar">{{ initials() }}</div>
          <div class="user-details">
            <h4>{{ employe()?.prenom }} {{ employe()?.nom }}</h4>
            <p><i class="fas fa-id-card"></i> {{ employe()?.matricule }}</p>
            <p><i class="fas fa-briefcase"></i> {{ employe()?.poste || 'Employé' }}</p>
          </div>
        </div>

        <nav class="sidebar-nav">
          <a routerLink="./dashboard" routerLinkActive="active">
            <i class="fas fa-tachometer-alt"></i>
            <span>Tableau de bord</span>
          </a>
          <a routerLink="./pointages" routerLinkActive="active">
            <i class="fas fa-clock"></i>
            <span>Mes pointages</span>
          </a>
          <a routerLink="./conges" routerLinkActive="active">
            <i class="fas fa-umbrella-beach"></i>
            <span>Mes congés</span>
            @if (congesEnAttente() > 0) {
              <span class="badge">{{ congesEnAttente() }}</span>
            }
          </a>
          <a routerLink="./justificatifs" routerLinkActive="active">
            <i class="fas fa-file-medical"></i>
            <span>Justificatifs</span>
            @if (justificatifsEnAttente() > 0) {
              <span class="badge">{{ justificatifsEnAttente() }}</span>
            }
          </a>
          <a routerLink="./messagerie" routerLinkActive="active">
            <i class="fas fa-envelope"></i>
            <span>Messagerie</span>
            @if (messagesNonLus() > 0) {
              <span class="badge">{{ messagesNonLus() }}</span>
            }
          </a>
          <a routerLink="./profil" routerLinkActive="active">
            <i class="fas fa-user-edit"></i>
            <span>Mon profil</span>
          </a>
        </nav>

        <div class="sidebar-footer">
          <button (click)="logout()" class="btn-logout">
            <i class="fas fa-sign-out-alt"></i>
            Déconnexion
          </button>
        </div>
      </aside>

      <!-- Main content -->
      <main class="main-content">
        <router-outlet></router-outlet>
      </main>
    </div>
  `,
  styles: [`
    .employe-space {
      display: flex;
      min-height: 100vh;
      background: #f1f5f9;
    }
    .sidebar-employe {
      width: 280px;
      background: #1e293b;
      color: white;
      display: flex;
      flex-direction: column;
      position: fixed;
      height: 100vh;
      overflow-y: auto;
    }
    .sidebar-header {
      padding: 24px;
      border-bottom: 1px solid #334155;
    }
    .logo {
      font-size: 18px;
      font-weight: 500;
      i { color: #4f7df3; margin-right: 10px; }
      strong { color: #4f7df3; }
    }
    .user-info {
      padding: 24px;
      text-align: center;
      border-bottom: 1px solid #334155;
    }
    .avatar {
      width: 70px;
      height: 70px;
      background: linear-gradient(135deg, #4f7df3, #7c3aed);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      font-weight: 700;
      margin: 0 auto 12px;
    }
    .user-details h4 {
      margin: 0 0 8px;
      font-size: 16px;
    }
    .user-details p {
      margin: 4px 0;
      font-size: 12px;
      color: #94a3b8;
      i { width: 16px; margin-right: 6px; }
    }
    .sidebar-nav {
      flex: 1;
      padding: 16px 12px;
    }
    .sidebar-nav a {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      color: #cbd5e1;
      text-decoration: none;
      border-radius: 10px;
      margin-bottom: 4px;
      transition: all 0.2s;
      position: relative;
    }
    .sidebar-nav a:hover {
      background: #334155;
      color: white;
    }
    .sidebar-nav a.active {
      background: #4f7df3;
      color: white;
    }
    .sidebar-nav a i {
      width: 20px;
    }
    .badge {
      background: #ef4444;
      color: white;
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 20px;
      margin-left: auto;
    }
    .sidebar-footer {
      padding: 20px;
      border-top: 1px solid #334155;
    }
    .btn-logout {
      width: 100%;
      padding: 10px;
      background: rgba(239, 68, 68, 0.2);
      color: #f87171;
      border: 1px solid #ef4444;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-logout:hover {
      background: #ef4444;
      color: white;
    }
    .main-content {
      flex: 1;
      margin-left: 280px;
      padding: 24px;
    }
    @media (max-width: 768px) {
      .sidebar-employe {
        transform: translateX(-100%);
        transition: transform 0.3s;
        z-index: 1000;
      }
      .main-content {
        margin-left: 0;
      }
    }
  `]
})
export class DashboardEmployeComponent implements OnInit {
  private authEmploye = inject(AuthEmployeService);
  private router = inject(Router);
  private employeService = inject(EmployeService);

  employe = signal<Employe | null>(null);
  congesEnAttente = signal(0);
  justificatifsEnAttente = signal(0);
  messagesNonLus = signal(0);

  ngOnInit(): void {
    this.employe.set(this.authEmploye.getCurrentEmploye());
    this.loadStats();
  }

  async loadStats(): Promise<void> {
    // Implémenter le chargement des stats
  }

  initials(): string {
    const e = this.employe();
    if (!e) return '?';
    return `${e.prenom?.[0] || ''}${e.nom?.[0] || ''}`.toUpperCase();
  }

  logout(): void {
    this.authEmploye.logout();
    this.router.navigate(['/login-employe']);
  }
}
