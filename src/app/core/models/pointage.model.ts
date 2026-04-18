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

/** Statistiques individuelles sur une période */
export interface StatistiquesEmploye {
  joursPresents: number;
  joursAbsents: number;
  heuresTravaillees: number;
  retardMoyen: number;
  tauxAssiduite: number;
  joursFeries: number;
  joursConges: number;
  joursRepos: number;
}

/** Agrégat employé + pointages + stats */
export interface EmployePointages {
  employe: import('./employe.model').Employe;
  pointages: PointageCalcule[];
  statistiques: StatistiquesEmploye;
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
