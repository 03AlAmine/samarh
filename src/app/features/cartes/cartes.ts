// cartes.ts - version refactorisée avec RoleFilterService
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
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EmployeService } from '../../core/services/employe.service';
import { AuthService } from '../../core/services/auth.service';
import { RoleFilterService } from '../../core/services/role-filter.service';
import { Employe, Service } from '../../core/models/employe.model';

type Style = 'moderne' | 'minimal' | 'premium';
type Format = 'paysage' | 'portrait';

@Component({
  selector: 'app-cartes',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './cartes.html',
  styleUrls: ['./cartes.scss'],
})
export class CartesComponent implements OnInit {
  private employeService = inject(EmployeService);
  private destroyRef = inject(DestroyRef);
  private auth = inject(AuthService);
  private roleFilter = inject(RoleFilterService);

  allEmployes = signal<Employe[]>([]);
  allServices = signal<Service[]>([]);
  loading = signal(true);
  search = signal('');
  filterSvc = signal('');
  styleCarte = signal<Style>('moderne');
  format = signal<Format>('paysage');
  couleur = signal('#4f7df3');
  selected = signal<Set<string>>(new Set());
  page = signal(1);
  readonly PAGE = 12;

  readonly presetColors = [
    '#4f7df3',
    '#10b981',
    '#f59e0b',
    '#ef4444',
    '#8b5cf6',
    '#ec4899',
    '#06b6d4',
    '#1e293b',
  ];

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
   * Employés filtrés par recherche et service
   */
  filtered = computed(() => {
    const q = this.search().toLowerCase();
    const svc = this.filterSvc();
    return this.employesVisibles().filter((e) => {
      const ok =
        !q ||
        `${e.prenom} ${e.nom}`.toLowerCase().includes(q) ||
        (e.matricule || '').toLowerCase().includes(q);
      const okSvc = !svc || e.service === svc;
      return ok && okSvc;
    });
  });

  paginated = computed(() => {
    const start = (this.page() - 1) * this.PAGE;
    return this.filtered().slice(start, start + this.PAGE);
  });

  totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.PAGE)));

  ngOnInit(): void {
    this.employeService.employes$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((list) => {
      this.allEmployes.set(list);
      this.loading.set(false);
    });

    this.employeService.services$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((list) => this.allServices.set(list));
  }

  toggleSelect(id: string): void {
    // Vérifier que l'employé est visible avant de le sélectionner
    const employe = this.employesVisibles().find(e => e.id === id);
    if (!employe) return;

    this.selected.update((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  isSelected(id: string): boolean {
    return this.selected().has(id);
  }

  selectAll(): void {
    // Ne sélectionner que les employés visibles
    this.selected.update(() => new Set(this.filtered().map((e) => e.id)));
  }

  clearSelection(): void {
    this.selected.set(new Set());
  }

  getServiceNom(matricule?: string): string {
    if (!matricule) return '';
    return this.allServices().find((s) => s.matricule === matricule)?.nom || '';
  }

  avatarColor(id: string): string {
    const colors = [
      '#4f7df3',
      '#10b981',
      '#f59e0b',
      '#ef4444',
      '#8b5cf6',
      '#ec4899',
      '#06b6d4',
      '#84cc16',
    ];
    const idx = id ? id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) : 0;
    return colors[idx % colors.length];
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

  imprimerSelection(): void {
    // L'impression n'affiche que ce qui est visible à l'écran
    // Le CSS @media print gère l'affichage
    window.print();
  }

  getCouleurStyle(): string {
    return this.couleur();
  }
}
