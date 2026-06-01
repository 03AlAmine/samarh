// pointages.ts - version complète et corrigée
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
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { EmployeService } from '../../core/services/employe.service';
import { PointageService } from '../../core/services/pointage.service';
import { AuthService } from '../../core/services/auth.service';
import { RoleFilterService } from '../../core/services/role-filter.service';
import { Employe, Service } from '../../core/models/employe.model';
import { PresenceBrute, DetailPointageExport } from '../../core/models/pointage.model';

interface LignePointage {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  service: string;
  serviceMatricule: string;
  arrive: string;
  descente: string;
  heures: number;
  retard: number;
  statut: 'present' | 'retard' | 'absent';
}

@Component({
  selector: 'app-pointages',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './pointages.html',
  styleUrls: ['./pointages.scss'],
})
export class PointagesComponent implements OnInit {
  private employeService = inject(EmployeService);
  private destroyRef = inject(DestroyRef);
  private pointageService = inject(PointageService);
  private auth = inject(AuthService);
  private roleFilter = inject(RoleFilterService);
  private router = inject(Router);

  // Filtres
  dateSelectionnee = signal(new Date().toISOString().split('T')[0]);
  filtreService = signal('');
  filtreStatut = signal('');
  periodeRapide = signal('');

  // Données
  allEmployes = signal<Employe[]>([]);
  allServices = signal<Service[]>([]);
  presences = signal<PresenceBrute[]>([]);

  // ── Export PDF ─────────────────────────────────────────────────────────────
  periodeExport = signal<'today' | 'week' | 'month' | 'custom'>('month');
  dateExportDebut = '';
  dateExportFin = '';
  showPrintPreview = false;
  printContent = '';
  toastMessage = '';
  toastType = '';

  vue = signal<'table' | 'cards'>('table');
  currentPage = signal(1);
  PAGE_SIZE = 10;

  // Abonnement courant au stream de présences
  private presencesSub: Subscription | null = null;

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

  lignes = computed<LignePointage[]>(() => {
    const employes = this.employesVisibles().filter((e) => e.statut !== 'archive');
    const presences = this.presences();
    const services = this.allServices();

    const presenceMap = new Map<string, PresenceBrute>();
    presences.forEach((p) => presenceMap.set(p.matricule, p));

    // ✅ Générer les lignes
    const lignesBrutes = employes.map((e) => {
      const p = presenceMap.get(e.matricule);
      const svc = services.find((s) => s.matricule === e.service);
      const arrive = p?.arrive || '';
      const descente = p?.descente || '';
      const heures = this.calcHeures(arrive, descente);
      const retard = this.calcRetard(e, svc, this.dateSelectionnee(), arrive);
      const statut: 'present' | 'retard' | 'absent' = !p
        ? 'absent'
        : retard > 10
          ? 'retard'
          : 'present';
      return {
        id: e.id,
        matricule: e.matricule,
        nom: e.nom || '',
        prenom: e.prenom || '',
        service: svc?.nom || e.service || '—',
        serviceMatricule: e.service || '',
        arrive,
        descente,
        heures,
        retard,
        statut,
      };
    });

    // ✅ Trier les lignes
    return lignesBrutes.sort((a, b) => {
      // 1. D'abord par statut (présent, retard, absent)
      const order = { present: 0, retard: 1, absent: 2 };
      const statutDiff = order[a.statut] - order[b.statut];
      if (statutDiff !== 0) return statutDiff;

      // 2. Ensuite par heure d'arrivée (les plus tôt d'abord)
      if (a.arrive && b.arrive) {
        const arriveDiff = a.arrive.localeCompare(b.arrive);
        if (arriveDiff !== 0) return arriveDiff;
      } else if (a.arrive && !b.arrive) return -1;
      else if (!a.arrive && b.arrive) return 1;

      // 3. Enfin par nom alphabétique
      return a.nom.localeCompare(b.nom);
    });
  });

  lignesFiltrees = computed(() => {
    let list = this.lignes();
    const svc = this.filtreService();
    const statut = this.filtreStatut();
    if (svc) list = list.filter((l) => l.service === svc);
    if (statut) list = list.filter((l) => l.statut === statut);
    return list;
  });

  stats = computed(() => {
    const l = this.lignes();
    const presents = l.filter((x) => x.statut === 'present').length;
    const retards = l.filter((x) => x.statut === 'retard').length;
    const absents = l.filter((x) => x.statut === 'absent').length;
    const total = l.length;
    return {
      presents,
      retards,
      absents,
      total,
      taux: total ? Math.round(((presents + retards) / total) * 100) : 0,
    };
  });

  nomsServices = computed(() =>
    [
      ...new Set(
        this.lignes()
          .map((l) => l.service)
          .filter(Boolean),
      ),
    ].sort(),
  );

  ngOnInit(): void {
    this.employeService.employes$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((e) => this.allEmployes.set(e));

    this.employeService.services$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((s) => this.allServices.set(s));

    this.abonnerPresences(this.dateSelectionnee());
  }

  // Ajouter les méthodes
  setVue(type: 'table' | 'cards'): void {
    this.vue.set(type);
  }

  getAvatarColor(matricule: string): string {
    const colors = ['#4f7df3', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
    const idx = matricule ? matricule.split('').reduce((a, c) => a + c.charCodeAt(0), 0) : 0;
    return colors[idx % colors.length];
  }

  goToPage(page: number): void {
    this.currentPage.set(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  totalPages = computed(() => {
    return Math.ceil(this.lignesFiltrees().length / this.PAGE_SIZE);
  });

  lignesPaginees = computed(() => {
    const start = (this.currentPage() - 1) * this.PAGE_SIZE;
    return this.lignesFiltrees().slice(start, start + this.PAGE_SIZE);
  });

  pages = computed(() => {
    const total = this.totalPages();
    const current = this.currentPage();
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages: (number | '...')[] = [1];
    if (current > 3) pages.push('...');
    for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++)
      pages.push(i);
    if (current < total - 2) pages.push('...');
    pages.push(total);
    return pages;
  });

  fullName(l: LignePointage): string {
    return l.prenom ? `${l.prenom} ${l.nom}` : l.nom;
  }

  initiales(l: LignePointage): string {
    if (l.prenom) return `${l.prenom[0]}${l.nom[0] || ''}`.toUpperCase();
    const parts = l.nom.trim().split(/\s+/);
    return parts.length >= 2
      ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
      : l.nom.substring(0, 2).toUpperCase();
  }

  onDateChange(date: string): void {
    this.dateSelectionnee.set(date);
    this.filtreService.set('');
    this.filtreStatut.set('');
    if (!['today', 'yesterday', 'week', 'month', 'prev-month'].includes(this.periodeRapide())) {
      this.periodeRapide.set('');
    }
    this.abonnerPresences(date);
  }

  loadingPointages = signal(true);

  // Modifier la méthode abonnerPresences
  private abonnerPresences(date: string): void {
    this.loadingPointages.set(true); // ✅ Activer le loader
    this.presencesSub?.unsubscribe();
    this.presences.set([]);
    if (date) {
      this.presencesSub = this.pointageService.presencesJour$(date).subscribe({
        next: (p) => {
          this.presences.set(p);
          setTimeout(() => {
            this.loadingPointages.set(false);
          }, 100);
        },
        error: () => {
          this.loadingPointages.set(false);
        },
      });
    } else {
      this.loadingPointages.set(false);
    }
  }

  jourPrecedent(): void {
    const d = new Date(this.dateSelectionnee());
    d.setDate(d.getDate() - 1);
    this.onDateChange(d.toISOString().split('T')[0]);
  }

  jourSuivant(): void {
    const d = new Date(this.dateSelectionnee());
    d.setDate(d.getDate() + 1);
    const today = new Date().toISOString().split('T')[0];
    const next = d.toISOString().split('T')[0];
    if (next <= today) this.onDateChange(next);
  }

  get isToday(): boolean {
    return this.dateSelectionnee() === new Date().toISOString().split('T')[0];
  }

  setPeriodeRapide(p: string): void {
    const today = new Date();
    let date = today.toISOString().split('T')[0];

    if (p === 'today') {
      date = today.toISOString().split('T')[0];
    } else if (p === 'yesterday') {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      date = y.toISOString().split('T')[0];
    } else if (p === 'week') {
      const d = new Date(today);
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      date = d.toISOString().split('T')[0];
    } else if (p === 'month') {
      const d = new Date(today.getFullYear(), today.getMonth(), 1);
      date = d.toISOString().split('T')[0];
    } else if (p === 'prev-month') {
      const d = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      date = d.toISOString().split('T')[0];
    }

    this.periodeRapide.set(p);
    this.onDateChange(date);
  }

  setPeriodeExport(periode: 'today' | 'week' | 'month' | 'custom'): void {
    this.periodeExport.set(periode);
    const today = new Date();

    if (periode === 'custom') {
      const monthAgo = new Date();
      monthAgo.setMonth(today.getMonth() - 1);
      this.dateExportDebut = monthAgo.toISOString().split('T')[0];
      this.dateExportFin = today.toISOString().split('T')[0];
    }
  }

  updateExportRange(): void {
    if (this.showPrintPreview) {
      this.openPrintPreview();
    }
  }

  get labelPeriode(): string {
    const p = this.periodeRapide();
    const labels: Record<string, string> = {
      today: "Aujourd'hui",
      yesterday: 'Hier',
      week: 'Cette semaine',
      month: 'Ce mois',
      'prev-month': 'Mois précédent',
    };
    return labels[p] || '';
  }

  exportCSV(): void {
    const rows = [
      [
        'Matricule',
        'Nom',
        'Prénom',
        'Service',
        'Arrivée',
        'Départ',
        'Heures',
        'Retard (min)',
        'Statut',
      ],
      ...this.lignesFiltrees().map((l) => [
        l.matricule,
        l.nom,
        l.prenom,
        l.service,
        l.arrive,
        l.descente,
        l.heures.toString(),
        l.retard.toString(),
        l.statut,
      ]),
    ];
    const csv = rows.map((r) => r.join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), {
      href: url,
      download: `pointages_${this.dateSelectionnee()}.csv`,
    }).click();
    URL.revokeObjectURL(url);
  }

  formatHeure(iso: string): string {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return iso;
    }
  }

  private calcHeures(arrive: string, descente: string): number {
    if (!arrive || !descente) return 0;
    try {
      const diff = new Date(descente).getTime() - new Date(arrive).getTime();
      return diff > 0 ? Math.round((diff / 3600000) * 10) / 10 : 0;
    } catch {
      return 0;
    }
  }

  private calcRetard(e: Employe, svc: Service | undefined, date: string, arrive: string): number {
    if (!arrive) return 0;
    const planning = e.planning || svc?.planning || [];
    if (!planning.length) return 0;
    const jour = new Date(date).toLocaleDateString('fr-FR', { weekday: 'long' });
    const plage = planning.find((p) => p.jour?.toLowerCase() === jour.toLowerCase());
    if (!plage) return 0;
    const d = new Date(arrive);
    const arriveMin = d.getHours() * 60 + d.getMinutes();
    return Math.max(0, arriveMin - (plage.heureDebut * 60 + plage.minuteDebut));
  }

  statutClass(s: string): string {
    return s === 'present' ? 'success' : s === 'retard' ? 'warning' : 'danger';
  }

  statutLabel(s: string): string {
    return s === 'present' ? 'Présent' : s === 'retard' ? 'Retard' : 'Absent';
  }

  voirHistorique(matricule: string): void {
    const employe = this.allEmployes().find((e) => e.matricule === matricule);
    if (employe) {
      this.router.navigate(['/pointages/historique', employe.id]);
    }
  }

  // ── Export PDF Methods ─────────────────────────────────────────────────────

  private getExportDateRange(): { debut: string; fin: string } {
    const today = new Date();
    let debut = new Date();
    let fin = new Date();

    switch (this.periodeExport()) {
      case 'today':
        debut = today;
        fin = today;
        break;
      case 'week':
        const day = today.getDay();
        const diff = day === 0 ? 6 : day - 1;
        debut = new Date(today);
        debut.setDate(today.getDate() - diff);
        fin = today;
        break;
      case 'month':
        debut = new Date(today.getFullYear(), today.getMonth(), 1);
        fin = today;
        break;
      case 'custom':
        return {
          debut: this.dateExportDebut || today.toISOString().split('T')[0],
          fin: this.dateExportFin || today.toISOString().split('T')[0],
        };
      default:
        debut = new Date(today.getFullYear(), today.getMonth(), 1);
        fin = today;
    }

    return {
      debut: debut.toISOString().split('T')[0],
      fin: fin.toISOString().split('T')[0],
    };
  }

  // pointages.ts - modifier la méthode calculerStatsSurPeriode

  private calculerStatsSurPeriode(
    debut: string,
    fin: string,
  ): {
    totalEmployes: number;
    totalPresents: number;
    totalRetards: number;
    totalAbsents: number;
    tauxMoyen: number;
    details: DetailPointageExport[];
  } {
    const lignes = this.lignesFiltrees();
    const totalEmployes = lignes.length;
    const totalPresents = lignes.filter((l) => l.statut === 'present').length;
    const totalRetards = lignes.filter((l) => l.statut === 'retard').length;
    const totalAbsents = lignes.filter((l) => l.statut === 'absent').length;
    const tauxMoyen =
      totalEmployes > 0 ? Math.round(((totalPresents + totalRetards) / totalEmployes) * 100) : 0;

    return {
      totalEmployes,
      totalPresents,
      totalRetards,
      totalAbsents,
      tauxMoyen,
      details: lignes.map((l) => ({
        nom: l.nom,
        prenom: l.prenom,
        matricule: l.matricule,
        service: l.service,
        poste: '',
        arrive: l.arrive,
        depart: l.descente,
        heures: l.heures,
        retard: l.retard,
        statut: l.statut,
      })),
    };
  }

  private generatePrintHTML(debut: string, fin: string): string {
    const today = new Date();
    const dateDebut = debut || this.dateSelectionnee();
    const dateFin = fin || this.dateSelectionnee();
    const periodStats = this.calculerStatsSurPeriode(dateDebut, dateFin);

    return `<!DOCTYPE html>
<html>
<head>
  <title>Pointages - ${dateDebut} au ${dateFin}</title>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; padding: 30px; background: white; }
    .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #4f7df3; }
    .header h1 { color: #1e293b; font-size: 24px; margin-bottom: 8px; }
    .header .period { color: #64748b; font-size: 14px; margin-top: 5px; }
    .header .date { color: #94a3b8; font-size: 11px; margin-top: 8px; }
    .stats-grid { display: flex; gap: 20px; margin-bottom: 30px; flex-wrap: wrap; justify-content: center; }
    .stat-card { background: #f8fafc; border-radius: 12px; padding: 15px 25px; text-align: center; min-width: 120px; border: 1px solid #e2e8f0; }
    .stat-card .value { font-size: 28px; font-weight: 700; color: #4f7df3; }
    .stat-card .label { font-size: 12px; color: #64748b; margin-top: 5px; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { padding: 12px 12px; text-align: left; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
    th { background: #f1f5f9; font-weight: 600; color: #475569; }
    .badge-present { color: #10b981; font-weight: 600; }
    .badge-retard { color: #f59e0b; font-weight: 600; }
    .badge-absent { color: #ef4444; font-weight: 600; }
    .footer { margin-top: 30px; text-align: center; font-size: 10px; color: #94a3b8; padding-top: 20px; border-top: 1px solid #e2e8f0; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>📊 Rapport des pointages</h1>
    <div class="period">Période du ${this.formatDate(dateDebut)} au ${this.formatDate(dateFin)}</div>
    <div class="date">Généré le ${today.toLocaleString('fr-FR')}</div>
  </div>

  <div class="stats-grid">
    <div class="stat-card"><div class="value">${periodStats.totalEmployes}</div><div class="label">Employés</div></div>
    <div class="stat-card"><div class="value" style="color:#10b981">${periodStats.totalPresents}</div><div class="label">Présents</div></div>
    <div class="stat-card"><div class="value" style="color:#f59e0b">${periodStats.totalRetards}</div><div class="label">Retards</div></div>
    <div class="stat-card"><div class="value" style="color:#ef4444">${periodStats.totalAbsents}</div><div class="label">Absents</div></div>
    <div class="stat-card"><div class="value">${periodStats.tauxMoyen}%</div><div class="label">Taux présence</div></div>
  </div>

  <table>
    <thead>
      <tr><th>Employé</th><th>Service</th><th>Poste</th><th>Arrivée</th><th>Départ</th><th>Heures</th><th>Retard</th><th>Statut</th></tr>
    </thead>
    <tbody>
      ${periodStats.details
        .map(
          (d: DetailPointageExport) => `
        <tr>
          <td><strong>${d.prenom} ${d.nom}</strong><br><span style="font-size:11px;color:#94a3b8">${d.matricule}</span></td>
          <td>${d.service}</td>
          <td>${d.poste || '—'}</td>
          <td>${d.arrive || '—'}</td>
          <td>${d.depart || '—'}</td>
          <td>${d.heures > 0 ? d.heures + 'h' : '—'}</td>
          <td>${d.retard > 0 ? '+' + d.retard + ' min' : '—'}</td>
          <td class="badge-${d.statut}">${d.statut === 'present' ? '✓ Présent' : d.statut === 'retard' ? '⚠ Retard' : '✗ Absent'}</td>
        </tr>
      `,
        )
        .join('')}
    </tbody>
  </table>

  <div class="footer">SamaRH - Système de gestion des pointages</div>
</body>
</html>`;
  }

  openPrintPreview(): void {
    const { debut, fin } = this.getExportDateRange();
    const html = this.generatePrintHTML(debut, fin);
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    this.printContent = bodyMatch ? bodyMatch[1] : html;
    this.showPrintPreview = true;
  }

  openExportModal(): void {
    if (!this.dateExportDebut) {
      const today = new Date();
      const monthAgo = new Date();
      monthAgo.setMonth(today.getMonth() - 1);
      this.dateExportDebut = monthAgo.toISOString().split('T')[0];
      this.dateExportFin = today.toISOString().split('T')[0];
    }
    this.openPrintPreview();
  }

  // pointages.ts - version finale

  /**
   * Impression directe - sans popup about:blank
   */
  printDirect(): void {
    // Créer un iframe caché
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.style.top = '-9999px';
    iframe.style.left = '-9999px';
    document.body.appendChild(iframe);

    // Générer le HTML pour l'impression
    const { debut, fin } = this.getExportDateRange();
    const html = this.generatePrintHTML(debut, fin);

    // Écrire dans l'iframe
    const iframeDoc = iframe.contentWindow?.document;
    if (iframeDoc) {
      iframeDoc.open();
      iframeDoc.write(html);
      iframeDoc.close();

      // Attendre que le contenu soit chargé
      iframe.onload = () => {
        // Déclencher l'impression
        iframe.contentWindow?.print();

        // Supprimer l'iframe après l'impression (ou après un délai)
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 1000);
      };

      // Si onload ne se déclenche pas, déclencher directement
      setTimeout(() => {
        iframe.contentWindow?.print();
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 1000);
      }, 500);
    } else {
      this.showToast("Impossible de démarrer l'impression", 'error');
      document.body.removeChild(iframe);
    }
  }

  printFromPreview(): void {
    const content = this.printContent;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document
        .write(`<!DOCTYPE html><html><head><title>Pointages</title><meta charset="UTF-8"><style>
        body { font-family: system-ui, sans-serif; padding: 20px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 8px; border-bottom: 1px solid #ddd; text-align: left; }
        th { background: #f5f5f5; }
      </style></head><body>${content}</body></html>`);
      printWindow.document.close();
      printWindow.print();
      printWindow.close();
      this.showToast('Impression envoyée', 'success');
    }
  }
  statsAvecChargement = computed(() => {
    if (this.loadingPointages()) {
      return {
        presents: '--',
        retards: '--',
        absents: '--',
        total: '--',
        taux: '--',
      };
    }
    const stats = this.stats();
    return {
      presents: stats.presents,
      retards: stats.retards,
      absents: stats.absents,
      total: stats.total,
      taux: stats.taux,
    };
  });

  saveAsPDF(): void {
    this.printFromPreview();
    this.showToast('Utilisez "Enregistrer au format PDF" dans la boîte de dialogue', 'info');
  }

  private showToast(message: string, type: 'success' | 'error' | 'info'): void {
    this.toastMessage = message;
    this.toastType = type;
    setTimeout(() => {
      this.toastMessage = '';
    }, 3000);
  }

  closePrintPreview(): void {
    this.showPrintPreview = false;
    this.printContent = '';
  }

  private formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  }
}
