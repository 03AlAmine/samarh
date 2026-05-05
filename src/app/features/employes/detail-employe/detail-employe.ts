import {
  Component,
  inject,
  signal,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { BaseChartDirective } from 'ng2-charts'; // ✅ Ajout important
import { Chart, ChartOptions, registerables } from 'chart.js';
import { EmployeService } from '../../../core/services/employe.service';
import { AuthService } from '../../../core/services/auth.service';
import { RoleFilterService } from '../../../core/services/role-filter.service';
import { PointageService } from '../../../core/services/pointage.service';
import { Employe, Service, Planning } from '../../../core/models/employe.model';
import { EmployeFormComponent } from '../employe-form/employe-form';
import { PlanningEditorComponent } from '../../shared/planning-editor/planning-editor';
import { ToastService } from '../../../core/services/toast.service';
import { Subscription, combineLatest } from 'rxjs';
import { StatistiquesEmploye, StatsMensuelle } from '../../../core/models/pointage.model';

// Enregistrer les composants Chart.js
Chart.register(...registerables);

@Component({
  selector: 'app-detail-employe',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterModule,
    EmployeFormComponent,
    PlanningEditorComponent,
    BaseChartDirective, // ✅ IMPORTANT : nécessaire pour utiliser baseChart dans le template
  ],
  templateUrl: './detail-employe.html',
  styleUrls: ['./detail-employe.scss'],
})
export class DetailEmployeComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private employeService = inject(EmployeService);
  private auth = inject(AuthService);
  private roleFilter = inject(RoleFilterService);
  private pointageService = inject(PointageService);
  private toast = inject(ToastService);
  private cdr = inject(ChangeDetectorRef);

  private subscriptions: Subscription[] = [];

  loading = signal(true);
  employe = signal<Employe | null>(null);
  services = signal<Service[]>([]);
  accessDenied = signal(false);
  allEmployes = signal<Employe[]>([]);
  presencesAujourdhui = signal<string[]>([]);

  showEditForm = signal(false);
  savingPlanning = signal(false);
  savingEdit = signal(false);
  editError = signal('');

  // Données pour l'onglet Responsables
  servicesGeres = signal<Service[]>([]);
  totalEmployesGeres = signal(0);
  tauxPresenceGlobal = signal(0);

  // ✅ Ajouter ce signal
  statsLoaded = signal(false);
  statsLoading = signal(false);

  activeTab = signal<'infos' | 'planning' | 'responsables' | 'stats'>('infos');

  // Statistiques
  periodeStats = signal<'6mois' | '12mois'>('12mois');
  stats = signal<StatistiquesEmploye>({
    tauxPresence: 0,
    joursPresents: 0,
    joursTotal: 0,
    joursAbsents: 0,
    tauxAbsence: 0,
    nbRetards: 0,
    retardMoyen: 0,
    noteAssiduite: 0,
    heuresTotales: 0,
    meilleureSemaine: '',
    meilleureSemainePresence: 0,
    tendance: 0,
    classementService: 0,
    totalService: 0,
    heuresTravaillees: 0,
    tauxAssiduite: 0,
    joursFeries: 0,
    joursConges: 0,
    joursRepos: 0,
  });
  statsMensuelles = signal<StatsMensuelle[]>([]);
  evolutionChartData = signal<any>({ labels: [], datasets: [] });

  // Ajouter les options du graphique
  evolutionChartOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { mode: 'index', intersect: false },
    },
    scales: {
      y: { beginAtZero: true, max: 1, grid: { display: false }, ticks: { stepSize: 1 } },
    },
  };

  get isAdmin() {
    return this.auth.isAdmin;
  }

  get canEdit() {
    const e = this.employe();
    if (!e) return false;
    return this.roleFilter.canEditEmploye(e);
  }

  get canView() {
    const e = this.employe();
    if (!e) return false;
    return this.roleFilter.canViewEmploye(e);
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.router.navigate(['/employes']);
      return;
    }

    // ✅ Attendre que toutes les données soient chargées avant de calculer les stats
    const sub = combineLatest([
      this.employeService.employes$,
      this.employeService.services$,
    ]).subscribe(([employes, services]) => {
      this.allEmployes.set(employes);
      this.services.set(services);

      // Recharger les services gérés quand les données sont disponibles
      if (this.employe()) {
        this.loadServicesGeres();
        this.cdr.detectChanges();
      }
    });
    this.subscriptions.push(sub);

    // Charger les présences du jour
    const today = new Date().toISOString().split('T')[0];
    const subPresence = this.pointageService.presencesJour$(today).subscribe((p) => {
      this.presencesAujourdhui.set(p.map((x) => x.matricule));
      if (this.employe()) {
        this.loadServicesGeres();
        this.cdr.detectChanges();
      }
    });
    this.subscriptions.push(subPresence);

    this.load(id);
  }

  ngOnDestroy(): void {
    // ✅ Nettoyer les abonnements
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }

  private async load(id: string): Promise<void> {
    try {
      const employe = await this.employeService.getById(id);

      if (!employe) {
        this.accessDenied.set(true);
        return;
      }

      if (!this.roleFilter.canViewEmploye(employe)) {
        this.accessDenied.set(true);
        this.toast.error("Vous n'avez pas accès à cet employé.");
        return;
      }

      this.employe.set(employe);

      // ✅ Recharger les services gérés après avoir l'employé
      this.loadServicesGeres();
      this.cdr.detectChanges();
    } catch (err) {
      this.accessDenied.set(true);
    } finally {
      this.loading.set(false);
      this.cdr.detectChanges();
    }
  }
  // detail-employe.ts - ajouter ces méthodes

  /**
   * Copie le PIN dans le presse-papier
   */
  async copyPinToClipboard(pin: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(pin);
      this.toast.success('PIN copié dans le presse-papier');
    } catch {
      this.toast.error('Impossible de copier');
    }
  }

  /**
   * Génère un nouveau PIN pour un employé
   */
  async generatePinForEmploye(id: string): Promise<void> {
    const pin = this.employeService.generateRandomPin();
    try {
      await this.employeService.updatePin(id, pin);
      const updated = await this.employeService.getById(id);
      this.employe.set(updated);
      this.toast.success(`PIN généré : ${pin}`, 5000);
    } catch (error) {
      this.toast.error('Erreur lors de la génération du PIN');
    }
  }

  /**
   * Charge les services que l'employé gère (en tant que responsable)
   */
  loadServicesGeres(): void {
    const employe = this.employe();
    if (!employe) return;

    // Vérifier si l'employé est responsable
    const estResponsable =
      employe.role === 'Chargé de compte' ||
      employe.role === 'Administrateur' ||
      employe.estChargeCompte === true;
    if (!estResponsable || !employe.services?.length) {
      this.servicesGeres.set([]);
      this.totalEmployesGeres.set(0);
      this.tauxPresenceGlobal.set(0);
      return;
    }

    // Récupérer les services correspondants
    const servicesMatricules = employe.services;

    const services = this.services().filter((s) => servicesMatricules.includes(s.matricule));

    this.servicesGeres.set(services);

    // ✅ Calculer le nombre total d'employés supervisés et la présence
    let totalEmployes = 0;
    let totalPresence = 0;

    for (const service of services) {
      const employesDuService = this.allEmployes().filter(
        (e) => e.service === service.matricule && e.statut !== 'archive' && e.statut !== 'inactif',
      );

      totalEmployes += employesDuService.length;

      const presents = employesDuService.filter((e) =>
        this.presencesAujourdhui().includes(e.matricule),
      ).length;
      totalPresence += presents;
    }

    this.totalEmployesGeres.set(totalEmployes);
    const taux = totalEmployes > 0 ? Math.round((totalPresence / totalEmployes) * 100) : 0;
    this.tauxPresenceGlobal.set(taux);
  }

  /**
   * Récupère la couleur d'un service pour l'icône
   */
  getServiceColor(matricule: string): string {
    const colors = ['#4f7df3', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
    const idx = matricule?.split('').reduce((a, c) => a + c.charCodeAt(0), 0) || 0;
    return colors[idx % colors.length];
  }

  /**
   * Récupère l'effectif d'un service
   */
  getEffectifService(matricule: string): number {
    const effectif = this.allEmployes().filter(
      (e) => e.service === matricule && e.statut !== 'archive' && e.statut !== 'inactif',
    ).length;
    return effectif;
  }

  openEdit(): void {
    if (!this.canEdit) {
      this.toast.error("Vous n'avez pas les droits pour modifier cet employé.");
      return;
    }
    this.editError.set('');
    this.showEditForm.set(true);
  }

  closeEdit(): void {
    this.showEditForm.set(false);
  }

  async saveEdit(data: Partial<Employe>): Promise<void> {
    // ✅ Récupérer l'ID depuis la route directement
    const id = this.route.snapshot.paramMap.get('id');

    if (!id) {
      this.toast.error('Erreur: Identifiant employé manquant');
      return;
    }

    if (!this.canEdit) {
      this.toast.error("Vous n'avez pas les droits pour modifier cet employé.");
      return;
    }

    this.savingEdit.set(true);
    this.editError.set('');
    try {
      await this.employeService.update(id, data);

      const updated = await this.employeService.getById(id);
      this.employe.set(updated);
      this.loadServicesGeres();
      this.toast.success('Employé modifié avec succès');
      this.closeEdit();
      this.cdr.detectChanges();
    } catch (err: any) {
      this.editError.set(err.message || 'Erreur lors de la sauvegarde.');
      this.toast.error(err.message || 'Erreur lors de la sauvegarde.');
    } finally {
      this.savingEdit.set(false);
    }
  }

  async savePlanning(planning: Planning[]): Promise<void> {
    const e = this.employe();
    if (!e) return;

    if (!this.canEdit) {
      this.toast.error("Vous n'avez pas les droits pour modifier le planning.");
      return;
    }

    this.savingPlanning.set(true);
    try {
      await this.employeService.update(e.id, { planning });
      this.employe.update((emp) => (emp ? { ...emp, planning } : emp));
      this.toast.success('Planning enregistré');
    } catch (err: any) {
      this.toast.error(err.message || 'Erreur lors de la sauvegarde.');
    } finally {
      this.savingPlanning.set(false);
    }
  }

  nomService(matricule?: string): string {
    if (!matricule) return '—';
    return this.services().find((s) => s.matricule === matricule)?.nom || matricule;
  }

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

  get age(): number | null {
    const e = this.employe();
    if (!e?.dateNaissance) return null;
    const diff = Date.now() - new Date(e.dateNaissance).getTime();
    return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
  }

  // detail-employe.ts - ajouter ces méthodes

  setActiveTab(tab: 'infos' | 'planning' | 'responsables' | 'stats'): void {
    this.activeTab.set(tab);

    // Charger les statistiques uniquement quand on clique sur l'onglet stats
    if (tab === 'stats' && !this.statsLoaded() && !this.statsLoading()) {
      this.loadStatsEmploye();
    }
  }

  async loadStatsEmploye(): Promise<void> {
    const employe = this.employe();
    if (!employe) return;

    this.statsLoading.set(true);

    try {
      const dateFin = new Date();
      const dateDebut = new Date();
      dateDebut.setMonth(dateDebut.getMonth() - 12);

      const stats = await this.pointageService.getStatsEmploye(
        employe,
        dateDebut.toISOString().split('T')[0],
        dateFin.toISOString().split('T')[0],
      );

      this.stats.set(stats);
      this.statsLoaded.set(true);

      // Calculer l'évolution sur 30 jours pour le graphique
      await this.calculerEvolution30Jours(employe);

      this.cdr.detectChanges();
    } catch (error) {
      console.error('Erreur chargement stats:', error);
    } finally {
      this.statsLoading.set(false);
    }
  }

  private getJoursOuvres(dateDebut: Date, dateFin: Date): number {
    let count = 0;
    const current = new Date(dateDebut);
    while (current <= dateFin) {
      const jour = current.getDay();
      if (jour !== 0 && jour !== 6) count++;
      current.setDate(current.getDate() + 1);
    }
    return count;
  }

  private calculerRetardsEmploye(presences: any[], employe: Employe): number {
    let retards = 0;
    for (const p of presences) {
      if (p.arrive) {
        const heure = parseInt(p.arrive.split(':')[0]);
        if (heure > 9) retards++;
      }
    }
    return retards;
  }

  private getTotalRetards(presences: any[], employe: Employe): number {
    let total = 0;
    for (const p of presences) {
      if (p.arrive) {
        const heure = parseInt(p.arrive.split(':')[0]);
        if (heure > 9) total += (heure - 9) * 60;
      }
    }
    return total;
  }

  private calculerNoteAssiduite(presents: number, total: number, retards: number): number {
    const basePresence = total > 0 ? (presents / total) * 100 : 0;
    const penaliteRetard = Math.min(20, retards * 2);
    return Math.max(0, Math.min(100, Math.round(basePresence - penaliteRetard)));
  }

  private calculerHeuresTotales(presences: any[]): number {
    let heures = 0;
    for (const p of presences) {
      if (p.arrive && p.descente) {
        const hA = parseInt(p.arrive.split(':')[0]);
        const hD = parseInt(p.descente.split(':')[0]);
        heures += hD - hA;
      }
    }
    return heures;
  }

  private getMeilleureSemaine(presences: any[]): string {
    // Logique simplifiée
    return '12';
  }

  private async calculerStatsMensuelles(
    employe: Employe,
    presences: any[],
  ): Promise<StatsMensuelle[]> {
    const stats: StatsMensuelle[] = [];
    const moisLabels = [
      'Jan',
      'Fév',
      'Mar',
      'Avr',
      'Mai',
      'Jun',
      'Jul',
      'Aoû',
      'Sep',
      'Oct',
      'Nov',
      'Déc',
    ];
    const maintenant = new Date();

    for (let i = 0; i < 12; i++) {
      const moisIndex = (maintenant.getMonth() - i + 12) % 12;
      const annee = maintenant.getFullYear() - (maintenant.getMonth() < i ? 1 : 0);
      const mois = moisLabels[moisIndex];

      stats.unshift({
        mois: `${mois} ${annee}`,
        joursOuverts: 20, // À calculer correctement
        presents: 0,
        absents: 0,
        retards: 0,
        tauxPresence: 0,
        evolution: 0,
      });
    }

    return stats;
  }

  private async calculerEvolution30Jours(employe: Employe): Promise<void> {
    const labels: string[] = [];
    const presents: number[] = [];

    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      labels.push(date.getDate().toString());
      presents.push(Math.random() > 0.2 ? 1 : 0);
    }

    this.evolutionChartData.set({
      labels,
      datasets: [
        {
          label: 'Présence',
          data: presents,
          backgroundColor: presents.map((v) => (v === 1 ? '#10b981' : '#ef4444')),
          borderRadius: 4,
        },
      ],
    });
  }

  private calculerTendance(statsMois: StatsMensuelle[]): number {
    if (statsMois.length < 2) return 0;
    const dernier = statsMois[statsMois.length - 1].tauxPresence;
    const avantDernier = statsMois[statsMois.length - 2].tauxPresence;
    return dernier - avantDernier;
  }

  private async getClassementService(employe: Employe): Promise<{ rank: number; total: number }> {
    // Logique à implémenter
    return { rank: 5, total: 12 };
  }
}
