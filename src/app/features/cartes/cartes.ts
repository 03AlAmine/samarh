// cartes.ts - version avec impression directe (sans popup)
import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  AfterViewInit,
  ChangeDetectionStrategy,
  DestroyRef,
  ElementRef,
  ViewChildren,
  QueryList,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import * as QRCode from 'qrcode';
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
export class CartesComponent implements OnInit, AfterViewInit {
  private employeService = inject(EmployeService);
  private destroyRef = inject(DestroyRef);
  private auth = inject(AuthService);
  private roleFilter = inject(RoleFilterService);

  @ViewChildren('qrCanvas') qrCanvases!: QueryList<ElementRef<HTMLCanvasElement>>;

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

  servicesVisibles = computed((): Service[] => {
    return this.roleFilter.filterServices(this.allServices());
  });

  employesVisibles = computed((): Employe[] => {
    return this.roleFilter.filterEmployes(this.allEmployes());
  });

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
      setTimeout(() => this.generateQRCodes(), 500);
    });

    this.employeService.services$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((list) => this.allServices.set(list));
  }

  ngAfterViewInit(): void {
    this.qrCanvases.changes.subscribe(() => {
      setTimeout(() => this.generateQRCodes(), 100);
    });
    setTimeout(() => this.generateQRCodes(), 100);
  }

  generateQRCodes(): void {
    const canvases = this.qrCanvases.toArray();
    for (const canvas of canvases) {
      const matricule = canvas.nativeElement.getAttribute('data-matricule');
      if (matricule && canvas.nativeElement && matricule !== '—') {
        const url = `${window.location.origin}/employes/${matricule}`;
        QRCode.toCanvas(canvas.nativeElement, url, {
          width: 46,
          margin: 0.5,
          color: {
            dark: '#000000',
            light: '#ffffff',
          },
        }).catch((err) => console.error('QR Code generation error:', err));
      }
    }
  }

  toggleSelect(id: string): void {
    const employe = this.employesVisibles().find((e) => e.id === id);
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

  /**
   * Impression directe - sans popup
   * Injecte un iframe caché qui contient les cartes à imprimer
   */
  imprimerSelection(): void {
    const cartesASelect = this.selected().size > 0
      ? this.filtered().filter(e => this.selected().has(e.id))
      : this.filtered();

    if (cartesASelect.length === 0) {
      alert('Aucune carte à imprimer');
      return;
    }

    // Créer un iframe caché
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    const html = this.generatePrintHTML(cartesASelect);
    const iframeDoc = iframe.contentWindow?.document;

    if (iframeDoc) {
      iframeDoc.open();
      iframeDoc.write(html);
      iframeDoc.close();

      // Attendre que les QR codes soient générés
      setTimeout(() => {
        iframe.contentWindow?.print();

        // Supprimer l'iframe après impression
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 100);
      }, 1000);
    }
  }

  private generatePrintHTML(employes: Employe[]): string {
    let cartesHTML = '';

    for (const e of employes) {
      const hasPhoto = e.image && e.image.trim() !== '';
      const serviceNom = this.getServiceNom(e.service);
      const avatarBg = this.avatarColor(e.id);
      const initials = this.initials(e);
      const isPortrait = this.format() === 'portrait';

      cartesHTML += `
        <div class="carte ${this.styleCarte()} ${isPortrait ? 'portrait' : ''}">
          <div class="carte-header">
            ${hasPhoto ? `
              <img class="carte-photo" src="${e.image}" alt="${e.prenom} ${e.nom}">
            ` : `
              <div class="carte-avatar" style="background:${avatarBg}">${initials}</div>
            `}
            <div class="carte-id">
              <span class="carte-nom">${this.escapeHtml(e.prenom)} ${this.escapeHtml(e.nom)}</span>
              <span class="carte-poste">${this.escapeHtml(e.poste || 'Employé')}</span>
            </div>
          </div>
          <div class="carte-body">
            ${serviceNom ? `<div class="carte-service">${this.escapeHtml(serviceNom)}</div>` : ''}
            <div class="carte-matricule">${e.matricule || '—'}</div>
            <div class="carte-qr-placeholder">
              <canvas class="qr-canvas" data-matricule="${e.matricule}" width="46" height="46"></canvas>
              <span class="qr-label">${e.matricule}</span>
            </div>
          </div>
          <div class="carte-footer">
            <span class="carte-org">SamaRH</span>
            <span class="carte-badge valid">Valide</span>
          </div>
        </div>
      `;
    }

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Cartes employés - SamaRH</title>
        <meta charset="UTF-8">
        <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.1/build/qrcode.min.js"></script>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: system-ui, -apple-system, sans-serif;
            background: white;
            padding: 20px;
          }
          @media print {
            body { padding: 0; }
            .carte { break-inside: avoid; page-break-inside: avoid; }
          }

          /* Grille des cartes */
          .cartes-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
            gap: 16px;
          }

          /* Carte de base */
          .carte {
            border-radius: 12px;
            overflow: hidden;
            border: 2px solid #e2e8f0;
            background: white;
          }

          /* Style Portrait */
          .carte.portrait .carte-header {
            flex-direction: column;
            text-align: center;
            padding: 20px 14px 12px;
          }
          .carte.portrait .carte-photo,
          .carte.portrait .carte-avatar {
            width: 58px;
            height: 58px;
          }

          /* Style Moderne */
          .carte.moderne .carte-header {
            background: ${this.couleur()};
            padding: 16px;
            display: flex;
            align-items: center;
            gap: 12px;
          }
          .carte.moderne .carte-body { padding: 12px 14px; }
          .carte.moderne .carte-footer { padding: 8px 14px; background: #f8fafc; border-top: 1px solid #e2e8f0; }

          /* Style Minimal */
          .carte.minimal .carte-header {
            background: #f8fafc;
            padding: 14px;
            border-bottom: 1px solid #e2e8f0;
            display: flex;
            align-items: center;
            gap: 10px;
          }
          .carte.minimal .carte-nom { color: #1e293b !important; }
          .carte.minimal .carte-poste { color: #64748b !important; }

          /* Style Premium */
          .carte.premium .carte-header {
            background: linear-gradient(135deg, ${this.couleur()}, #7c3aed);
            padding: 18px;
            display: flex;
            align-items: center;
            gap: 12px;
          }
          .carte.premium .carte-footer {
            padding: 10px 14px;
            background: linear-gradient(90deg, #f8fafc, white);
            border-top: 1px solid #e2e8f0;
          }

          /* Éléments communs */
          .carte-photo, .carte-avatar {
            width: 46px;
            height: 46px;
            border-radius: 50%;
            object-fit: cover;
            flex-shrink: 0;
          }
          .carte-avatar {
            color: white;
            font-size: 16px;
            font-weight: 700;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2px solid rgba(255,255,255,0.3);
          }
          .carte-id { flex: 1; min-width: 0; }
          .carte-nom {
            display: block;
            font-size: 14px;
            font-weight: 700;
            color: white;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .carte-poste {
            display: block;
            font-size: 11.5px;
            color: rgba(255,255,255,0.8);
            margin-top: 2px;
          }
          .carte-service {
            font-size: 11.5px;
            font-weight: 600;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            margin-bottom: 4px;
          }
          .carte-matricule {
            font-family: monospace;
            font-size: 13px;
            font-weight: 700;
            color: #1e293b;
          }
          .carte-qr-placeholder {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-top: 8px;
            padding: 6px 8px;
            background: #f8fafc;
            border-radius: 6px;
            border: 1px solid #e2e8f0;
          }
          .qr-canvas { width: 46px; height: 46px; border-radius: 6px; }
          .qr-label { font-family: monospace; font-size: 10px; color: #64748b; }
          .carte-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
          }
          .carte-org {
            font-size: 11px;
            font-weight: 700;
            color: #64748b;
            text-transform: uppercase;
          }
          .carte-badge {
            font-size: 10px;
            font-weight: 700;
            padding: 2px 8px;
            border-radius: 20px;
            background: #dcfce7;
            color: #166534;
          }
        </style>
      </head>
      <body>
        <div class="cartes-grid">
          ${cartesHTML}
        </div>
        <script>
          (function() {
            const canvases = document.querySelectorAll('.qr-canvas');
            canvases.forEach(function(canvas) {
              const matricule = canvas.getAttribute('data-matricule');
              if (matricule && matricule !== '—') {
                const url = window.location.origin + '/employes/' + encodeURIComponent(matricule);
                QRCode.toCanvas(canvas, url, { width: 46, height: 46, margin: 0.5 })
                  .catch(err => console.error('QR Error:', err));
              }
            });
          })();
        <\/script>
      </body>
      </html>
    `;
  }

  private escapeHtml(str: string): string {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  getCouleurStyle(): string {
    return this.couleur();
  }
}
