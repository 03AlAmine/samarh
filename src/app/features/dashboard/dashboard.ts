// dashboard.ts - version refactorisée avec RoleFilterService
import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  effect,
  ChangeDetectionStrategy,
  DestroyRef,
  ViewChild,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { combineLatest, of, firstValueFrom } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { BaseChartDirective } from 'ng2-charts';
import {
  Chart,
  ChartOptions,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

Chart.register(
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler,
);

import { AuthService } from '../../core/services/auth.service';
import { EmployeService } from '../../core/services/employe.service';
import { RoleFilterService } from '../../core/services/role-filter.service';
import { FirebaseService } from '../../core/services/firebase.service';
import { PointageService } from '../../core/services/pointage.service';
import { Employe, Planning, Service } from '../../core/models/employe.model';
import { PresenceBrute } from '../../core/models/pointage.model';

interface JourSemaine {
  label: string;
  date: string;
  presents: number;
  total: number;
  pct: number;
  isToday: boolean;
  matricules: string[];
}

interface AlerteRetard {
  employe: Employe;
  heureArrivee: string;
  minutesRetard: number;
}

interface TopEmploye {
  employe: Employe;
  joursPresents: number;
  score: number;
  badge: 'or' | 'argent' | 'bronze';
}

interface ServiceStats {
  nom: string;
  matricule: string;
  total: number;
  presents: number;
  taux: number;
  pct: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, BaseChartDirective],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.scss'],
})
export class DashboardComponent implements OnInit {
  private auth = inject(AuthService);
  private destroyRef = inject(DestroyRef);
  private employeService = inject(EmployeService);
  private roleFilter = inject(RoleFilterService);
  readonly fb = inject(FirebaseService);
  private pointageService = inject(PointageService);
  private cdr = inject(ChangeDetectorRef);
  @ViewChild(BaseChartDirective) chart?: BaseChartDirective;

  // ── State brut ────────────────────────────────────────────────────────────
  loading = signal(true);
  loadingSemaine = signal(true);

  /** Tous les employés (non filtrés) depuis le service */
  private _allEmployes = signal<Employe[]>([]);
  /** Tous les services (non filtrés) depuis le service */
  private _allServices = signal<Service[]>([]);
  /** Présences du jour (toutes) */
  private _presencesToday = signal<PresenceBrute[]>([]);
  /** Données semaine brutes (toutes présences) */
  private _semaineRaw = signal<JourSemaine[]>([]);

  // ── Vue filtrée selon le rôle (utilisant RoleFilterService) ───────────────

  /**
   * Services auxquels l'utilisateur a accès.
   * Délégation totale à RoleFilterService
   */
  servicesAutorises = computed((): Service[] => {
    return this.roleFilter.filterServices(this._allServices());
  });

  /**
   * Employés visibles selon le rôle.
   * Délégation totale à RoleFilterService
   */
  employes = computed((): Employe[] => {
    return this.roleFilter.filterEmployes(this._allEmployes());
  });

  /**
   * Présences filtrées (uniquement sur les employés visibles).
   */
  presencesToday = computed((): PresenceBrute[] => {
    return this.roleFilter.filterPresences(this._presencesToday(), this._allEmployes());
  });

  /**
   * Semaine filtrée : on recalcule presents/total/pct selon le scope.
   * Utilise les employés filtrés pour le calcul.
   */
  semaine = computed((): JourSemaine[] => {
    const employesFiltres = this.employes();
    const matsFiltres = new Set(employesFiltres.map((e) => e.matricule));
    const total = employesFiltres.filter(
      (e) => e.statut !== 'archive' && e.statut !== 'inactif'
    ).length;

    return this._semaineRaw().map((j) => {
      const filteredMats = j.matricules.filter((m) => matsFiltres.has(m));
      const pct = total ? Math.round((filteredMats.length / total) * 100) : 0;
      return {
        ...j,
        presents: filteredMats.length,
        total,
        pct,
        matricules: filteredMats
      };
    });
  });

  alertesRetard = signal<AlerteRetard[]>([]);

  constructor() {
    effect(() => {
      this.semaine();
      this.chart?.update();
      this.cdr.markForCheck();
    });
  }

  // ── Chart.js ─────────────────────────────────────────────────────────────
  chartData = computed((): any => {
    const sem = this.semaine();
    const values = sem.map((j) => j.presents);
    const max = Math.max(...values, 0);
    return {
      labels: sem.map((j) => j.label),
      datasets: [
        {
          type: 'bar' as const,
          label: 'Présents',
          data: values,
          backgroundColor: sem.map((j) =>
            j.pct >= 80
              ? 'rgba(16,185,129,0.85)'
              : j.pct >= 50
                ? 'rgba(245,158,11,0.85)'
                : 'rgba(239,68,68,0.85)'
          ),
          hoverBackgroundColor: sem.map((j) =>
            j.pct >= 80 ? 'rgba(16,185,129,1)' : j.pct >= 50 ? 'rgba(245,158,11,1)' : 'rgba(239,68,68,1)'
          ),
          borderRadius: 6,
          borderSkipped: false,
          order: 2,
        },
        {
          type: 'line' as const,
          label: 'Tendance',
          data: values,
          borderColor: 'rgba(99,102,241,0.9)',
          borderWidth: 2,
          pointRadius: values.map((v) => (v === max && max > 0 ? 6 : 3)),
          pointHoverRadius: 8,
          pointBackgroundColor: values.map((v) =>
            v === max && max > 0 ? '#6366f1' : 'rgba(99,102,241,0.6)'
          ),
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          fill: false,
          tension: 0.4,
          order: 1,
        },
      ],
    };
  });

  chartOptions: ChartOptions<'bar'> & { plugins?: any } = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 700, easing: 'easeOutQuart' as const },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(15,23,42,0.92)',
        titleColor: '#f8fafc',
        bodyColor: '#cbd5e1',
        padding: 10,
        cornerRadius: 8,
        callbacks: {
          label: (ctx: any) => {
            const j = this.semaine()[ctx.dataIndex];
            return j ? ` ${ctx.parsed.y} présents (${j.pct}%)` : '';
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 12, weight: 600 as const }, color: '#64748b' },
        border: { display: false },
      },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(148,163,184,0.12)', drawTicks: false },
        ticks: { stepSize: 1, precision: 0, font: { size: 11 }, color: '#94a3b8', padding: 8 },
        border: { display: false, dash: [4, 4] },
      },
    },
  };

  // ── Stats KPI (utilise les données filtrées) ─────────────────────────────
  stats = computed(() => {
    const actifs = this.employes().filter((e) => e.statut !== 'archive' && e.statut !== 'inactif');
    const mats = this.presencesToday().map((p) => p.matricule);
    const presents = actifs.filter((e) => mats.includes(e.matricule)).length;
    const taux = actifs.length ? Math.round((presents / actifs.length) * 100) : 0;
    return {
      totalEmployes: actifs.length,
      presentsAujourdhui: presents,
      absentsAujourdhui: actifs.length - presents,
      totalServices: this.servicesAutorises().length,
      tauxPresence: taux,
    };
  });

  // ── Employé de la semaine (basé sur les employés filtrés) ────────────────
  topEmployesSemaine = computed((): TopEmploye[] => {
    const sem = this.semaine();
    const actifs = this.employes().filter((e) => e.statut !== 'archive' && e.statut !== 'inactif');
    if (!sem.length || !actifs.length) return [];

    const presencesParMat = new Map<string, number>();
    sem.forEach((j) => {
      (j.matricules || []).forEach((mat) => {
        presencesParMat.set(mat, (presencesParMat.get(mat) || 0) + 1);
      });
    });

    const joursDispos = sem.length;
    const retardsMat = new Set(this.alertesRetard().map((a) => a.employe.matricule));

    const scored = actifs
      .map((e) => {
        const jours = presencesParMat.get(e.matricule) || 0;
        const ponctualiteBonus = retardsMat.has(e.matricule) ? 0 : 10;
        const score = joursDispos > 0 ? Math.round((jours / joursDispos) * 90) + ponctualiteBonus : 0;
        return { employe: e, joursPresents: jours, score };
      })
      .filter((x) => x.joursPresents > 0)
      .sort((a, b) => b.score - a.score || b.joursPresents - a.joursPresents)
      .slice(0, 3);

    const badges: Array<'or' | 'argent' | 'bronze'> = ['or', 'argent', 'bronze'];
    return scored.map((x, i) => ({ ...x, badge: badges[i] || 'bronze' }));
  });

  employSemaine = computed((): Employe | null => {
    const top = this.topEmployesSemaine();
    return top.length > 0 ? top[0].employe : null;
  });

  employSemaineScore = computed((): number => {
    const top = this.topEmployesSemaine();
    return top.length > 0 ? top[0].joursPresents : 0;
  });

  // ── Répartition par service (basée sur les employés filtrés) ──────────────
  repartitionServices = computed((): ServiceStats[] => {
    const employes = this.employes().filter((e) => e.statut !== 'archive');
    const mats = this.presencesToday().map((p) => p.matricule);
    const map = new Map<string, { total: number; presents: number }>();

    employes.forEach((e) => {
      const key = e.service || '__none__';
      const cur = map.get(key) || { total: 0, presents: 0 };
      cur.total++;
      if (mats.includes(e.matricule)) cur.presents++;
      map.set(key, cur);
    });

    return Array.from(map.entries())
      .map(([matricule, data]) => {
        const svc = this._allServices().find((s) => s.matricule === matricule);
        const taux = data.total ? Math.round((data.presents / data.total) * 100) : 0;
        return {
          nom: svc?.nom || 'Non assigné',
          matricule,
          total: data.total,
          presents: data.presents,
          taux,
          pct: data.total ? Math.round((data.total / (employes.length || 1)) * 100) : 0,
        };
      })
      .filter((s) => s.nom !== 'Non assigné' || s.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  });

  // ── Derniers employés (basé sur les employés filtrés) ─────────────────────
  derniersEmployes = computed(() =>
    [...this.employes()]
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, 5)
  );

  tauxAssiduiteSemaine = computed((): number => {
    const sem = this.semaine();
    if (!sem.length) return 0;
    return Math.round(sem.reduce((a, j) => a + j.pct, 0) / sem.length);
  });

  // ── Getters rôle (délégation à AuthService et RoleFilterService) ──────────

  get user() {
    return this.auth.currentUser as any;
  }

  get isAdmin() {
    return this.auth.isAdmin;
  }

  /** Nom du ou des services gérés (pour affichage dans le header chargé) */
  get mesServicesNoms(): string {
    return this.roleFilter.getUserServicesNames(this._allServices());
  }

  get communauteNom() {
    return this.user?.communauteNom || this.user?.companyName || 'Mon espace';
  }

  get today() {
    return new Date().toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }

  // ── Permissions d'affichage ───────────────────────────────────────────────

  /** Afficher le bouton "Ajouter employé" */
  get canAddEmploye(): boolean {
    return this.auth.canEditEmployes;
  }

  /** Afficher la section "Employé du jour" (admin uniquement) */
  get showStarEmployee(): boolean {
    return this.isAdmin;
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  ngOnInit(): void {
    if (!this.fb.hasClientDatabase) {
      this.loading.set(false);
      return;
    }
    this.loadData();
  }

  private loadData(): void {
    this.loading.set(true);

    combineLatest([this.employeService.employes$, this.employeService.services$])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ([employes, services]) => {
          this._allEmployes.set(employes);
          this._allServices.set(services);
          this.loadPresencesToday();
          this.loadSemaine(employes);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  private loadPresencesToday(): void {
    const today = new Date().toISOString().split('T')[0];
    this.pointageService
      .presencesJour$(today)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (presences) => {
          this._presencesToday.set(presences);
          this.calculerAlertes(presences);
        },
        error: () => this._presencesToday.set([]),
      });
  }

  private calculerAlertes(presences: PresenceBrute[]): void {
    const employesVisibles = this.employes();
    const alertes: AlerteRetard[] = [];

    presences.forEach((p) => {
      const emp = employesVisibles.find((e) => e.matricule === p.matricule);
      if (!emp || !p.arrive) return;

      const jourSemaine = new Date().toLocaleDateString('fr-FR', { weekday: 'long' });
      const jourCap = jourSemaine.charAt(0).toUpperCase() + jourSemaine.slice(1);
      const planningArray: Planning[] = Array.isArray(emp.planning)
        ? emp.planning
        : Object.values(emp.planning ?? {});
      const planningJour = planningArray.find(
        (pl) => pl.jour.toLowerCase() === jourCap.toLowerCase()
      );
      if (!planningJour) return;

      const heurePrevu = planningJour.heureDebut * 60 + (planningJour.minuteDebut || 0);

      let heureArrivee: number;
      let heureArriveeStr: string;
      if (p.arrive.includes('T')) {
        const d = new Date(p.arrive);
        heureArrivee = d.getHours() * 60 + d.getMinutes();
        heureArriveeStr = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      } else {
        const [hA, mA] = p.arrive.split(':').map(Number);
        heureArrivee = hA * 60 + (mA || 0);
        heureArriveeStr = p.arrive;
      }

      const retard = heureArrivee - heurePrevu;
      if (retard >= 10) {
        alertes.push({ employe: emp, heureArrivee: heureArriveeStr, minutesRetard: retard });
      }
    });

    this.alertesRetard.set(alertes.sort((a, b) => b.minutesRetard - a.minutesRetard).slice(0, 5));
  }

  private async loadSemaine(employes: Employe[]): Promise<void> {
    this.loadingSemaine.set(true);
    // On charge toutes les présences brutes — le filtre se fait dans semaine (computed)
    const actifs = employes.filter((e) => e.statut !== 'archive' && e.statut !== 'inactif');
    const total = actifs.length;
    const today = new Date();
    const labels = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

    const promises = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (6 - i));
      const iso = d.toISOString().split('T')[0];
      return firstValueFrom(
        this.pointageService.presencesJour$(iso).pipe(catchError(() => of([])))
      ).then(
        (presences) =>
          ({
            label: labels[d.getDay()],
            date: iso,
            presents: presences.length,
            total,
            pct: total ? Math.round((presences.length / total) * 100) : 0,
            isToday: iso === today.toISOString().split('T')[0],
            matricules: presences.map((x) => x.matricule),
          }) as JourSemaine
      );
    });

    try {
      const result = await Promise.all(promises);
      this._semaineRaw.set(result);
    } catch {
      this._semaineRaw.set([]);
    } finally {
      this.loadingSemaine.set(false);
    }
  }

  // ── Helpers template ──────────────────────────────────────────────────────
  initials(e: Employe): string {
    if (e.prenom) {
      return `${e.prenom[0]}${(e.nom || '')[0] || ''}`.toUpperCase();
    }
    const parts = (e.nom || '').trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return (e.nom || '').substring(0, 2).toUpperCase();
  }

  nomService(matricule: string | undefined): string {
    if (!matricule) return '';
    return this._allServices().find((s) => s.matricule === matricule)?.nom || '';
  }

  avatarColor(id: string): string {
    const colors = ['#4f7df3', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
    const idx = id ? id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) : 0;
    return colors[idx % colors.length];
  }

  estPresentAujourdhui(matricule: string): boolean {
    return this.presencesToday().some((p) => p.matricule === matricule);
  }

  formatRetard(min: number): string {
    if (min < 60) return `${min} min`;
    return `${Math.floor(min / 60)}h${min % 60 ? (min % 60) + 'min' : ''}`;
  }
}
