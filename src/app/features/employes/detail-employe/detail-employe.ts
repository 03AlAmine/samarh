import {
  Component, inject, signal, OnInit,
  ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { EmployeService } from '../../../core/services/employe.service';
import { AuthService } from '../../../core/services/auth.service';
import { Employe, Service } from '../../../core/models/employe.model';
import { EmployeFormComponent } from '../employe-form/employe-form';
import { PlanningEditorComponent } from '../../shared/planning-editor/planning-editor';
import { ToastService } from '../../../core/services/toast.service';
import { Planning } from '../../../core/models/employe.model';

@Component({
  selector: 'app-detail-employe',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, EmployeFormComponent, PlanningEditorComponent],
  templateUrl: './detail-employe.html',
  styleUrls: ['./detail-employe.scss'],
})
export class DetailEmployeComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private employeService = inject(EmployeService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private cdr = inject(ChangeDetectorRef);

  loading = signal(true);
  employe = signal<Employe | null>(null);
  services = signal<Service[]>([]);

  // État du formulaire d'édition inline
  showEditForm = signal(false);
  activeTab = signal<'infos' | 'planning'>('infos');
  savingPlanning = signal(false);
  savingEdit = signal(false);
  editError = signal('');

  get isAdmin() { return this.auth.isAdmin; }
  get canEdit() { return this.auth.isAdmin || this.auth.canEditEmployes; }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.router.navigate(['/employes']); return; }
    this.load(id);
  }

  private async load(id: string): Promise<void> {
    try {
      const [employe, services] = await Promise.all([
        this.employeService.getById(id),
        this.employeService.getAllServices(),
      ]);
      this.employe.set(employe);
      this.services.set(services);
    } finally {
      this.loading.set(false);
    }
  }

  openEdit(): void {
    this.editError.set('');
    this.showEditForm.set(true);
  }

  closeEdit(): void {
    this.showEditForm.set(false);
  }

  async saveEdit(data: Partial<Employe>): Promise<void> {
    const e = this.employe();
    if (!e) return;
    this.savingEdit.set(true);
    this.editError.set('');
    try {
      await this.employeService.update(e.id, data);
      // Recharger la fiche pour refléter les changements
      const updated = await this.employeService.getById(e.id);
      this.employe.set(updated);
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
    this.savingPlanning.set(true);
    try {
      await this.employeService.update(e.id, { planning });
      this.employe.update(emp => emp ? { ...emp, planning } : emp);
      this.toast.success('Planning enregistré');
    } catch (err: any) {
      this.toast.error(err.message || 'Erreur lors de la sauvegarde.');
    } finally {
      this.savingPlanning.set(false);
    }
  }

  nomService(matricule?: string): string {
    if (!matricule) return '—';
    return this.services().find(s => s.matricule === matricule)?.nom || matricule;
  }

  initials(e: Employe): string {
    return `${(e.prenom || '?')[0]}${(e.nom || '')[0] || ''}`.toUpperCase();
  }

  get age(): number | null {
    const e = this.employe();
    if (!e?.dateNaissance) return null;
    const diff = Date.now() - new Date(e.dateNaissance).getTime();
    return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
  }
}
