// ─── DASHBOARD ENRICHI ────────────────────────────────────────────────────────
import {
  Component, inject, signal, computed, OnInit,
  ChangeDetectionStrategy, DestroyRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { combineLatest, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from '../../core/services/auth.service';
import { EmployeService } from '../../core/services/employe.service';
import { FirebaseService } from '../../core/services/firebase.service';
import { PointageService } from '../../core/services/pointage.service';
import { Employe, Service } from '../../core/models/employe.model';
import { PresenceBrute } from '../../core/models/pointage.model';

interface JourSemaine {
  label: string;        // 'Lun', 'Mar'…
  date: string;         // ISO
  presents: number;
  total: number;
  pct: number;
  isToday: boolean;
  matricules: string[]; // matricules présents ce jour
}

interface AlerteRetard {
  employe: Employe;
  heureArrivee: string;
  minutesRetard: number;
}

interface TopEmploye {
  employe: Employe;
  joursPresents: number;      // sur 7
  score: number;              // 0-100
  badge: 'or' | 'argent' | 'bronze';
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
  private auth           = inject(AuthService);
  private destroyRef     = inject(DestroyRef);
  private employeService = inject(EmployeService);
  readonly fb            = inject(FirebaseService);
  private pointageService = inject(PointageService);

  // ── State ─────────────────────────────────────────────────────────────────
  loading         = signal(true);
  employes        = signal<Employe[]>([]);
  services        = signal<Service[]>([]);
  presencesToday  = signal<PresenceBrute[]>([]);
  semaine         = signal<JourSemaine[]>([]);
  alertesRetard   = signal<AlerteRetard[]>([]);
  loadingSemaine  = signal(true);

  // ── Stats du jour ─────────────────────────────────────────────────────────
  stats = computed(() => {
    const actifs  = this.employes().filter(e => e.statut !== 'archive' && e.statut !== 'inactif');
    const mats    = this.presencesToday().map(p => p.matricule);
    const presents = actifs.filter(e => mats.includes(e.matricule)).length;
    const taux     = actifs.length ? Math.round((presents / actifs.length) * 100) : 0;
    return {
      totalEmployes:    actifs.length,
      presentsAujourdhui: presents,
      absentsAujourdhui:  actifs.length - presents,
      totalServices:    this.services().length,
      tauxPresence:     taux,
    };
  });

  // ── Employé de la semaine (vraie logique 7 jours) ────────────────────────
  employSemaine = computed((): Employe | null => {
    const top = this.topEmployesSemaine();
    return top.length > 0 ? top[0].employe : null;
  });

  employSemaineScore = computed((): number => {
    const top = this.topEmployesSemaine();
    return top.length > 0 ? top[0].joursPresents : 0;
  });

  // ── Top 3 employés sur 7 jours (présences + ponctualité) ─────────────────
  topEmployesSemaine = computed((): TopEmploye[] => {
    const sem    = this.semaine();
    const actifs = this.employes().filter(e => e.statut !== 'archive' && e.statut !== 'inactif');
    if (!sem.length || !actifs.length) return [];

    // Compter les présences par matricule sur les 7 jours
    const presencesParMat = new Map<string, number>();
    sem.forEach(j => {
      (j.matricules || []).forEach(mat => {
        presencesParMat.set(mat, (presencesParMat.get(mat) || 0) + 1);
      });
    });

    const joursDispos = sem.length;
    const retardsMat = new Set(this.alertesRetard().map(a => a.employe.matricule));

    const scored = actifs
      .map(e => {
        const jours = presencesParMat.get(e.matricule) || 0;
        // Score : 70% présence + 30% ponctualité (pas de retard aujourd'hui)
        const ponctualiteBonus = retardsMat.has(e.matricule) ? 0 : 10;
        const score = joursDispos > 0
          ? Math.round((jours / joursDispos) * 90) + ponctualiteBonus
          : 0;
        return { employe: e, joursPresents: jours, score };
      })
      .filter(x => x.joursPresents > 0)
      .sort((a, b) => b.score - a.score || b.joursPresents - a.joursPresents)
      .slice(0, 3);

    const badges: Array<'or' | 'argent' | 'bronze'> = ['or', 'argent', 'bronze'];
    return scored.map((x, i) => ({ ...x, badge: badges[i] || 'bronze' }));
  });

  // ── Répartition par service ───────────────────────────────────────────────
  repartitionServices = computed(() => {
    const employes = this.employes().filter(e => e.statut !== 'archive');
    const mats     = this.presencesToday().map(p => p.matricule);
    const map      = new Map<string, { total: number; presents: number }>();

    employes.forEach(e => {
      const key = e.service || '__none__';
      const cur = map.get(key) || { total: 0, presents: 0 };
      cur.total++;
      if (mats.includes(e.matricule)) cur.presents++;
      map.set(key, cur);
    });

    return Array.from(map.entries())
      .map(([matricule, data]) => {
        const svc = this.services().find(s => s.matricule === matricule);
        const taux = data.total ? Math.round((data.presents / data.total) * 100) : 0;
        return {
          nom:      svc?.nom || 'Non assigné',
          total:    data.total,
          presents: data.presents,
          taux,
          pct:      Math.round((data.total / (employes.length || 1)) * 100),
        };
      })
      .filter(s => s.nom !== 'Non assigné' || s.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  });

  // ── Derniers employés ─────────────────────────────────────────────────────
  derniersEmployes = computed(() =>
    [...this.employes()]
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, 5)
  );

  // ── Getters ───────────────────────────────────────────────────────────────
  get user()          { return this.auth.currentUser as any; }
  get isAdmin()       { return this.auth.isAdmin; }
  get communauteNom() { return this.user?.communauteNom || this.user?.companyName || 'Mon espace'; }
  get today()         {
    return new Date().toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long',
    });
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

    combineLatest([
      this.employeService.employes$,
      this.employeService.services$,
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ([employes, services]) => {
          this.employes.set(employes);
          this.services.set(services);
          this.loadPresencesToday();
          this.loadSemaine(employes);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  private loadPresencesToday(): void {
    const today = new Date().toISOString().split('T')[0];
    this.pointageService.presencesJour$(today)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (presences) => {
          this.presencesToday.set(presences);
          this.calculerAlertes(presences);
        },
        error: () => this.presencesToday.set([]),
      });
  }

  private calculerAlertes(presences: PresenceBrute[]): void {
    const employes = this.employes();
    const alertes: AlerteRetard[] = [];

    presences.forEach(p => {
      const emp = employes.find(e => e.matricule === p.matricule);
      if (!emp || !p.arrive) return;

      // Trouver le planning de l'employé pour aujourd'hui
      const jourSemaine = new Date().toLocaleDateString('fr-FR', { weekday: 'long' });
      const jourCap     = jourSemaine.charAt(0).toUpperCase() + jourSemaine.slice(1);
      const planningJour = emp.planning?.find(pl =>
        pl.jour.toLowerCase() === jourCap.toLowerCase()
      );
      if (!planningJour) return;

      const heurePrevu  = planningJour.heureDebut * 60 + (planningJour.minuteDebut || 0);
      const [hA, mA]    = p.arrive.split(':').map(Number);
      const heureArrivee = hA * 60 + (mA || 0);
      const retard       = heureArrivee - heurePrevu;

      if (retard >= 10) { // au moins 10 min de retard
        alertes.push({
          employe:      emp,
          heureArrivee: p.arrive,
          minutesRetard: retard,
        });
      }
    });

    this.alertesRetard.set(alertes.sort((a, b) => b.minutesRetard - a.minutesRetard).slice(0, 5));
  }

  private async loadSemaine(employes: Employe[]): Promise<void> {
    this.loadingSemaine.set(true);
    const actifs = employes.filter(e => e.statut !== 'archive' && e.statut !== 'inactif');
    const total  = actifs.length;
    const today  = new Date();
    const days: JourSemaine[] = [];

    // 7 derniers jours
    const labels = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

    const promises = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (6 - i));
      const iso = d.toISOString().split('T')[0];
      return this.pointageService.presencesJour$(iso)
        .pipe(takeUntilDestroyed(this.destroyRef), catchError(() => of([])))
        .toPromise()
        .then(p => {
          const presences = p || [];
          return {
            label:      labels[d.getDay()],
            date:       iso,
            presents:   presences.length,
            total,
            pct:        total ? Math.round((presences.length / total) * 100) : 0,
            isToday:    iso === today.toISOString().split('T')[0],
            matricules: presences.map(x => x.matricule), // ← stocker les matricules
          } as JourSemaine;
        });
    });

    try {
      const result = await Promise.all(promises);
      this.semaine.set(result);
    } catch {
      this.semaine.set([]);
    } finally {
      this.loadingSemaine.set(false);
    }
  }

  // ── Helpers template ──────────────────────────────────────────────────────

  // Utilisé dans le template pour reduce (pipe limitation)
  // Taux d'assiduité moyen sur 7 jours
  tauxAssiduiteSemaine = computed((): number => {
    const sem = this.semaine();
    if (!sem.length) return 0;
    return Math.round(sem.reduce((a, j) => a + j.pct, 0) / sem.length);
  });

  initials(e: Employe): string {
    return `${(e.prenom || '?')[0]}${(e.nom || '')[0] || ''}`.toUpperCase();
  }

  avatarColor(id: string): string {
    const colors = ['#4f7df3','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4'];
    const idx = id ? id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) : 0;
    return colors[idx % colors.length];
  }

  estPresentAujourdhui(matricule: string): boolean {
    return this.presencesToday().some(p => p.matricule === matricule);
  }

  formatRetard(min: number): string {
    if (min < 60) return `${min} min`;
    return `${Math.floor(min / 60)}h${min % 60 ? (min % 60) + 'min' : ''}`;
  }

  // Max bar height pour le graphe (normalisation)
  maxSemainePct(): number {
    return Math.max(...this.semaine().map(j => j.pct), 1);
  }
}
