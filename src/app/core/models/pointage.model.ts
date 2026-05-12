// ─── POINTAGE MODELS ─────────────────────────────────────────────────────────

export type StatutPointage =
  | 'present'
  | 'absent'
  | 'retard'
  | 'conge'
  | 'ferie'
  | 'formation'
  | 'repos';

/** Donnée brute de présence enregistrée par la badgeuse */
export interface PresenceBrute {
  id: string;
  matricule: string;
  matricule_service: string;
  date: string;
  arrive: string;
  descente: string;
}

/** Jour férié */
export interface JourFerie {
  id: string;
  date: string;
  nom: string;
}

/** Pointage calculé (après rapprochement planning / présence) */
export interface PointageCalcule {
  id: string;
  employeId: string;
  employeMatricule: string;
  date: string;
  jourSemaine: string;
  heureArrivee: string;
  heureDepart: string;
  heuresTravaillees: number;
  retard: number; // en minutes
  statut: StatutPointage;
  justification?: string;
  tranche?: 'jour' | 'nuit' | 'mixte';
  serviceMatricule?: string;
  _employeNom?: string;
}

/** Statistiques individuelles sur une période (pour les calculs internes) */
export interface StatistiquesEmployeInterne {
  joursPresents: number;
  joursAbsents: number;
  heuresTravaillees: number;
  retardMoyen: number;
  tauxAssiduite: number;
  joursFeries: number;
  joursConges: number;
  joursRepos: number;
}

/** Statistiques complètes pour l'affichage (dashboard employé) */
export interface StatistiquesEmploye {
  tauxPresence: number;
  joursPresents: number;
  joursTotal: number;
  joursAbsents: number;
  tauxAbsence: number;
  nbRetards: number;
  retardMoyen: number;
  noteAssiduite: number;
  heuresTotales: number;
  meilleureSemaine: string;
  meilleureSemainePresence: number;
  tendance: number;
  classementService: number;
  totalService: number;
  heuresTravaillees: number;
  tauxAssiduite: number;
  joursFeries: number;
  joursConges: number;
  joursRepos: number;
}

/** Statistiques mensuelles */
export interface StatsMensuelle {
  mois: string;
  joursOuverts: number;
  presents: number;
  absents: number;
  retards: number;
  tauxPresence: number;
  evolution: number;
}

/** Agrégat employé + pointages + stats */
export interface EmployePointages {
  employe: import('./employe.model').Employe;
  pointages: PointageCalcule[];
  statistiques: StatistiquesEmployeInterne;
  tauxPresence: number;
  heuresTotales: number;
  joursAbsents: number;
}

/** Statistiques globales d'un service */
export interface StatistiquesService {
  totalEmployes: number;
  tauxPresenceMoyen: number;
  heuresTotales: number;
  joursPresentsTotaux: number;
  joursAbsentsTotaux: number;
  retardMoyenService: number;
  employePlusAssidu: EmployePointages | null;
  employeMoinsAssidu: EmployePointages | null;
}
// pointages.ts - ajouter cette interface

export interface DetailPointageExport {
  prenom: string;
  nom: string;
  matricule: string;
  service: string;
  poste: string;
  arrive: string;
  depart: string;
  heures: number;
  retard: number;
  statut: 'present' | 'retard' | 'absent';
}
