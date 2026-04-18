// ─── PLANNING EDITOR ──────────────────────────────────────────────────────────
// Composant réutilisable : édite le planning hebdomadaire (Planning[]) d'un
// employé ou d'un service. Affiche 7 jours, chaque jour peut être activé avec
// des heures début/fin, ou marqué "Repos".
//
// Usage :
//   <app-planning-editor
//     [planning]="employe().planning"
//     (save)="savePlanning($event)"
//   />

import {
  Component, Input, Output, EventEmitter, OnInit,
  signal, computed, ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Planning } from '../../../core/models/employe.model';

export interface PlanningJour {
  jour: string;
  actif: boolean;
  heureDebut: string;   // "HH:MM"
  heureFin:   string;   // "HH:MM"
}

const JOURS = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];

@Component({
  selector: 'app-planning-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './planning-editor.html',
  styleUrls: ['./planning-editor.scss'],
})
export class PlanningEditorComponent implements OnInit {
  @Input() planning: Planning[] = [];
  @Input() saving = false;
  @Input() readOnly = false;
  @Output() saved = new EventEmitter<Planning[]>();

  jours = signal<PlanningJour[]>([]);

  readonly joursSemaine = JOURS;

  // Résumé : nombre de jours travaillés et total heures/sem
  resume = computed(() => {
    const actifs = this.jours().filter(j => j.actif);
    let totalMin = 0;
    actifs.forEach(j => {
      const [hd, md] = j.heureDebut.split(':').map(Number);
      const [hf, mf] = j.heureFin.split(':').map(Number);
      const diff = hf * 60 + mf - (hd * 60 + md);
      if (diff > 0) totalMin += diff;
    });
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return {
      jours: actifs.length,
      heures: h,
      minutes: m,
      label: m > 0 ? `${h}h${m.toString().padStart(2,'0')}` : `${h}h`,
    };
  });

  ngOnInit(): void {
    this.initJours();
  }

  ngOnChanges(): void {
    this.initJours();
  }

  private initJours(): void {
    const existing = new Map<string, Planning>();
    (this.planning || []).forEach(p => existing.set(p.jour, p));

    this.jours.set(JOURS.map(jour => {
      const p = existing.get(jour);
      return {
        jour,
        actif: !!p,
        heureDebut: p ? this.formatTime(p.heureDebut, p.minuteDebut) : '08:00',
        heureFin:   p ? this.formatTime(p.heureFin,   p.minuteFin)   : '17:00',
      };
    }));
  }

  toggleJour(jour: string): void {
    if (this.readOnly) return;
    this.jours.update(list =>
      list.map(j => j.jour === jour ? { ...j, actif: !j.actif } : j)
    );
  }

  updateHeure(jour: string, field: 'heureDebut' | 'heureFin', value: string): void {
    this.jours.update(list =>
      list.map(j => j.jour === jour ? { ...j, [field]: value } : j)
    );
  }

  // Applique le même horaire à tous les jours actifs
  appliquerATous(source: PlanningJour): void {
    this.jours.update(list =>
      list.map(j => j.actif ? { ...j, heureDebut: source.heureDebut, heureFin: source.heureFin } : j)
    );
  }

  // Preset semaine standard (Lun-Ven 8h-17h)
  semaineStandard(): void {
    const weekdays = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi'];
    this.jours.update(list =>
      list.map(j => ({
        ...j,
        actif: weekdays.includes(j.jour),
        heureDebut: weekdays.includes(j.jour) ? '08:00' : j.heureDebut,
        heureFin:   weekdays.includes(j.jour) ? '17:00' : j.heureFin,
      }))
    );
  }

  // Preset 6 jours (Lun-Sam)
  sixJours(): void {
    const days = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
    this.jours.update(list =>
      list.map(j => ({
        ...j,
        actif: days.includes(j.jour),
        heureDebut: days.includes(j.jour) ? '08:00' : j.heureDebut,
        heureFin:   days.includes(j.jour) ? '17:00' : j.heureFin,
      }))
    );
  }

  onSave(): void {
    const result: Planning[] = this.jours()
      .filter(j => j.actif)
      .map(j => {
        const [hd, md] = j.heureDebut.split(':').map(Number);
        const [hf, mf] = j.heureFin.split(':').map(Number);
        return {
          jour: j.jour,
          heureDebut: hd, minuteDebut: md,
          heureFin: hf,   minuteFin:   mf,
        };
      });
    this.saved.emit(result);
  }

  duree(j: PlanningJour): string {
    if (!j.actif) return '';
    const [hd, md] = j.heureDebut.split(':').map(Number);
    const [hf, mf] = j.heureFin.split(':').map(Number);
    const diff = hf * 60 + mf - (hd * 60 + md);
    if (diff <= 0) return '';
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    return m > 0 ? `${h}h${m.toString().padStart(2,'0')}` : `${h}h`;
  }

  private formatTime(h: number, m: number): string {
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
  }
}
