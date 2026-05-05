// ─── POINTAGE SERVICE ────────────────────────────────────────────────────────
// Calcule les pointages en rapprochant présences brutes et plannings.

import { Injectable, inject } from '@angular/core';
import { Observable, shareReplay } from 'rxjs';
import { FirebaseService } from './firebase.service';
import { EmployeService } from './employe.service';
import { Employe, Planning } from '../models/employe.model';
import { filter, take, switchMap } from 'rxjs/operators';
import {
  PresenceBrute,
  JourFerie,
  PointageCalcule,
  StatutPointage,
  StatistiquesEmployeInterne,
  EmployePointages,
  StatistiquesService,
  StatistiquesEmploye,
  StatsMensuelle,
} from '../models/pointage.model';

const RETARD_SEUIL_MINUTES = 10;

@Injectable({ providedIn: 'root' })
export class PointageService {
  private fb = inject(FirebaseService);
  private employeService = inject(EmployeService);

  // ── CACHE PAR DATE ────────────────────────────────────────────────────────

  private cacheParDate = new Map<string, Observable<PresenceBrute[]>>();

  private resetCacheAMinuit(): void {
    const maintenant = new Date();
    const demainMinuit = new Date(maintenant);
    demainMinuit.setDate(demainMinuit.getDate() + 1);
    demainMinuit.setHours(0, 0, 0, 0);
    const delai = demainMinuit.getTime() - maintenant.getTime();
    setTimeout(() => {
      this.cacheParDate.clear();
      this.resetCacheAMinuit();
    }, delai);
  }

  constructor() {
    this.resetCacheAMinuit();
  }

  // ── STREAMS TEMPS RÉEL ────────────────────────────────────────────────────

  presencesJour$(dateISO: string): Observable<PresenceBrute[]> {
    if (this.cacheParDate.has(dateISO)) {
      return this.cacheParDate.get(dateISO)!;
    }

    const obs$ = this.fb.clientReady$.pipe(
      filter(ready => ready),
      take(1),
      switchMap(() => this.fb.clientListenByChild<PresenceBrute>('Login', 'date', dateISO)),
      shareReplay(1),
    );

    this.cacheParDate.set(dateISO, obs$);
    return obs$;
  }

  presencesPeriode$(dateDebut: string, dateFin: string): Observable<PresenceBrute[]> {
    return this.fb.clientReady$.pipe(
      filter(ready => ready),
      take(1),
      switchMap(() => this.fb.clientListenByChild<PresenceBrute>('Login', 'date', dateDebut, dateFin)),
      shareReplay(1),
    );
  }

  jours_feries$: Observable<JourFerie[]> = this.fb.clientReady$.pipe(
    filter(ready => ready),
    take(1),
    switchMap(() => this.fb.clientListenList<JourFerie>('JoursFeries')),
    shareReplay(1),
  );

  // ── LECTURE PONCTUELLE ────────────────────────────────────────────────────

  async getPresencesByPeriode(dateDebut: string, dateFin: string): Promise<PresenceBrute[]> {
    return this.fb.clientQueryByChild<PresenceBrute>('Login', 'date', dateDebut, dateFin);
  }

  async getPresencesJour(dateISO: string): Promise<PresenceBrute[]> {
    return this.fb.clientQueryByChild<PresenceBrute>('Login', 'date', dateISO);
  }

  async getJoursFeries(): Promise<JourFerie[]> {
    return this.fb.clientGetList<JourFerie>('JoursFeries');
  }

  /**
   * Récupère les statistiques complètes d'un employé sur une période
   */
  async getStatsEmploye(
    employe: Employe,
    dateDebut: string,
    dateFin: string
  ): Promise<StatistiquesEmploye> {
    const presences = await this.getPresencesByPeriode(dateDebut, dateFin);
    const presencesEmploye = presences.filter(p => p.matricule === employe.matricule);

    const joursTotal = this.getJoursOuvres(new Date(dateDebut), new Date(dateFin));
    const joursPresents = presencesEmploye.filter(p => p.arrive).length;
    const nbRetards = this.calculerRetardsEmploye(presencesEmploye, employe);
    const retardMoyen = nbRetards > 0
      ? Math.round(this.getTotalRetards(presencesEmploye, employe) / nbRetards)
      : 0;

    // Calculer les statistiques mensuelles
    const statsMensuelles = await this.getStatsMensuelles(employe, dateDebut, dateFin);

    // Calculer la tendance
    const tendance = this.calculerTendance(statsMensuelles);

    return {
      tauxPresence: joursTotal > 0 ? Math.round((joursPresents / joursTotal) * 100) : 0,
      joursPresents,
      joursTotal,
      joursAbsents: joursTotal - joursPresents,
      tauxAbsence: joursTotal > 0 ? Math.round(((joursTotal - joursPresents) / joursTotal) * 100) : 0,
      nbRetards,
      retardMoyen,
      noteAssiduite: this.calculerNoteAssiduite(joursPresents, joursTotal, nbRetards),
      heuresTotales: this.calculerHeuresTotales(presencesEmploye),
      meilleureSemaine: '12',
      meilleureSemainePresence: 0,
      tendance,
      classementService: 0,
      totalService: 0,
      heuresTravaillees: this.calculerHeuresTotales(presencesEmploye),
      tauxAssiduite: joursTotal > 0 ? Math.round((joursPresents / joursTotal) * 100) : 0,
      joursFeries: 0,
      joursConges: 0,
      joursRepos: 0,
    };
  }

  /**
   * Récupère les statistiques mensuelles d'un employé
   */
  async getStatsMensuelles(
    employe: Employe,
    dateDebut: string,
    dateFin: string
  ): Promise<StatsMensuelle[]> {
    const presences = await this.getPresencesByPeriode(dateDebut, dateFin);
    const presencesEmploye = presences.filter(p => p.matricule === employe.matricule);

    const stats: StatsMensuelle[] = [];
    const moisLabels = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

    for (let i = 0; i < 12; i++) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const mois = `${moisLabels[date.getMonth()]} ${date.getFullYear()}`;

      stats.unshift({
        mois,
        joursOuverts: 20,
        presents: 0,
        absents: 0,
        retards: 0,
        tauxPresence: 0,
        evolution: 0,
      });
    }

    return stats;
  }

  // ── HELPERS CALCUL ────────────────────────────────────────────────────────

  private getJoursOuvres(dateDebut: Date, dateFin: Date): number {
    let count = 0;
    const current = new Date(dateDebut);
    while (current <= dateFin) {
      const jour = current.getDay();
      if (jour !== 0 && jour !== 6) count++;
      current.setDate(current.getDate() + 1);
    }
    return count;
  }

  private calculerRetardsEmploye(presences: PresenceBrute[], employe: Employe): number {
    let retards = 0;
    for (const p of presences) {
      if (p.arrive) {
        const heure = parseInt(p.arrive.split(':')[0]);
        if (heure > 9) retards++;
      }
    }
    return retards;
  }

  private getTotalRetards(presences: PresenceBrute[], employe: Employe): number {
    let total = 0;
    for (const p of presences) {
      if (p.arrive) {
        const heure = parseInt(p.arrive.split(':')[0]);
        if (heure > 9) total += (heure - 9) * 60;
      }
    }
    return total;
  }

  private calculerNoteAssiduite(presents: number, total: number, retards: number): number {
    const basePresence = total > 0 ? (presents / total) * 100 : 0;
    const penaliteRetard = Math.min(20, retards * 2);
    return Math.max(0, Math.min(100, Math.round(basePresence - penaliteRetard)));
  }

  private calculerHeuresTotales(presences: PresenceBrute[]): number {
    let heures = 0;
    for (const p of presences) {
      if (p.arrive && p.descente) {
        const hA = parseInt(p.arrive.split(':')[0]);
        const hD = parseInt(p.descente.split(':')[0]);
        heures += hD - hA;
      }
    }
    return heures;
  }

  private calculerTendance(statsMois: StatsMensuelle[]): number {
    if (statsMois.length < 2) return 0;
    const dernier = statsMois[statsMois.length - 1].tauxPresence;
    const avantDernier = statsMois[statsMois.length - 2].tauxPresence;
    return dernier - avantDernier;
  }

  // ─── MÉTHODES EXISTANTES (conservées pour compatibilité) ───────────────────

  async calculerPointagesEmploye(
    employe: Employe,
    service: any,
    dateDebut: Date,
    dateFin: Date,
    presences: PresenceBrute[],
    joursFeries: JourFerie[],
  ): Promise<EmployePointages> {
    const pointages: PointageCalcule[] = [];
    const feriesSet = new Set(joursFeries.map((j) => j.date));

    let current = new Date(dateDebut);
    while (current <= dateFin) {
      const dateStr = this.toDateStr(current);
      const jourSemaine = this.getJourSemaine(current);

      const presence = presences.find(
        (p) => p.date === dateStr && p.matricule === employe.matricule,
      );

      let statut: StatutPointage = 'absent';
      let heureArrivee = '';
      let heureDepart = '';
      let heuresTravaillees = 0;
      let retard = 0;

      if (feriesSet.has(dateStr)) {
        statut = 'ferie';
      } else if (this.estJourRepos(employe, service, current)) {
        statut = 'repos';
      } else if (presence) {
        heureArrivee = presence.arrive || '';
        heureDepart = presence.descente || '';
        heuresTravaillees = this.calculerHeuresTravaillees(heureArrivee, heureDepart);
        retard = this.calculerRetard(employe, service, current, heureArrivee);
        statut = retard > RETARD_SEUIL_MINUTES ? 'retard' : 'present';
      }

      pointages.push({
        id: `${employe.matricule}_${dateStr}`,
        employeId: employe.id,
        employeMatricule: employe.matricule,
        date: dateStr,
        jourSemaine,
        heureArrivee,
        heureDepart,
        heuresTravaillees,
        retard,
        statut,
        justification: '',
        _employeNom: `${employe.prenom} ${employe.nom}`,
      });

      current.setDate(current.getDate() + 1);
    }

    const statistiques = this.calculerStatistiques(pointages);

    return {
      employe,
      pointages,
      statistiques,
      tauxPresence: statistiques.tauxAssiduite,
      heuresTotales: statistiques.heuresTravaillees,
      joursAbsents: statistiques.joursAbsents,
    };
  }

  calculerStatistiquesService(employePointages: EmployePointages[]): StatistiquesService {
    if (!employePointages.length) {
      return {
        totalEmployes: 0, tauxPresenceMoyen: 0, heuresTotales: 0,
        joursPresentsTotaux: 0, joursAbsentsTotaux: 0, retardMoyenService: 0,
        employePlusAssidu: null, employeMoinsAssidu: null,
      };
    }
    const total = employePointages.length;
    const sorted = [...employePointages].sort((a, b) => b.tauxPresence - a.tauxPresence);
    return {
      totalEmployes: total,
      tauxPresenceMoyen: employePointages.reduce((s, e) => s + e.tauxPresence, 0) / total,
      heuresTotales: employePointages.reduce((s, e) => s + e.heuresTotales, 0),
      joursPresentsTotaux: employePointages.reduce((s, e) => s + e.statistiques.joursPresents, 0),
      joursAbsentsTotaux: employePointages.reduce((s, e) => s + e.joursAbsents, 0),
      retardMoyenService: employePointages.reduce((s, e) => s + e.statistiques.retardMoyen, 0) / total,
      employePlusAssidu: sorted[0] ?? null,
      employeMoinsAssidu: sorted[sorted.length - 1] ?? null,
    };
  }

  private calculerStatistiques(pointages: PointageCalcule[]): StatistiquesEmployeInterne {
    const joursPresents = pointages.filter((p) => p.statut === 'present' || p.statut === 'retard').length;
    const joursAbsents  = pointages.filter((p) => p.statut === 'absent').length;
    const joursFeries   = pointages.filter((p) => p.statut === 'ferie').length;
    const joursConges   = pointages.filter((p) => p.statut === 'conge').length;
    const joursRepos    = pointages.filter((p) => p.statut === 'repos').length;
    const joursOuvres   = pointages.filter((p) => p.statut !== 'repos' && p.statut !== 'ferie').length;
    const heuresTravaillees = pointages.reduce((s, p) => s + p.heuresTravaillees, 0);
    const retardsNonZero = pointages.filter((p) => p.retard > 0);
    const retardMoyen = retardsNonZero.length
      ? retardsNonZero.reduce((s, p) => s + p.retard, 0) / retardsNonZero.length : 0;
    return {
      joursPresents, joursAbsents, heuresTravaillees,
      retardMoyen: Math.round(retardMoyen),
      tauxAssiduite: joursOuvres ? Math.round((joursPresents / joursOuvres) * 100) : 0,
      joursFeries, joursConges, joursRepos,
    };
  }

  private estJourRepos(employe: Employe, service: any, date: Date): boolean {
    const jourSemaine = this.getJourSemaine(date).toLowerCase();
    const planning: Planning[] = employe.planning || service?.planning || [];
    if (!planning.length) return false;
    return !planning.some((p) => p.jour?.toLowerCase() === jourSemaine);
  }

  private calculerRetard(employe: Employe, service: any, date: Date, heureArrivee: string): number {
    if (!heureArrivee) return 0;
    const planning: Planning[] = employe.planning || service?.planning || [];
    const jourSemaine = this.getJourSemaine(date).toLowerCase();
    const plage = planning.find((p) => p.jour?.toLowerCase() === jourSemaine);
    if (!plage) return 0;
    const [hA, mA] = heureArrivee.split(':').map(Number);
    const debutMin = plage.heureDebut * 60 + plage.minuteDebut;
    return Math.max(0, hA * 60 + mA - debutMin);
  }

  private calculerHeuresTravaillees(arrivee: string, depart: string): number {
    if (!arrivee || !depart) return 0;
    const [hA, mA] = arrivee.split(':').map(Number);
    const [hD, mD] = depart.split(':').map(Number);
    const diff = hD * 60 + mD - (hA * 60 + mA);
    return diff > 0 ? Math.round((diff / 60) * 100) / 100 : 0;
  }

  private toDateStr(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  private getJourSemaine(date: Date): string {
    return ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'][date.getDay()];
  }
}
