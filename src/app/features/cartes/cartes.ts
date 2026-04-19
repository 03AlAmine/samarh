import {
  Component, inject, signal, computed, OnInit,
  ChangeDetectionStrategy, DestroyRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EmployeService } from '../../core/services/employe.service';
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
  private destroyRef     = inject(DestroyRef);

  employes   = signal<Employe[]>([]);
  services   = signal<Service[]>([]);
  loading    = signal(true);
  search     = signal('');
  filterSvc  = signal('');
  styleCarte = signal<Style>('moderne');
  format     = signal<Format>('paysage');
  couleur    = signal('#4f7df3');
  selected   = signal<Set<string>>(new Set());
  page       = signal(1);
  readonly PAGE = 12;

  readonly presetColors = ['#4f7df3','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#1e293b'];

  filtered = computed(() => {
    const q   = this.search().toLowerCase();
    const svc = this.filterSvc();
    return this.employes().filter(e => {
      const ok = !q || `${e.prenom} ${e.nom}`.toLowerCase().includes(q) ||
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
    this.employeService.employes$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(list => { this.employes.set(list); this.loading.set(false); });

    this.employeService.services$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(list => this.services.set(list));
  }

  toggleSelect(id: string): void {
    this.selected.update(s => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  isSelected(id: string): boolean { return this.selected().has(id); }

  selectAll(): void {
    this.selected.update(() => new Set(this.filtered().map(e => e.id)));
  }

  clearSelection(): void { this.selected.set(new Set()); }

  getServiceNom(matricule?: string): string {
    if (!matricule) return '';
    return this.services().find(s => s.matricule === matricule)?.nom || '';
  }

  avatarColor(id: string): string {
    const colors = ['#4f7df3','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16'];
    const idx = id ? id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) : 0;
    return colors[idx % colors.length];
  }

  initials(e: Employe): string {
    return `${(e.prenom || '?')[0]}${(e.nom || '')[0] || ''}`.toUpperCase();
  }

  imprimerSelection(): void {
    const sel = this.selected();
    if (sel.size === 0) {
      window.print();
    } else {
      window.print();
    }
  }

  imprimerTout(): void { window.print(); }

  getCouleurStyle(): string {
    return this.couleur();
  }
}
