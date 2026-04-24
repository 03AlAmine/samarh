// pointages.ts - version refactorisée avec RoleFilterService
import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  effect,
  ChangeDetectionStrategy,
  DestroyRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import { EmployeService } from '../../core/services/employe.service';
import { PointageService } from '../../core/services/pointage.service';
import { AuthService } from '../../core/services/auth.service';
import { RoleFilterService } from '../../core/services/role-filter.service';
import { Employe, Service } from '../../core/models/employe.model';
import { PresenceBrute } from '../../core/models/pointage.model';

interface LignePointage {
  matricule: string;
  nom: string;
  prenom: string;
  service: string;
  serviceMatricule: string;
  arrive: string;
  descente: string;
  heures: number;
  retard: number;
  statut: 'present' | 'retard' | 'absent';
}

@Component({
  selector: 'app-pointages',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './pointages.html',
  styleUrls: ['./pointages.scss'],
})
export class PointagesComponent implements OnInit {
  private employeService = inject(EmployeService);
  private destroyRef = inject(DestroyRef);
  private pointageService = inject(PointageService);
  private auth = inject(AuthService);
  private roleFilter = inject(RoleFilterService);

  // Filtres
  dateSelectionnee = signal(new Date().toISOString().split('T')[0]);
  filtreService = signal('');
  filtreStatut = signal('');
  periodeRapide = signal(''); // 'today' | 'week' | 'month' | 'prev-month' | ''

  // Données
  allEmployes = signal<Employe[]>([]);
  allServices = signal<Service[]>([]);
  presences = signal<PresenceBrute[]>([]);

  // Abonnement courant au stream de présences (change quand la date change)
  private presencesSub: Subscription | null = null;

  get isAdmin() {
    return this.auth.isAdmin;
  }

  get canEdit() {
    return this.auth.canEditEmployes;
  }

  /**
   * Services visibles selon le rôle
   */
  servicesVisibles = computed((): Service[] => {
    return this.roleFilter.filterServices(this.allServices());
  });

  /**
   * Employés visibles selon le rôle
   */
  employesVisibles = computed((): Employe[] => {
    return this.roleFilter.filterEmployes(this.allEmployes());
  });

  /**
   * Lignes de pointage calculées (uniquement sur les employés visibles)
   */
  lignes = computed<LignePointage[]>(() => {
    const employes = this.employesVisibles().filter((e) => e.statut !== 'archive');
    const presences = this.presences();
    const services = this.allServices();

    const presenceMap = new Map<string, PresenceBrute>();
    presences.forEach((p) => presenceMap.set(p.matricule, p));

    return employes.map((e) => {
      const p = presenceMap.get(e.matricule);
      const svc = services.find((s) => s.matricule === e.service);
      const arrive = p?.arrive || '';
      const descente = p?.descente || '';
      const heures = this.calcHeures(arrive, descente);
      const retard = this.calcRetard(e, svc, this.dateSelectionnee(), arrive);
      const statut: 'present' | 'retard' | 'absent' = !p
        ? 'absent'
        : retard > 10
          ? 'retard'
          : 'present';
      return {
        matricule: e.matricule,
        nom: e.nom || '',
        prenom: e.prenom || '',
        service: svc?.nom || e.service || '—',
        serviceMatricule: e.service || '',
        arrive,
        descente,
        heures,
        retard,
        statut,
      };
    });
  });

  /**
   * Lignes filtrées par service et statut
   */
  lignesFiltrees = computed(() => {
    let list = this.lignes();
    const svc = this.filtreService();
    const statut = this.filtreStatut();
    if (svc) list = list.filter((l) => l.service === svc);
    if (statut) list = list.filter((l) => l.statut === statut);
    return list;
  });

  /**
   * Statistiques basées sur les employés visibles
   */
  stats = computed(() => {
    const l = this.lignes();
    const presents = l.filter((x) => x.statut === 'present').length;
    const retards = l.filter((x) => x.statut === 'retard').length;
    const absents = l.filter((x) => x.statut === 'absent').length;
    const total = l.length;
    return {
      presents,
      retards,
      absents,
      total,
      taux: total ? Math.round(((presents + retards) / total) * 100) : 0,
    };
  });

  /**
   * Noms des services disponibles (uniquement ceux des employés visibles)
   */
  nomsServices = computed(() =>
    [
      ...new Set(
        this.lignes()
          .map((l) => l.service)
          .filter(Boolean),
      ),
    ].sort(),
  );

  ngOnInit(): void {
    // Employés et services (temps réel, petites collections)
    this.employeService.employes$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((e) => this.allEmployes.set(e));

    this.employeService.services$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((s) => this.allServices.set(s));

    // S'abonner aux présences de la date sélectionnée
    this.abonnerPresences(this.dateSelectionnee());
  }

  fullName(l: LignePointage): string {
    return l.prenom ? `${l.prenom} ${l.nom}` : l.nom;
  }

  initiales(l: LignePointage): string {
    if (l.prenom) return `${l.prenom[0]}${l.nom[0] || ''}`.toUpperCase();
    const parts = l.nom.trim().split(/\s+/);
    return parts.length >= 2
      ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
      : l.nom.substring(0, 2).toUpperCase();
  }

  // Appelé quand l'utilisateur change la date
  onDateChange(date: string): void {
    this.dateSelectionnee.set(date);
    this.filtreService.set('');
    this.filtreStatut.set('');
    // Reset période rapide si l'utilisateur change la date manuellement
    if (!['today', 'yesterday', 'week', 'month', 'prev-month'].includes(this.periodeRapide())) {
      this.periodeRapide.set('');
    }
    // Ré-abonner au nouveau stream filtré (le cache du service réutilise si déjà chargé)
    this.abonnerPresences(date);
  }

  private abonnerPresences(date: string): void {
    this.presencesSub?.unsubscribe();
    this.presences.set([]); // reset immédiat → pas de données de l'ancienne date
    this.presencesSub = this.pointageService
      .presencesJour$(date)
      .subscribe((p) => this.presences.set(p));
  }

  // Navigation jour précédent / suivant
  jourPrecedent(): void {
    const d = new Date(this.dateSelectionnee());
    d.setDate(d.getDate() - 1);
    this.onDateChange(d.toISOString().split('T')[0]);
  }

  jourSuivant(): void {
    const d = new Date(this.dateSelectionnee());
    d.setDate(d.getDate() + 1);
    const today = new Date().toISOString().split('T')[0];
    const next = d.toISOString().split('T')[0];
    if (next <= today) this.onDateChange(next);
  }

  get isToday(): boolean {
    return this.dateSelectionnee() === new Date().toISOString().split('T')[0];
  }

  // ── Périodes rapides ─────────────────────────────────────────────────────

  setPeriodeRapide(p: string): void {
    const today = new Date();
    let date = today.toISOString().split('T')[0];

    if (p === 'today') {
      date = today.toISOString().split('T')[0];
    } else if (p === 'yesterday') {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      date = y.toISOString().split('T')[0];
    } else if (p === 'week') {
      // Lundi de cette semaine
      const d = new Date(today);
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      date = d.toISOString().split('T')[0];
    } else if (p === 'month') {
      const d = new Date(today.getFullYear(), today.getMonth(), 1);
      date = d.toISOString().split('T')[0];
    } else if (p === 'prev-month') {
      const d = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      date = d.toISOString().split('T')[0];
    }

    this.periodeRapide.set(p);
    this.onDateChange(date);
  }

  get labelPeriode(): string {
    const p = this.periodeRapide();
    const labels: Record<string, string> = {
      today: "Aujourd'hui",
      yesterday: 'Hier',
      week: 'Cette semaine',
      month: 'Ce mois',
      'prev-month': 'Mois précédent',
    };
    return labels[p] || '';
  }

  // ── Export CSV (uniquement les données visibles) ─────────────────────────

  exportCSV(): void {
    const rows = [
      [
        'Matricule',
        'Nom',
        'Prénom',
        'Service',
        'Arrivée',
        'Départ',
        'Heures',
        'Retard (min)',
        'Statut',
      ],
      ...this.lignesFiltrees().map((l) => [
        l.matricule,
        l.nom,
        l.prenom,
        l.service,
        l.arrive,
        l.descente,
        l.heures.toString(),
        l.retard.toString(),
        l.statut,
      ]),
    ];
    const csv = rows.map((r) => r.join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), {
      href: url,
      download: `pointages_${this.dateSelectionnee()}.csv`,
    }).click();
    URL.revokeObjectURL(url);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  formatHeure(iso: string): string {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return iso;
    }
  }

  private calcHeures(arrive: string, descente: string): number {
    if (!arrive || !descente) return 0;
    try {
      const diff = new Date(descente).getTime() - new Date(arrive).getTime();
      return diff > 0 ? Math.round((diff / 3600000) * 10) / 10 : 0;
    } catch {
      return 0;
    }
  }

  private calcRetard(e: Employe, svc: Service | undefined, date: string, arrive: string): number {
    if (!arrive) return 0;
    const planning = e.planning || svc?.planning || [];
    if (!planning.length) return 0;
    const jour = new Date(date).toLocaleDateString('fr-FR', { weekday: 'long' });
    const plage = planning.find((p) => p.jour?.toLowerCase() === jour.toLowerCase());
    if (!plage) return 0;
    const d = new Date(arrive);
    const arriveMin = d.getHours() * 60 + d.getMinutes();
    return Math.max(0, arriveMin - (plage.heureDebut * 60 + plage.minuteDebut));
  }

  statutClass(s: string): string {
    return s === 'present' ? 'success' : s === 'retard' ? 'warning' : 'danger';
  }

  statutLabel(s: string): string {
    return s === 'present' ? 'Présent' : s === 'retard' ? 'Retard' : 'Absent';
  }
}
