// cartes.ts - remplacer les méthodes de sélection

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
import * as QRCode from 'qrcode';
import { EmployeService } from '../../core/services/employe.service';
import { AuthService } from '../../core/services/auth.service';
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

  allEmployes = signal<Employe[]>([]);
  allServices = signal<Service[]>([]);
  loading = signal(true);
  search = signal('');
  filterSvc = signal('');
  styleCarte = signal<Style>('moderne');
  format = signal<Format>('paysage');
  couleur = signal('#10b981');

  selectedIds = signal<Set<string>>(new Set());
  page = signal(1);

  // ✅ Map plain (pas un signal) — on ne veut pas de re-rendu global à chaque QR généré
  // On déclenche manuellement la mise à jour via qrReady signal (compteur)
  private qrMap = new Map<string, string>();
  qrReady = signal(0); // incrément pour forcer la re-lecture du qrMap dans le template

  readonly PAGE = 12;
  readonly presetColors = [
    '#10b981',
    '#4f7df3',
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

  servicesVisibles = computed((): Service[] => {
    if (this.isAdmin) return this.allServices();
    const u = (this.auth as any)['userSubject']?.value as any;
    if (!u || !Array.isArray(u.services)) return [];
    return this.allServices().filter((s) => u.services.includes(s.matricule));
  });

  employesVisibles = computed((): Employe[] => {
    if (this.isAdmin) return this.allEmployes();
    const u = (this.auth as any)['userSubject']?.value as any;
    if (!u || !Array.isArray(u.services) || u.services.length === 0) return [];
    return this.allEmployes().filter((e) => u.services.includes(e.service));
  });

  filtered = computed(() => {
    const q = this.search().toLowerCase();
    const svc = this.filterSvc();
    return this.employesVisibles().filter((e) => {
      const okQ =
        !q ||
        `${e.prenom} ${e.nom}`.toLowerCase().includes(q) ||
        (e.matricule || '').toLowerCase().includes(q);
      const okSvc = !svc || e.service === svc;
      return okQ && okSvc;
    });
  });

  paginated = computed(() => {
    const start = (this.page() - 1) * this.PAGE;
    return this.filtered().slice(start, start + this.PAGE);
  });

  totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.PAGE)));

  /**
   * ✅ Nombre total de cartes sélectionnées (pour l'affichage)
   */
  get selectedCount(): number {
    return this.selectedIds().size;
  }

  /**
   * ✅ Liste des employés sélectionnés (ceux qui sont dans selectedIds ET existent dans allEmployes)
   */
  getSelectedEmployes(): Employe[] {
    const ids = this.selectedIds();
    return this.allEmployes().filter(e => ids.has(e.id));
  }

  ngOnInit(): void {
    this.employeService.employes$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((list) => {
      this.allEmployes.set(list);
      this.loading.set(false);
      // ✅ Ne générer les QR que pour la première page visible, pas tout d'un coup
      this.generateQRCodesForPage();
    });

    this.employeService.services$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((list) => this.allServices.set(list));
  }

  /** Génère les QR uniquement pour les employés de la page courante */
  private async generateQRCodesForPage(): Promise<void> {
    const employes = this.paginated();
    await this.ensureQRCodes(employes);
  }

  /** Génère les QR codes manquants un par un en cédant le thread entre chaque */
  private async ensureQRCodes(employes: Employe[]): Promise<void> {
    const missing = employes.filter((e) => e.id && !this.qrMap.has(e.id));
    if (missing.length === 0) return;

    for (const e of missing) {
      if (!e.id) continue;
      const content = e.matricule || e.id;
      try {
        const dataUrl = await QRCode.toDataURL(content, {
          width: 64,
          margin: 1,
          color: { dark: '#111827', light: '#ffffff' },
        });
        this.qrMap.set(e.id, dataUrl);
        // ✅ Mise à jour progressive : chaque QR apparaît dès qu'il est prêt
        this.qrReady.update(n => n + 1);
      } catch {
        /* ignore */
      }
      // ✅ Céder le thread au navigateur entre chaque QR → scroll fluide
      await new Promise<void>(r => setTimeout(r, 0));
    }
  }

  /** Appelé quand la page change — charge les QR de la nouvelle page */
  async onPageChange(p: number): Promise<void> {
    this.page.set(p);
    await this.generateQRCodesForPage();
  }

  /** Pour l'impression : générer les QR de tous les employés sélectionnés */
  private async generateQRCodes(employes: Employe[]): Promise<void> {
    await this.ensureQRCodes(employes);
  }

  getCouleurStyle(): string {
    return this.couleur();
  }

  getQR(id: string): string {
    void this.qrReady(); // dépendance réactive pour que le template se re-évalue
    return this.qrMap.get(id) || '';
  }

  // ── Sélection corrigée ─────────────────────────────────────────────────────

  /**
   * ✅ Vérifie si un employé est sélectionné
   */
  isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  /**
   * ✅ Active/Désactive la sélection d'un employé
   */
  toggleSelect(id: string): void {
    this.selectedIds.update((set) => {
      const newSet = new Set(set);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }

  /**
   * ✅ Sélectionne tous les employés VISIBLES (filtrés) sans perdre les sélections précédentes
   */
  selectAll(): void {
    const visibleIds = this.filtered().map(e => e.id);
    this.selectedIds.update((set) => {
      const newSet = new Set(set);
      visibleIds.forEach(id => newSet.add(id));
      return newSet;
    });
  }

  /**
   * ✅ Désélectionne tous les employés VISIBLES (filtrés) sans affecter les autres
   */
  clearSelection(): void {
    const visibleIds = this.filtered().map(e => e.id);
    this.selectedIds.update((set) => {
      const newSet = new Set(set);
      visibleIds.forEach(id => newSet.delete(id));
      return newSet;
    });
  }

  /**
   * ✅ Désélectionne TOUS les employés (y compris ceux hors filtre)
   */
  clearAllSelection(): void {
    this.selectedIds.set(new Set());
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  getServiceNom(matricule?: string): string {
    if (!matricule) return '';
    return this.allServices().find((s) => s.matricule === matricule)?.nom || '';
  }

  private readonly avatarColorCache = new Map<string, string>();
  private readonly AVATAR_COLORS = [
    '#4f7df3', '#10b981', '#f59e0b', '#ef4444',
    '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
  ];

  avatarColor(id: string): string {
    if (this.avatarColorCache.has(id)) return this.avatarColorCache.get(id)!;
    const idx = id ? id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) : 0;
    const color = this.AVATAR_COLORS[idx % this.AVATAR_COLORS.length];
    this.avatarColorCache.set(id, color);
    return color;
  }

  initials(e: Employe): string {
    if (e.prenom) return `${e.prenom[0]}${(e.nom || '')[0] || ''}`.toUpperCase();
    const parts = (e.nom || '').trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return (e.nom || '').substring(0, 2).toUpperCase();
  }

  // ── Impression (utilise les employés sélectionnés) ─────────────────────────

  async imprimerSelection(): Promise<void> {
    // ✅ Utiliser les employés réellement sélectionnés
    const cibles = this.getSelectedEmployes();

    // Si aucune sélection, imprimer tous les employés visibles
    const employesAImprimer = cibles.length > 0 ? cibles : this.filtered();

    if (employesAImprimer.length === 0) {
      alert('Aucune carte à imprimer');
      return;
    }

    // ✅ S'assurer que les QR sont générés pour tous les employés à imprimer
    await this.generateQRCodes(employesAImprimer);

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:absolute;width:0;height:0;border:none';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) return;

    doc.open();
    doc.write(this.buildPrintHTML(employesAImprimer));
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.print();
      setTimeout(() => document.body.removeChild(iframe), 500);
    }, 300);
  }

  private buildPrintHTML(employes: Employe[]): string {
    const couleur = this.couleur();
    const style = this.styleCarte();
    const isPort = this.format() === 'portrait';

    const cartes = employes
      .map((e) => {
        const qr = this.getQR(e.id);
        const svcNom = this.getServiceNom(e.service);
        const bg = this.avatarColor(e.id);
        const ini = this.initials(e);

        return `
        <div class="carte ${style}${isPort ? ' portrait' : ''}">
          <div class="carte-header">
            ${
              e.image
                ? `<img class="carte-photo" src="${e.image}" alt="${this.esc(e.prenom)} ${this.esc(e.nom)}">`
                : `<div class="carte-avatar" style="background:${bg}">${ini}</div>`
            }
            <div class="carte-id">
              <span class="carte-nom">${this.esc(e.prenom)} ${this.esc(e.nom)}</span>
              <span class="carte-poste">${this.esc(e.poste || 'Employé')}</span>
            </div>
          </div>
          <div class="carte-body">
            ${svcNom ? `<div class="carte-service">${this.esc(svcNom)}</div>` : ''}
            <div class="carte-matricule">${e.matricule || '—'}</div>
            ${
              style !== 'minimal' && qr
                ? `
              <div class="carte-qr">
                <img src="${qr}" width="52" height="52" alt="QR ${e.matricule}">
                <span class="qr-label">${e.matricule || ''}</span>
              </div>`
                : ''
            }
          </div>
          <div class="carte-footer">
            <span class="carte-org">SamaRH</span>
            <span class="carte-badge">Valide</span>
          </div>
        </div>`;
      })
      .join('');

    return `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Cartes employés — SamaRH</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:system-ui,sans-serif;background:#fff;padding:16px}
      @media print{body{padding:0}.no-print{display:none}}
      .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}
      .carte{border-radius:12px;overflow:hidden;border:1.5px solid #e2e8f0}
      .carte-header{display:flex;align-items:center;gap:12px;padding:14px;background:${couleur}}
      .carte.minimal .carte-header{background:#f8fafc;border-bottom:1px solid #e2e8f0}
      .carte.premium .carte-header{background:linear-gradient(135deg,${couleur},#7c3aed)}
      .carte.portrait .carte-header{flex-direction:column;text-align:center;padding:20px 14px 12px}
      .carte-photo,.carte-avatar{width:44px;height:44px;border-radius:50%;object-fit:cover;flex-shrink:0}
      .carte-avatar{color:#fff;font-size:15px;font-weight:700;display:flex;align-items:center;justify-content:center}
      .carte.minimal .carte-avatar{color:#374151}
      .carte-id{flex:1;min-width:0}
      .carte-nom{display:block;font-size:13.5px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .carte.minimal .carte-nom{color:#111827}
      .carte-poste{display:block;font-size:11px;color:rgba(255,255,255,.8);margin-top:2px}
      .carte.minimal .carte-poste{color:#6b7280}
      .carte-body{padding:10px 14px;background:#fff}
      .carte-service{font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px}
      .carte-matricule{font-family:monospace;font-size:13px;font-weight:700;color:#111827}
      .carte-qr{display:flex;align-items:center;gap:8px;margin-top:8px;padding:6px 8px;background:#f8fafc;border-radius:6px;border:1px solid #e2e8f0}
      .carte-qr img{border-radius:4px}
      .qr-label{font-family:monospace;font-size:10px;color:#6b7280}
      .carte-footer{display:flex;align-items:center;justify-content:space-between;padding:8px 14px;background:#f8fafc;border-top:1px solid #e2e8f0}
      .carte-org{font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase}
      .carte-badge{font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;background:#dcfce7;color:#166534}
    </style>
    </head><body><div class="grid">${cartes}</div></body></html>`;
  }

  private esc(s: string): string {
    return (s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
