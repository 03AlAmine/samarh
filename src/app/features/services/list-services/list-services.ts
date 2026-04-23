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
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmDialogService } from '../../../core/services/confirm-dialog.service';
import { AuthService } from '../../../core/services/auth.service';
import { PointageService } from '../../../core/services/pointage.service';
import { Service, Employe, Planning } from '../../../core/models/employe.model';
import { PlanningEditorComponent } from '../../shared/planning-editor/planning-editor';
import { PresenceBrute } from '../../../core/models/pointage.model';

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
  private pointageService = inject(PointageService);
  private destroyRef = inject(DestroyRef);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmDialogService);
  private fb = inject(FormBuilder);

  loading = signal(true);
  allServices = signal<Service[]>([]);
  allEmployes = signal<Employe[]>([]);
  searchTerm = signal('');
  showForm = signal(false);
  editingService = signal<Service | null>(null);
  saving = signal(false);
  formError = signal('');

  // ── Détail service ─────────────────────────────────────────────────────────
  selectedService = signal<Service | null>(null);
  detailTab = signal<'employes' | 'planning'>('employes');
  savingPlanning = signal(false);
  presencesAujourdhui = signal<string[]>([]); // matricules présents aujourd'hui

  get isAdmin() {
    return this.auth.isAdmin;
  }

  services = computed(() => {
    const q = this.searchTerm().toLowerCase().trim();
    return this.allServices().filter(
      (s) => !q || s.nom?.toLowerCase().includes(q) || s.matricule?.toLowerCase().includes(q),
    );
  });

  effectifMap = computed(() => {
    const map = new Map<string, number>();
    this.allEmployes().forEach((e) => {
      if (e.service) map.set(e.service, (map.get(e.service) || 0) + 1);
    });
    return map;
  });

  // Employés du service sélectionné
  employesDuService = computed(() => {
    const s = this.selectedService();
    if (!s) return [];
    return this.allEmployes().filter((e) => e.service === s.matricule);
  });

  // Taux présence du service sélectionné aujourd'hui
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

    this.employeService.employes$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((e) => this.allEmployes.set(e));

    // Présences du jour pour les stats de détail
    const today = new Date().toISOString().split('T')[0];
    this.pointageService
      .presencesJour$(today)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((p) => this.presencesAujourdhui.set(p.map((x) => x.matricule)));
  }

  // ── Détail service ─────────────────────────────────────────────────────────

  openDetail(s: Service): void {
    this.selectedService.set(s);
  }
  closeDetail(): void {
    this.selectedService.set(null);
  }

  initials(e: Employe): string {
    if (e.prenom) {
      return `${e.prenom[0]}${(e.nom || '')[0] || ''}`.toUpperCase();
    }
    // nom contient prénom + nom (ex: "Amadou Diallo") → prendre les initiales des 2 premiers mots
    const parts = (e.nom || '').trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return (e.nom || '').substring(0, 2).toUpperCase();
  }

  estPresent(matricule: string): boolean {
    return this.presencesAujourdhui().includes(matricule);
  }

  // ── CRUD ───────────────────────────────────────────────────────────────────

  openForm(service?: Service): void {
    this.editingService.set(service ?? null);
    this.formError.set('');
    if (service) {
      this.form.patchValue({
        nom: service.nom,
        matricule: service.matricule || '',
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
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.formError.set('');
    try {
      const data = this.form.value as Partial<Service>;
      const existing = this.editingService();
      if (existing) {
        await this.employeService.updateService(existing.id, data);
        this.toast.success('Service modifié avec succès');
      } else {
        await this.employeService.createService(data as Omit<Service, 'id'>);
        this.toast.success('Service créé avec succès');
      }
      this.closeForm();
    } catch (e: any) {
      this.formError.set(e.message || 'Erreur lors de la sauvegarde.');
      this.toast.error(e.message || 'Erreur lors de la sauvegarde.');
    } finally {
      this.saving.set(false);
    }
  }

  async deleteService(id: string, event: Event): Promise<void> {
    event.stopPropagation();
    const ok = await this.confirm.ask(
      'Supprimer ce service définitivement ? Les employés assignés ne seront pas supprimés.',
      'Supprimer',
      'danger',
      'Supprimer le service',
    );
    if (!ok) return;
    try {
      await this.employeService.deleteService(id);
      this.toast.success('Service supprimé');
    } catch (e: any) {
      this.toast.error(e.message || 'Erreur.');
    }
  }

  async savePlanningService(planning: Planning[]): Promise<void> {
    const s = this.selectedService();
    if (!s) return;
    this.savingPlanning.set(true);
    try {
      await this.employeService.updateService(s.id, { planning });
      // Mettre à jour le signal local
      this.selectedService.update((svc) => (svc ? { ...svc, planning } : svc));
      this.allServices.update((list) => list.map((x) => (x.id === s.id ? { ...x, planning } : x)));
      this.toast.success('Planning du service enregistré');
    } catch (err: any) {
      this.toast.error(err.message || 'Erreur lors de la sauvegarde.');
    } finally {
      this.savingPlanning.set(false);
    }
  }

  effectif(matricule?: string): number {
    if (!matricule) return 0;
    return this.effectifMap().get(matricule) || 0;
  }

  get f() {
    return this.form.controls;
  }
}
