// historique-pointages.component.ts
import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { EmployeService } from '../../../core/services/employe.service';
import { PointageService } from '../../../core/services/pointage.service';
import { AuthService } from '../../../core/services/auth.service';
import { Employe } from '../../../core/models/employe.model';
import { PointageCalcule } from '../../../core/models/pointage.model';

interface HistoriquePointage {
  date: string;
  jourSemaine: string;
  heureArrivee: string;
  heureDepart: string;
  heuresTravaillees: number;
  retard: number;
  statut: 'present' | 'retard' | 'absent';
}

interface StatsPointage {
  tauxPresence: number;
  totalHeures: number;
  nbRetards: number;
  joursAbsents: number;
}

interface ResumeMois {
  mois: string;
  presents: number;
  absents: number;
  retards: number;
  taux: number;
}

@Component({
  selector: 'app-historique-pointages',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './historique-pointages.component.html',
  styleUrls: ['./historique-pointages.component.scss']
})
export class HistoriquePointagesComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private employeService = inject(EmployeService);
  private pointageService = inject(PointageService);
  private auth = inject(AuthService);

  employeId = '';
  employe: Employe | null = null;
  loading = signal(true);
  pointages = signal<HistoriquePointage[]>([]);

  periode = signal<'mois' | '3mois' | '6mois' | 'annee' | 'personnalise'>('mois');
  dateDebut = '';
  dateFin = '';

  ngOnInit(): void {
    this.employeId = this.route.snapshot.paramMap.get('id') || '';
    if (this.employeId) {
      this.loadEmploye();
    } else {
      this.router.navigate(['/pointages']);
    }
  }

  private async loadEmploye(): Promise<void> {
    this.employe = await this.employeService.getById(this.employeId);
    if (!this.employe) {
      this.router.navigate(['/pointages']);
      return;
    }
    await this.loadHistorique();
  }

  async loadHistorique(): Promise<void> {
    this.loading.set(true);

    const { deb, fin } = this.getDateRange();
    this.dateDebut = deb;
    this.dateFin = fin;

    try {
      const presences = await this.pointageService.getPresencesByPeriode(deb, fin);
      const joursFeries = await this.pointageService.getJoursFeries();
      const pointages = await this.calculerPointagesPourEmploye(presences, joursFeries);
      this.pointages.set(pointages);
    } catch (error) {
      console.error('Erreur chargement historique:', error);
    } finally {
      this.loading.set(false);
    }
  }

  private getDateRange(): { deb: string; fin: string } {
    const today = new Date();
    let deb = new Date();

    switch (this.periode()) {
      case 'mois':
        deb = new Date(today.getFullYear(), today.getMonth(), 1);
        break;
      case '3mois':
        deb = new Date(today.getFullYear(), today.getMonth() - 3, 1);
        break;
      case '6mois':
        deb = new Date(today.getFullYear(), today.getMonth() - 6, 1);
        break;
      case 'annee':
        deb = new Date(today.getFullYear(), 0, 1);
        break;
      case 'personnalise':
        return { deb: this.dateDebut, fin: this.dateFin };
    }

    return {
      deb: deb.toISOString().split('T')[0],
      fin: today.toISOString().split('T')[0]
    };
  }

  private async calculerPointagesPourEmploye(
    presences: any[],
    joursFeries: any[]
  ): Promise<HistoriquePointage[]> {
    if (!this.employe) return [];

    const result: HistoriquePointage[] = [];
    const feriesSet = new Set(joursFeries.map(j => j.date));
    const presencesMap = new Map(presences.map(p => [p.date, p]));

    const dateDebut = new Date(this.dateDebut);
    const dateFin = new Date(this.dateFin);
    const service = await this.employeService.getServiceById(this.employe.service || '');

    for (let d = new Date(dateDebut); d <= dateFin; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const jourSemaine = this.getJourSemaine(d);
      const presence = presencesMap.get(dateStr);

      if (feriesSet.has(dateStr)) continue;

      const estRepos = await this.estJourRepos(d);
      if (estRepos) continue;

      const heureArrivee = presence?.arrive || '';
      const heureDepart = presence?.descente || '';
      const heures = this.calcHeures(heureArrivee, heureDepart);
      const retard = this.calcRetard(heureArrivee);
      const statut = !heureArrivee ? 'absent' : retard > 10 ? 'retard' : 'present';

      result.push({
        date: dateStr,
        jourSemaine,
        heureArrivee,
        heureDepart,
        heuresTravaillees: heures,
        retard,
        statut
      });
    }

    return result;
  }

  private async estJourRepos(date: Date): Promise<boolean> {
    if (!this.employe) return false;
    const jourSemaine = this.getJourSemaine(date).toLowerCase();
    const planning = this.employe.planning || [];
    return !planning.some(p => p.jour?.toLowerCase() === jourSemaine);
  }

  private calcHeures(arrivee: string, depart: string): number {
    if (!arrivee || !depart) return 0;
    const [hA, mA] = arrivee.split(':').map(Number);
    const [hD, mD] = depart.split(':').map(Number);
    const diff = hD * 60 + mD - (hA * 60 + mA);
    return diff > 0 ? Math.round((diff / 60) * 10) / 10 : 0;
  }

  private calcRetard(heureArrivee: string): number {
    if (!heureArrivee) return 0;
    const [h, m] = heureArrivee.split(':').map(Number);
    const arriveeMin = h * 60 + m;
    const limiteMin = 8 * 60 + 30;
    return Math.max(0, arriveeMin - limiteMin);
  }

  private getJourSemaine(date: Date): string {
    return ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'][date.getDay()];
  }

  stats = computed((): StatsPointage => {
    const list = this.pointages();
    const total = list.length;
    const presents = list.filter(p => p.statut === 'present').length;
    const retards = list.filter(p => p.statut === 'retard').length;
    const absents = list.filter(p => p.statut === 'absent').length;
    const totalHeures = list.reduce((sum, p) => sum + p.heuresTravaillees, 0);

    return {
      tauxPresence: total > 0 ? Math.round(((presents + retards) / total) * 100) : 0,
      totalHeures: Math.round(totalHeures),
      nbRetards: retards,
      joursAbsents: absents
    };
  });

  resumeMensuel = computed((): ResumeMois[] => {
    const map = new Map<string, { presents: number; absents: number; retards: number }>();

    for (const p of this.pointages()) {
      const date = new Date(p.date);
      const moisKey = `${date.getMonth() + 1}/${date.getFullYear()}`;
      const current = map.get(moisKey) || { presents: 0, absents: 0, retards: 0 };

      if (p.statut === 'present') current.presents++;
      else if (p.statut === 'retard') current.retards++;
      else current.absents++;

      map.set(moisKey, current);
    }

    return Array.from(map.entries()).map(([mois, data]) => {
      const total = data.presents + data.absents + data.retards;
      return {
        mois,
        presents: data.presents,
        absents: data.absents,
        retards: data.retards,
        taux: total > 0 ? Math.round(((data.presents + data.retards) / total) * 100) : 0
      };
    });
  });

  setPeriode(p: 'mois' | '3mois' | '6mois' | 'annee' | 'personnalise'): void {
    this.periode.set(p);
    this.loadHistorique();
  }

  openDatePicker(): void {
    // Déjà géré par le changement de période
  }

  async exportPDF(): Promise<void> {
    const printContent = document.querySelector('.historique-container')?.cloneNode(true) as HTMLElement;
    if (!printContent) return;

    // Supprimer les éléments non imprimables
    printContent.querySelectorAll('.header-actions, .filters-card').forEach(el => el.remove());

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Veuillez autoriser les popups pour l\'export');
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Historique pointages - ${this.employe?.prenom} ${this.employe?.nom}</title>
        <meta charset="UTF-8">
        <style>
          body { font-family: system-ui, sans-serif; padding: 20px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
          th { background: #f5f5f5; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        ${printContent.outerHTML}
      </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.print();
    printWindow.close();
  }

  goBack(): void {
    this.router.navigate(['/pointages']);
  }
}
