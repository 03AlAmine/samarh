// ─── POINTAGE SERVICE ────────────────────────────────────────────────────────
// Calcule les pointages en rapprochant présences brutes et plannings.
//
// OPTIMISATION LOGIN :
//   - presencesJour$(date) : écoute temps réel sur UNE seule date
//   - getPresencesByPeriode() : charge une plage via orderByChild (pas toute la table)
//   - Cache en mémoire par date pour éviter les re-téléchargements

import { Injectable, inject } from '@angular/core';
import { Observable, of, shareReplay } from 'rxjs';
import { FirebaseService } from './firebase.service';
import { EmployeService } from './employe.service';
import {
  Employe,
  Planning,
} from '../models/employe.model';
import {
  PresenceBrute,
  JourFerie,
  PointageCalcule,
  StatutPointage,
  StatistiquesEmploye,
  EmployePointages,
  StatistiquesService,
} from '../models/pointage.model';

const RETARD_SEUIL_MINUTES = 10;

@Injectable({ providedIn: 'root' })
export class PointageService {
  private fb = inject(FirebaseService);
  private employeService = inject(EmployeService);

  // ── CACHE PAR DATE ────────────────────────────────────────────────────────
  // Clé : date ISO (ex: "2025-04-18"), valeur : Observable<PresenceBrute[]>
  // L'Observable est partagé (shareReplay) → un seul listener Firebase par date

  private cacheParDate = new Map<string, Observable<PresenceBrute[]>>();

  // Nettoyage du cache à minuit (évite d'accumuler des jours passés)
  private resetCacheAMinuit(): void {
    const maintenant = new Date();
    const demainMinuit = new Date(maintenant);
    demainMinuit.setDate(demainMinuit.getDate() + 1);
    demainMinuit.setHours(0, 0, 0, 0);
    const delai = demainMinuit.getTime() - maintenant.getTime();
    setTimeout(() => {
      this.cacheParDate.clear();
      this.resetCacheAMinuit(); // relancer pour le jour suivant
    }, delai);
  }

  constructor() {
    this.resetCacheAMinuit();
  }

  // ── STREAMS TEMPS RÉEL (FILTRÉS PAR DATE) ────────────────────────────────

  /**
   * Écoute temps réel des présences d'une date précise.
   * N'écoute QUE les enregistrements Login dont date === dateISO.
   * Le résultat est mis en cache — plusieurs abonnés partagent le même listener.
   */
  presencesJour$(dateISO: string): Observable<PresenceBrute[]> {
    if (this.cacheParDate.has(dateISO)) {
      return this.cacheParDate.get(dateISO)!;
    }

    const obs$ = this.fb
      .clientListenByChild<PresenceBrute>('Login', 'date', dateISO)
      .pipe(shareReplay(1));

    this.cacheParDate.set(dateISO, obs$);
    return obs$;
  }

  /**
   * Écoute temps réel d'une plage de dates.
   * Utilise orderByChild('date') + startAt/endAt → ne charge que la plage.
   */
  presencesPeriode$(dateDebut: string, dateFin: string): Observable<PresenceBrute[]> {
    return this.fb
      .clientListenByChild<PresenceBrute>('Login', 'date', dateDebut, dateFin)
      .pipe(shareReplay(1));
  }

  /** Jours fériés (petite collection, temps réel global ok) */
  jours_feries$: Observable<JourFerie[]> = this.fb
    .clientListenList<JourFerie>('JoursFeries')
    .pipe(shareReplay(1));

  // ── LECTURE PONCTUELLE ────────────────────────────────────────────────────

  /**
   * Récupère les présences d'une plage — filtre côté Firebase.
   * Ne charge PLUS toute la collection.
   */
  async getPresencesByPeriode(dateDebut: string, dateFin: string): Promise<PresenceBrute[]> {
    return this.fb.clientQueryByChild<PresenceBrute>('Login', 'date', dateDebut, dateFin);
  }

  /**
   * Présences d'un seul jour (one-shot, pour les calculs ponctuels).
   */
  async getPresencesJour(dateISO: string): Promise<PresenceBrute[]> {
    return this.fb.clientQueryByChild<PresenceBrute>('Login', 'date', dateISO);
  }

  async getJoursFeries(): Promise<JourFerie[]> {
    return this.fb.clientGetList<JourFerie>('JoursFeries');
  }

  // ── CALCUL POINTAGES ─────────────────────────────────────────────────────

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

  // ── HELPERS CALCUL ────────────────────────────────────────────────────────

  private calculerStatistiques(pointages: PointageCalcule[]): StatistiquesEmploye {
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

  private toDateStr(date: Date): string { return date.toISOString().split('T')[0]; }

  private getJourSemaine(date: Date): string {
    return ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'][date.getDay()];
  }
}
