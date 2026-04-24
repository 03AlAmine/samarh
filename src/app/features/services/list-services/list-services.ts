// list-services.ts - version corrigée avec gestion des responsables via Employe.services
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
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EmployeService } from '../../../core/services/employe.service';
import { ResponsableService } from '../../../core/services/responsable.service';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmDialogService } from '../../../core/services/confirm-dialog.service';
import { AuthService } from '../../../core/services/auth.service';
import { RoleFilterService } from '../../../core/services/role-filter.service';
import { PointageService } from '../../../core/services/pointage.service';
import { Service, Employe, Planning } from '../../../core/models/employe.model';
import { PlanningEditorComponent } from '../../shared/planning-editor/planning-editor';

@Component({
  selector: 'app-list-services',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, PlanningEditorComponent],
  templateUrl: './list-services.html',
  styleUrls: ['./list-services.scss'],
})
export class ListServicesComponent implements OnInit {
  private employeService = inject(EmployeService);
  private responsableService = inject(ResponsableService);
  private pointageService = inject(PointageService);
  private destroyRef = inject(DestroyRef);
  private auth = inject(AuthService);
  private roleFilter = inject(RoleFilterService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmDialogService);
  private fb = inject(FormBuilder);

  loading = signal(true);
  allServices = signal<Service[]>([]);
  allEmployes = signal<Employe[]>([]);
  searchTerm = signal('');
  filterType = signal<'all' | 'actif' | 'responsable'>('all');
  showForm = signal(false);
  editingService = signal<Service | null>(null);
  saving = signal(false);
  formError = signal('');
  responsablesSelectionnes = signal<Set<string>>(new Set());

  // Détail service
  selectedService = signal<Service | null>(null);
  detailTab = signal<'employes' | 'planning'>('employes');
  savingPlanning = signal(false);
  presencesAujourdhui = signal<string[]>([]);
  candidatsResponsables = signal<Employe[]>([]);

  get isAdmin() {
    return this.auth.isAdmin;
  }
  get canEdit() {
    return this.auth.canEditEmployes;
  }

  servicesVisibles = computed(() => this.roleFilter.filterServices(this.allServices()));

  servicesFiltres = computed(() => {
    let services = this.servicesVisibles();
    const q = this.searchTerm().toLowerCase().trim();
    if (q) {
      services = services.filter(
        (s) => s.nom?.toLowerCase().includes(q) || s.matricule?.toLowerCase().includes(q),
      );
    }

    const type = this.filterType();
    if (type === 'actif') {
      services = services.filter((s) => s.actif !== false);
    } else if (type === 'responsable') {
      // ✅ Filtrer les services qui ont au moins un responsable
      services = services.filter((s) => this.getResponsableCountForService(s) > 0);
    }

    return services;
  });

  totalEmployes = computed(() => {
    return this.employesVisibles().length;
  });

  totalResponsables = computed(() => {
    // ✅ Compter les responsables uniques sur les services filtrés
    const responsableIds = new Set<string>();
    for (const service of this.servicesFiltres()) {
      const responsables = this.getResponsablesForService(service);
      responsables.forEach((r) => responsableIds.add(r.id));
    }
    return responsableIds.size;
  });

  employesVisibles = computed(() => this.roleFilter.filterEmployes(this.allEmployes()));

  effectifMap = computed(() => {
    const map = new Map<string, number>();
    this.allEmployes().forEach((e) => {
      if (e.service) map.set(e.service, (map.get(e.service) || 0) + 1);
    });
    return map;
  });

  presenceMap = computed(() => {
    const map = new Map<string, number>();
    const presences = this.presencesAujourdhui();
    this.employesVisibles().forEach((e) => {
      const isPresent = presences.includes(e.matricule);
      if (e.service && isPresent) {
        map.set(e.service, (map.get(e.service) || 0) + 1);
      }
    });
    return map;
  });

  employesDuService = computed(() => {
    const s = this.selectedService();
    if (!s) return [];
    return this.employesVisibles().filter((e) => e.service === s.matricule);
  });

  // ✅ Responsables pour le service sélectionné
  responsablesDuService = computed(() => {
    const s = this.selectedService();
    if (!s) return [];
    return this.getResponsablesForService(s);
  });

  tauxPresenceService = computed(() => {
    const employes = this.employesDuService();
    if (!employes.length) return 0;
    const presents = employes.filter((e) =>
      this.presencesAujourdhui().includes(e.matricule),
    ).length;
    return Math.round((presents / employes.length) * 100);
  });

  form = this.fb.group({
    nom: ['', Validators.required],
    matricule: ['', Validators.required],
    type_service: ['Permanent'],
    description: [''],
    actif: [true],
  });

  ngOnInit(): void {
    this.employeService.services$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((s) => {
      this.allServices.set(s);
      this.loading.set(false);
    });

    this.employeService.employes$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((e) => {
      this.allEmployes.set(e);
      this.loadCandidatsResponsables();
    });

    const today = new Date().toISOString().split('T')[0];
    this.pointageService
      .presencesJour$(today)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((p) => this.presencesAujourdhui.set(p.map((x) => x.matricule)));
  }

  // Dans list-services.ts, ajoute cette méthode de débogage

  async loadCandidatsResponsables(): Promise<void> {
    const candidats = await this.responsableService.getCandidatsResponsables();
    this.candidatsResponsables.set(candidats);
  }

  // Ajoute aussi cette méthode pour vérifier les responsables d'un service spécifique
  getResponsablesForService(service: Service): Employe[] {
    const responsables = this.candidatsResponsables().filter(
      (c) => c.services?.includes(service.matricule) === true,
    );
    return responsables;
  }

  getResponsableCountForService(service: Service): number {
    return this.getResponsablesForService(service).length;
  }

  /**
   * Récupère un aperçu des responsables (max 3)
   */
  getResponsablesApercu(service: Service): Employe[] {
    return this.getResponsablesForService(service).slice(0, 3);
  }

  /**
   * Récupère tous les responsables d'un service (pour le détail)
   */
  getResponsablesDetails(service: Service): Employe[] {
    return this.getResponsablesForService(service);
  }

  /**
   * Vérifie si un employé est responsable d'un service
   */
  isEmployeResponsable(employeId: string, service: Service): boolean {
    const employe = this.allEmployes().find((e) => e.id === employeId);
    if (!employe) return false;
    const estCharge = employe.role === 'Chargé de compte' || employe.estChargeCompte === true;
    return estCharge && (employe.services?.includes(service.matricule) || false);
  }

  isResponsableSelected(employeId: string): boolean {
    return this.responsablesSelectionnes().has(employeId);
  }

  toggleResponsable(employeId: string): void {
    this.responsablesSelectionnes.update((set) => {
      const newSet = new Set(set);
      newSet.has(employeId) ? newSet.delete(employeId) : newSet.add(employeId);
      return newSet;
    });
  }

  getEffectif(matricule: string): number {
    return this.effectifMap().get(matricule) || 0;
  }

  getTauxPresence(matricule: string): number {
    const total = this.getEffectif(matricule);
    if (total === 0) return 0;
    const presents = this.presenceMap().get(matricule) || 0;
    return Math.round((presents / total) * 100);
  }

  getServiceEffectifRatio(matricule: string): number {
    const totalGlobal = this.employesVisibles().length;
    if (totalGlobal === 0) return 0;
    return Math.round((this.getEffectif(matricule) / totalGlobal) * 100);
  }

  openDetail(s: Service): void {
    if (!this.roleFilter.canViewService(s.matricule)) {
      this.toast.error("Vous n'avez pas accès à ce service.");
      return;
    }
    this.selectedService.set(s);
  }

  closeDetail(): void {
    this.selectedService.set(null);
  }

  openForm(service?: Service): void {
    if (!this.isAdmin) {
      this.toast.error("Vous n'avez pas les droits pour modifier les services.");
      return;
    }

    this.editingService.set(service ?? null);
    this.formError.set('');

    // ✅ Charger les responsables actuels pour ce service
    if (service) {
      const responsablesActuels = this.getResponsablesForService(service).map((r) => r.id);
      this.responsablesSelectionnes.set(new Set(responsablesActuels));
    } else {
      this.responsablesSelectionnes.set(new Set());
    }

    if (service) {
      this.form.patchValue({
        nom: service.nom,
        matricule: service.matricule,
        type_service: service.type_service || 'Permanent',
        description: service.description || '',
        actif: service.actif !== false,
      });
    } else {
      this.form.reset({ type_service: 'Permanent', actif: true });
    }
    this.showForm.set(true);
  }

  closeForm(): void {
    this.showForm.set(false);
    this.editingService.set(null);
    this.responsablesSelectionnes.set(new Set());
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (!this.isAdmin) return;

    this.saving.set(true);
    this.formError.set('');

    try {
      const data = this.form.value as Partial<Service>;
      const existing = this.editingService();

      if (existing) {
        // ✅ 1. Mettre à jour le service lui-même
        await this.employeService.updateService(existing.id, data);

        // ✅ 2. Mettre à jour les responsables : ajouter/supprimer le service des employés concernés
        const newResponsableIds = Array.from(this.responsablesSelectionnes());
        const currentResponsableIds = this.getResponsablesForService(existing).map((r) => r.id);

        // IDs à ajouter
        const toAdd = newResponsableIds.filter((id) => !currentResponsableIds.includes(id));
        // IDs à retirer
        const toRemove = currentResponsableIds.filter((id) => !newResponsableIds.includes(id));

        // Ajouter le service aux nouveaux responsables
        for (const id of toAdd) {
          const employe = this.allEmployes().find((e) => e.id === id);
          if (employe) {
            const currentServices = employe.services || [];
            if (!currentServices.includes(existing.matricule)) {
              await this.employeService.update(id, {
                services: [...currentServices, existing.matricule],
                role: 'Chargé de compte',
                estChargeCompte: true,
              });
            }
          }
        }

        // Retirer le service des anciens responsables
        for (const id of toRemove) {
          const employe = this.allEmployes().find((e) => e.id === id);
          if (employe) {
            const currentServices = employe.services || [];
            await this.employeService.update(id, {
              services: currentServices.filter((s) => s !== existing.matricule),
            });
          }
        }

        this.toast.success('Service modifié avec succès');
      } else {
        // ✅ Créer un nouveau service
        const newService = await this.employeService.createService(data as Omit<Service, 'id'>);
        this.toast.success('Service créé avec succès');
      }
      this.closeForm();
    } catch (e: any) {
      this.formError.set(e.message || 'Erreur lors de la sauvegarde.');
      this.toast.error(e.message || 'Erreur');
    } finally {
      this.saving.set(false);
    }
  }

  async deleteService(id: string, event: Event): Promise<void> {
    event.stopPropagation();

    if (!this.isAdmin) {
      this.toast.error("Vous n'avez pas les droits pour supprimer des services.");
      return;
    }

    const service = this.allServices().find((s) => s.id === id);
    if (!service) return;

    const ok = await this.confirm.ask(
      `Supprimer le service "${service.nom}" définitivement ? Les employés assignés ne seront pas supprimés.`,
      'Supprimer',
      'danger',
      'Supprimer le service',
    );

    if (!ok) return;

    try {
      // ✅ Supprimer le service des responsables qui y ont accès
      const responsables = this.getResponsablesForService(service);
      for (const resp of responsables) {
        const currentServices = resp.services || [];
        await this.employeService.update(resp.id, {
          services: currentServices.filter((s) => s !== service.matricule),
        });
      }

      await this.employeService.deleteService(id);
      this.toast.success('Service supprimé');
    } catch (e: any) {
      this.toast.error(e.message || 'Erreur lors de la suppression.');
    }
  }

  async savePlanningService(planning: Planning[]): Promise<void> {
    const s = this.selectedService();
    if (!s || !this.isAdmin) return;

    this.savingPlanning.set(true);
    try {
      await this.employeService.updateService(s.id, { planning });
      this.selectedService.update((svc) => (svc ? { ...svc, planning } : svc));
      this.allServices.update((list) => list.map((x) => (x.id === s.id ? { ...x, planning } : x)));
      this.toast.success('Planning du service enregistré');
    } catch (err: any) {
      this.toast.error(err.message || 'Erreur');
    } finally {
      this.savingPlanning.set(false);
    }
  }

  estPresent(matricule: string): boolean {
    return this.presencesAujourdhui().includes(matricule);
  }

  getServiceColor(matricule: string): string {
    const colors = ['#4f7df3', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
    const idx = matricule?.split('').reduce((a, c) => a + c.charCodeAt(0), 0) || 0;
    return colors[idx % colors.length];
  }

  getAvatarColor(id: string): string {
    const colors = ['#4f7df3', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
    const idx = id?.split('').reduce((a, c) => a + c.charCodeAt(0), 0) || 0;
    return colors[idx % colors.length];
  }

  getInitials(e: Employe): string {
    if (e.prenom) return `${e.prenom[0]}${e.nom?.[0] || ''}`.toUpperCase();
    const parts = (e.nom || '').trim().split(/\s+/);
    return parts.length >= 2
      ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
      : (e.nom || '').substring(0, 2).toUpperCase();
  }

  get f() {
    return this.form.controls;
  }
}
