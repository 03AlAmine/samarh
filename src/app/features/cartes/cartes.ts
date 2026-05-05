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
  couleur = signal('#4f7df3');
  selected = signal<Set<string>>(new Set());
  page = signal(1);

  // ── Map id → data URL PNG du QR code ─────────────────────────────────────
  // Généré une fois, jamais de canvas dans le template
  qrDataUrls = signal<Map<string, string>>(new Map());

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

  // Services visibles selon le rôle
  servicesVisibles = computed((): Service[] => {
    if (this.isAdmin) return this.allServices();
    const u = (this.auth as any)['userSubject']?.value as any;
    if (!u || !Array.isArray(u.services)) return [];
    return this.allServices().filter((s) => u.services.includes(s.matricule));
  });

  // Employés visibles selon le rôle
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

  ngOnInit(): void {
    this.employeService.employes$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((list) => {
      this.allEmployes.set(list);
      this.loading.set(false);
      this.generateQRCodes(list);
    });

    this.employeService.services$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((list) => this.allServices.set(list));
  }

  // ── Génération QR codes en data URL ──────────────────────────────────────
  // cartes.ts - modifier la méthode generateQRCodes

  private async generateQRCodes(employes: Employe[]): Promise<void> {
    const map = new Map<string, string>();

    await Promise.all(
      employes.map(async (e) => {
        if (!e.id) return;
        // ✅ Le QR code contient le MATRICULE (pas une URL)
        const content = e.matricule || e.id;
        try {
          const dataUrl = await QRCode.toDataURL(content, {
            width: 64,
            margin: 1,
            color: { dark: '#111827', light: '#ffffff' },
          });
          map.set(e.id, dataUrl);
        } catch {
          /* ignore */
        }
      }),
    );

    this.qrDataUrls.set(map);
  }

  getQR(id: string): string {
    return this.qrDataUrls().get(id) || '';
  }

  // ── Sélection ─────────────────────────────────────────────────────────────
  toggleSelect(id: string): void {
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
    this.selected.set(new Set(this.filtered().map((e) => e.id)));
  }
  clearSelection(): void {
    this.selected.set(new Set());
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
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
    if (e.prenom) return `${e.prenom[0]}${(e.nom || '')[0] || ''}`.toUpperCase();
    const parts = (e.nom || '').trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return (e.nom || '').substring(0, 2).toUpperCase();
  }

  getCouleurStyle(): string {
    return this.couleur();
  }

  // ── Impression ────────────────────────────────────────────────────────────
  imprimerSelection(): void {
    const cibles =
      this.selected().size > 0
        ? this.filtered().filter((e) => this.selected().has(e.id))
        : this.filtered();

    if (cibles.length === 0) {
      alert('Aucune carte à imprimer');
      return;
    }

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:absolute;width:0;height:0;border:none';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) return;

    doc.open();
    doc.write(this.buildPrintHTML(cibles));
    doc.close();

    // Les data URLs sont déjà dans le HTML, pas besoin d'attendre
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
