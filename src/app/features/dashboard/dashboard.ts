// ─── DASHBOARD ────────────────────────────────────────────────────────────────
// Dashboard adaptatif : stats RH pour les gérants communauté,
// stats SaaS (communautés, users) pour l'admin.

import { Component, inject, signal, computed, OnInit, ChangeDetectionStrategy, DestroyRef} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { combineLatest } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { EmployeService } from '../../core/services/employe.service';
import { FirebaseService } from '../../core/services/firebase.service';
import { PointageService } from '../../core/services/pointage.service';
import { Employe, Service } from '../../core/models/employe.model';

interface DashboardStats {
  totalEmployes: number;
  employesActifs: number;
  presentsAujourdhui: number;
  totalServices: number;
  tauxPresence: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.scss'],
})
export class DashboardComponent implements OnInit {
  private auth = inject(AuthService);
  private destroyRef = inject(DestroyRef);
  private employeService = inject(EmployeService);
  readonly fb = inject(FirebaseService);
  private pointageService = inject(PointageService);

  // State
  loading = signal(true);
  employes = signal<Employe[]>([]);
  services = signal<Service[]>([]);
  presencesAujourdhui = signal<string[]>([]); // matricules présents

  // Computed stats
  stats = computed(() => {
    const all = this.employes();
    const actifs = all.filter(e => e.statut !== 'archive' && e.statut !== 'inactif');
    const presences = this.presencesAujourdhui();
    const presentsCount = actifs.filter(e => presences.includes(e.matricule)).length;
    const taux = actifs.length ? Math.round((presentsCount / actifs.length) * 100) : 0;

    return {
      totalEmployes: actifs.length,
      presentsAujourdhui: presentsCount,
      absentsAujourdhui: actifs.length - presentsCount,
      totalServices: this.services().length,
      tauxPresence: taux,
    };
  });

  // Répartition par service (top 5)
  repartitionServices = computed(() => {
    const employes = this.employes().filter(e => e.statut !== 'archive');
    const services = this.services();
    const map = new Map<string, number>();

    employes.forEach(e => {
      const key = e.service || 'Non assigné';
      map.set(key, (map.get(key) || 0) + 1);
    });

    return Array.from(map.entries())
      .map(([matricule, count]) => {
        const service = services.find(s => s.matricule === matricule);
        return { nom: service?.nom || matricule, count, pct: Math.round((count / (employes.length || 1)) * 100) };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  });

  // Derniers employés ajoutés
  derniersEmployes = computed(() =>
    [...this.employes()]
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, 5)
  );

  get user() { return this.auth.currentUser as any; }
  get isAdmin() { return this.auth.isAdmin; }
  get communauteNom() { return this.user?.communauteNom || this.user?.companyName || 'Mon espace'; }
  get today() { return new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); }

  ngOnInit(): void {
    if (!this.fb.hasClientDatabase) {
      this.loading.set(false);
      return;
    }
    this.loadData();
  }


  private loadData(): void {
    this.loading.set(true);

    combineLatest([
      this.employeService.employes$,
      this.employeService.services$,
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ([employes, services]) => {
          this.employes.set(employes);
          this.services.set(services);
          this.loadPresencesAujourdhui();
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  private loadPresencesAujourdhui(): void {
    const today = new Date().toISOString().split('T')[0];
    // S'abonner uniquement aux présences d'aujourd'hui — pas toute la collection
    this.pointageService
      .presencesJour$(today)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (presences) => {
          const matricules = presences.map(p => p.matricule);
          this.presencesAujourdhui.set(matricules);
        },
        error: () => this.presencesAujourdhui.set([]),
      });
  }

  initials(e: Employe): string {
    return `${(e.prenom || '?')[0]}${(e.nom || '')[0] || ''}`.toUpperCase();
  }
}
