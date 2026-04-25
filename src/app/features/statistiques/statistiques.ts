// statistiques/statistiques.ts
import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  ChangeDetectionStrategy,
  DestroyRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { BaseChartDirective } from 'ng2-charts';
import { Chart, ChartOptions, registerables } from 'chart.js';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { combineLatest } from 'rxjs';

Chart.register(...registerables);

import { AuthService } from '../../core/services/auth.service';
import { EmployeService } from '../../core/services/employe.service';
import { RoleFilterService } from '../../core/services/role-filter.service';
import { PointageService } from '../../core/services/pointage.service';
import { FirebaseService } from '../../core/services/firebase.service';
import { Employe, Service } from '../../core/models/employe.model';
import { PresenceBrute } from '../../core/models/pointage.model';

interface EmployeStats {
  id: string;
  nom: string;
  prenom: string;
  service: string;
  poste: string;
  joursPresents: number;
  joursTotal: number;
  tauxPresence: number;
  nbRetards: number;
  assiduite: number;
}

interface ServiceStats {
  matricule: string;
  nom: string;
  effectif: number;
  tauxPresence: number;
  nbRetards: number;
  assiduite: number;
  tendance: number;
}

@Component({
  selector: 'app-statistiques',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, BaseChartDirective],
  templateUrl: './statistiques.html',
  styleUrls: ['./statistiques.scss'],
})
export class StatistiquesComponent implements OnInit {
  private auth = inject(AuthService);
  private employeService = inject(EmployeService);
  private roleFilter = inject(RoleFilterService);
  private pointageService = inject(PointageService);
  private fb = inject(FirebaseService);
  private destroyRef = inject(DestroyRef);

  loading = signal(true);

  // Filtres
  periode = signal<'semaine' | 'mois' | 'trimestre' | 'annee'>('mois');
  filtreService = signal('all');
  typeDonnees = signal<'global' | 'services' | 'employes'>('global');
  searchService = signal('');
  searchEmploye = signal('');
  triEmployes = signal<'presence' | 'retards' | 'nom'>('presence');

  // Données brutes
  allEmployes = signal<Employe[]>([]);
  allServices = signal<Service[]>([]);
  presencesParJour = signal<Map<string, PresenceBrute[]>>(new Map());

  get isAdmin() { return this.auth.isAdmin; }

  servicesAutorises = computed(() => this.roleFilter.filterServices(this.allServices()));

  employesVisibles = computed(() => this.roleFilter.filterEmployes(this.allEmployes()));

  periodeLabel = computed(() => {
    const labels = { semaine: '7 derniers jours', mois: '30 derniers jours', trimestre: '90 derniers jours', annee: '365 derniers jours' };
    return labels[this.periode()];
  });

  // Statistiques globales
  statsGlobales = computed(() => {
    const employes = this.employesVisibles().filter(e => e.statut !== 'archive');
    const jours = this.getNombreJours();
    let totalPresences = 0;
    let totalRetards = 0;
    let totalJoursPossibles = employes.length * jours;

    for (const employe of employes) {
      const presences = this.getPresencesEmploye(employe.matricule);
      totalPresences += presences.filter(p => p.arrive).length;
      totalRetards += this.getRetardsEmploye(employe.matricule);
    }

    return {
      totalEmployes: employes.length,
      tauxPresenceMoyen: totalJoursPossibles > 0 ? Math.round((totalPresences / totalJoursPossibles) * 100) : 0,
      totalRetards,
      assiduiteMoyenne: totalPresences > 0 ? Math.round((totalPresences / totalJoursPossibles) * 100) : 0,
      evolutionEmployes: 0,
      evolutionRetards: 0,
      joursPresence: `${Math.round(totalPresences / (employes.length || 1))}/${jours}`,
      topEmploye: this.getTopEmploye(),
    };
  });

  // Services stats
  servicesStats = computed((): ServiceStats[] => {
    let services = this.servicesAutorises().map(s => ({
      matricule: s.matricule,
      nom: s.nom,
      effectif: 0,
      tauxPresence: 0,
      nbRetards: 0,
      assiduite: 0,
      tendance: 0,
    }));

    for (const service of services) {
      const employes = this.employesVisibles().filter(e => e.service === service.matricule && e.statut !== 'archive');
      service.effectif = employes.length;

      let totalPresences = 0;
      let totalRetards = 0;
      const jours = this.getNombreJours();

      for (const employe of employes) {
        const presences = this.getPresencesEmploye(employe.matricule);
        totalPresences += presences.filter(p => p.arrive).length;
        totalRetards += this.getRetardsEmploye(employe.matricule);
      }

      const totalPossibles = employes.length * jours;
      service.tauxPresence = totalPossibles > 0 ? Math.round((totalPresences / totalPossibles) * 100) : 0;
      service.nbRetards = totalRetards;
      service.assiduite = service.tauxPresence;
    }

    if (this.searchService()) {
      const q = this.searchService().toLowerCase();
      services = services.filter(s => s.nom.toLowerCase().includes(q));
    }

    return services.sort((a, b) => b.tauxPresence - a.tauxPresence);
  });

  // Employés stats
  employesStats = computed((): EmployeStats[] => {
    const employes = this.employesVisibles().filter(e => e.statut !== 'archive');
    const jours = this.getNombreJours();
    const result: EmployeStats[] = [];

    for (const employe of employes) {
      const presences = this.getPresencesEmploye(employe.matricule);
      const joursPresents = presences.filter(p => p.arrive).length;
      const nbRetards = this.getRetardsEmploye(employe.matricule);

      result.push({
        id: employe.id,
        nom: employe.nom,
        prenom: employe.prenom,
        service: employe.service || '',
        poste: employe.poste || '',
        joursPresents,
        joursTotal: jours,
        tauxPresence: Math.round((joursPresents / jours) * 100),
        nbRetards,
        assiduite: Math.round((joursPresents / jours) * 100),
      });
    }

    if (this.searchEmploye()) {
      const q = this.searchEmploye().toLowerCase();
      return result.filter(e => `${e.prenom} ${e.nom}`.toLowerCase().includes(q));
    }

    switch (this.triEmployes()) {
      case 'presence': return result.sort((a, b) => b.tauxPresence - a.tauxPresence);
      case 'retards': return result.sort((a, b) => b.nbRetards - a.nbRetards);
      default: return result.sort((a, b) => a.nom.localeCompare(b.nom));
    }
  });

  // Graphique évolution
  evolutionChartData = computed(() => {
    const dates = this.getDatesPeriode();
    const employes = this.employesVisibles();

    const data = dates.map(date => {
      const presences = this.presencesParJour().get(date) || [];
      const matriculesPresents = new Set(presences.map(p => p.matricule));
      return employes.filter(e => matriculesPresents.has(e.matricule)).length;
    });

    return {
      labels: dates.map(d => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })),
      datasets: [{
        label: 'Présents',
        data,
        borderColor: '#4f7df3',
        backgroundColor: 'rgba(79, 125, 243, 0.1)',
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#4f7df3',
        pointBorderColor: 'white',
        pointRadius: 4,
        pointHoverRadius: 6,
      }]
    };
  });

  // Graphique répartition
  repartitionChartData = computed(() => {
    const services = this.servicesStats();
    return {
      labels: services.map(s => s.nom),
      datasets: [{
        label: 'Employés',
        data: services.map(s => s.effectif),
        backgroundColor: '#4f7df3',
        borderRadius: 8,
      }, {
        label: 'Taux présence (%)',
        data: services.map(s => s.tauxPresence),
        backgroundColor: '#10b981',
        borderRadius: 8,
      }]
    };
  });

  // Heatmap
  heatmapChartData = computed(() => {
    const heures = Array.from({ length: 24 }, (_, i) => `${i}h-${i+1}h`);
    const data = heures.map(() => Math.floor(Math.random() * 50) + 10);

    return {
      labels: heures,
      datasets: [{
        label: 'Nombre de pointages',
        data,
        backgroundColor: (ctx: any) => {
          const value = ctx.raw;
          if (value > 40) return '#ef4444';
          if (value > 25) return '#f59e0b';
          return '#10b981';
        },
        borderRadius: 4,
      }]
    };
  });

  lineChartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'top' } },
    scales: { y: { beginAtZero: true, grid: { color: '#e2e8f0' } } }
  };

  barChartOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'top' } },
    scales: { y: { beginAtZero: true, grid: { color: '#e2e8f0' } } }
  };

  heatmapOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'top' } },
  };

  ngOnInit(): void {
    if (!this.fb.hasClientDatabase) {
      this.loading.set(false);
      return;
    }
    this.loadData();
  }

  private async loadData(): Promise<void> {
    this.loading.set(true);

    combineLatest([this.employeService.employes$, this.employeService.services$])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(async ([employes, services]) => {
        this.allEmployes.set(employes);
        this.allServices.set(services);
        await this.loadPresences();
        this.loading.set(false);
      });
  }

// statistiques.ts - remplacer la méthode getPresencesByDate

private async loadPresences(): Promise<void> {
  const dates = this.getDatesPeriode();
  const map = new Map<string, PresenceBrute[]>();

  // ✅ Utiliser getPresencesByPeriode pour charger toute la plage en une seule requête
  const dateDebut = dates[0];
  const dateFin = dates[dates.length - 1];

  if (dateDebut && dateFin) {
    const allPresences = await this.pointageService.getPresencesByPeriode(dateDebut, dateFin);

    // Grouper par date
    for (const presence of allPresences) {
      if (!map.has(presence.date)) {
        map.set(presence.date, []);
      }
      map.get(presence.date)!.push(presence);
    }

    // S'assurer que toutes les dates ont un tableau (même vide)
    for (const date of dates) {
      if (!map.has(date)) {
        map.set(date, []);
      }
    }
  }

  this.presencesParJour.set(map);
}

  private getNombreJours(): number {
    return this.getDatesPeriode().length;
  }

  private getDatesPeriode(): string[] {
    const dates: string[] = [];
    const today = new Date();
    let startDate = new Date();

    switch (this.periode()) {
      case 'semaine': startDate.setDate(today.getDate() - 6); break;
      case 'mois': startDate.setDate(today.getDate() - 29); break;
      case 'trimestre': startDate.setDate(today.getDate() - 89); break;
      case 'annee': startDate.setDate(today.getDate() - 364); break;
    }

    for (let d = new Date(startDate); d <= today; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().split('T')[0]);
    }

    return dates;
  }

  private getPresencesEmploye(matricule: string): PresenceBrute[] {
    const result: PresenceBrute[] = [];
    for (const [_, presences] of this.presencesParJour()) {
      const p = presences.find(p => p.matricule === matricule);
      if (p) result.push(p);
    }
    return result;
  }

  private getRetardsEmploye(matricule: string): number {
    let retards = 0;
    for (const [_, presences] of this.presencesParJour()) {
      const p = presences.find(p => p.matricule === matricule);
      if (p?.arrive) {
        const heure = parseInt(p.arrive.split(':')[0]);
        if (heure > 9) retards++;
      }
    }
    return retards;
  }

  private getTopEmploye(): string {
    const stats = this.employesStats();
    if (stats.length === 0) return '—';
    const top = stats.reduce((a, b) => a.tauxPresence > b.tauxPresence ? a : b);
    return `${top.prenom} ${top.nom}`;
  }

  setPeriode(p: 'semaine' | 'mois' | 'trimestre' | 'annee'): void {
    this.periode.set(p);
    this.loadPresences();
  }

initialsFromStats(e: EmployeStats): string {
  if (e.prenom) return `${e.prenom[0]}${e.nom?.[0] || ''}`.toUpperCase();
  const parts = (e.nom || '').trim().split(/\s+/);
  return parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}`.toUpperCase() : (e.nom || '').substring(0, 2).toUpperCase();
}

avatarColorFromStats(id: string): string {
  const colors = ['#4f7df3', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
  const idx = id ? id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) : 0;
  return colors[idx % colors.length];
}


  nomService(matricule: string | undefined): string {
    if (!matricule) return '—';
    return this.allServices().find(s => s.matricule === matricule)?.nom || matricule;
  }

  avatarColor(id: string): string {
    const colors = ['#4f7df3', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
    const idx = id ? id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) : 0;
    return colors[idx % colors.length];
  }

  exportPDF(): void {
    window.print();
  }

  exportExcel(): void {
    alert('Export Excel - À implémenter');
  }
}
