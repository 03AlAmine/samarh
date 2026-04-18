// ─── LISTE EMPLOYÉS ───────────────────────────────────────────────────────────

import { Component, inject, signal, computed, effect, OnInit, ChangeDetectionStrategy, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { takeUntil } from 'rxjs';
import { EmployeService } from '../../../core/services/employe.service';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmDialogService } from '../../../core/services/confirm-dialog.service';
import { AuthService } from '../../../core/services/auth.service';
import { Employe, Service } from '../../../core/models/employe.model';
import { EmployeFormComponent } from "../employe-form";

@Component({
  selector: 'app-list-employes',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterModule, EmployeFormComponent],
  templateUrl: './list-employes.html',
  styleUrls: ['./list-employes.scss'],
})
export class ListEmployesComponent implements OnInit {
  private employeService = inject(EmployeService);
  private destroyRef = inject(DestroyRef);
  private auth = inject(AuthService);
  private toast   = inject(ToastService);
  private confirm = inject(ConfirmDialogService);

  // State
  loading = signal(true);
  allEmployes = signal<Employe[]>([]);
  services = signal<Service[]>([]);
  searchTerm = signal('');
  filterService = signal('');
  filterStatut = signal('');
  // Pagination
  PAGE_SIZE = 25;
  currentPage = signal(1);
  showForm = signal(false);
  editingEmploye = signal<Employe | null>(null);
  savingEmploye = signal(false);
  formError = signal('');

  get isAdmin() { return this.auth.isAdmin; }

  // Employés filtrés
  employes = computed(() => {
    let list = this.allEmployes();
    const q = this.searchTerm().toLowerCase().trim();
    const svc = this.filterService();
    const statut = this.filterStatut();

    if (q) list = this.employeService.search(list, q);
    if (svc) list = list.filter(e => e.service === svc);
    if (statut) list = list.filter(e => (e.statut || 'actif') === statut);

    return list;
  });

  // Employés de la page courante
  employesPagines = computed(() => {
    const page = this.currentPage();
    return this.employes().slice((page - 1) * this.PAGE_SIZE, page * this.PAGE_SIZE);
  });

  totalPages = computed(() => Math.ceil(this.employes().length / this.PAGE_SIZE));

  pages = computed(() => {
    const total = this.totalPages();
    const current = this.currentPage();
    if (total <= 7) return Array.from({length: total}, (_, i) => i + 1);
    // Fenêtre glissante autour de la page courante
    const pages: (number | '...')[] = [1];
    if (current > 3) pages.push('...');
    for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
    if (current < total - 2) pages.push('...');
    pages.push(total);
    return pages;
  });

  goToPage(p: number | '...'): void {
    if (p === '...') return;
    this.currentPage.set(p);
    // Scroll en haut de la liste
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  constructor() {
    // Remettre à la page 1 quand les filtres changent
    effect(() => {
      this.employes(); // track signal
      this.currentPage.set(1);
    }, { allowSignalWrites: true });
  }

  ngOnInit(): void {
    this.employeService.employes$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(e => {
      this.allEmployes.set(e);
      this.loading.set(false);
    });
    this.employeService.services$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(s => {
      this.services.set(s);
    });
  }


  // ── Actions ───────────────────────────────────────────────────────────────

  openForm(employe?: Employe): void {
    this.editingEmploye.set(employe ?? null);
    this.formError.set('');
    this.showForm.set(true);
  }

  closeForm(): void {
    this.showForm.set(false);
    this.editingEmploye.set(null);
  }

  async saveEmploye(data: Partial<Employe>): Promise<void> {
    this.savingEmploye.set(true);
    this.formError.set('');
    try {
      const existing = this.editingEmploye();
      if (existing) {
        await this.employeService.update(existing.id, data);
        this.toast.success('Employé modifié avec succès');
      } else {
        await this.employeService.create(data as Omit<Employe, 'id'>);
        this.toast.success('Employé ajouté avec succès');
      }
      this.closeForm();
    } catch (e: any) {
      this.formError.set(e.message || 'Erreur lors de la sauvegarde.');
      this.toast.error(e.message || 'Erreur lors de la sauvegarde.');
    } finally {
      this.savingEmploye.set(false);
    }
  }

  async archiver(id: string, event: Event): Promise<void> {
    event.stopPropagation();
    const ok = await this.confirm.ask('Archiver cet employé ? Il ne sera plus visible dans les listes actives.', 'Archiver', 'warning', 'Archiver l\'employé');
    if (!ok) return;
    try {
      await this.employeService.archive(id);
      this.toast.success('Employé archivé');
    } catch (e: any) {
      this.toast.error(e.message || 'Erreur lors de l\'archivage.');
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  initials(e: Employe): string {
    return `${(e.prenom || '?')[0]}${(e.nom || '')[0] || ''}`.toUpperCase();
  }

  nomService(matricule?: string): string {
    if (!matricule) return '—';
    return this.services().find(s => s.matricule === matricule)?.nom || matricule;
  }

  statutClass(statut?: string): string {
    const s = statut || 'actif';
    return s === 'actif' ? 'success' : s === 'inactif' ? 'warning' : 'neutral';
  }
}
