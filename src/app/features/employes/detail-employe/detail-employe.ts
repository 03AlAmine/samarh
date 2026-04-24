// detail-employe.ts - version corrigée (sans takeUntilDestroyed dans ngOnInit)
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
import { EmployeService } from '../../../core/services/employe.service';
import { AuthService } from '../../../core/services/auth.service';
import { RoleFilterService } from '../../../core/services/role-filter.service';
import { PointageService } from '../../../core/services/pointage.service';
import { Employe, Service, Planning } from '../../../core/models/employe.model';
import { EmployeFormComponent } from '../employe-form/employe-form';
import { PlanningEditorComponent } from '../../shared/planning-editor/planning-editor';
import { ToastService } from '../../../core/services/toast.service';
import { Subscription, combineLatest } from 'rxjs';

@Component({
  selector: 'app-detail-employe',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, EmployeFormComponent, PlanningEditorComponent],
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
  activeTab = signal<'infos' | 'planning' | 'responsables'>('infos');
  savingPlanning = signal(false);
  savingEdit = signal(false);
  editError = signal('');

  // Données pour l'onglet Responsables
  servicesGeres = signal<Service[]>([]);
  totalEmployesGeres = signal(0);
  tauxPresenceGlobal = signal(0);

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
      this.employeService.services$
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
      this.presencesAujourdhui.set(p.map(x => x.matricule));
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
    this.subscriptions.forEach(sub => sub.unsubscribe());
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

  /**
   * Charge les services que l'employé gère (en tant que responsable)
   */
  loadServicesGeres(): void {
    const employe = this.employe();
    if (!employe) return;


    // Vérifier si l'employé est responsable
    const estResponsable = employe.role === 'Chargé de compte' ||
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

    const services = this.services().filter(s => servicesMatricules.includes(s.matricule));

    this.servicesGeres.set(services);

    // ✅ Calculer le nombre total d'employés supervisés et la présence
    let totalEmployes = 0;
    let totalPresence = 0;

    for (const service of services) {
      const employesDuService = this.allEmployes().filter(e =>
        e.service === service.matricule && e.statut !== 'archive' && e.statut !== 'inactif'
      );

      totalEmployes += employesDuService.length;

      const presents = employesDuService.filter(e =>
        this.presencesAujourdhui().includes(e.matricule)
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
    const effectif = this.allEmployes().filter(e =>
      e.service === matricule &&
      e.statut !== 'archive' &&
      e.statut !== 'inactif'
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
    const e = this.employe();
    if (!e) return;

    if (!this.canEdit) {
      this.toast.error("Vous n'avez pas les droits pour modifier cet employé.");
      return;
    }

    this.savingEdit.set(true);
    this.editError.set('');
    try {
      await this.employeService.update(e.id, data);
      const updated = await this.employeService.getById(e.id);
      this.employe.set(updated);
      this.loadServicesGeres();
      this.toast.success('Employé modifié avec succès');
      this.closeEdit();
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
}
