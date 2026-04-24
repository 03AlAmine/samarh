// ─── EMPLOYE MODELS ──────────────────────────────────────────────────────────
// Données métier relatives aux employés et services d'une communauté

/** Employé stocké dans la base Firebase de la communauté */
export interface Employe {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  email?: string;
  telephone?: string;
  dateNaissance?: string;
  lieuNaissance?: string;
  cin?: string;
  adresse?: string;
  ville?: string;
  pays?: string;
  civilite?: 'M' | 'Mme';
  situationFamiliale?: string;
  nombreEnfants?: number;
  poste?: string;
  service?: string; // matricule du service
  nom_service?: string;
  typeContrat?: string;
  dateEmbauche?: string;
  dateFinContrat?: string;
  salaireBase?: number;
  modePaiement?: string;
  numCNSS?: string;
  competences?: string[];
  groupeSanguin?: string;
  statut?: 'actif' | 'inactif' | 'archive';
  image?: string;
  login?: string;
  // Mot de passe — stocké en bcrypt, peut s'appeler password, mdp ou motDePasse selon la communauté
  password?: string;
  mdp?: string;
  motDePasse?: string;
  planning?: Planning[];
  planningRotatif?: PlanningRotatif[];
  createdAt?: string;
  updatedAt?: string;

  services?: string[]; // ex: ['SVC001', 'SVC002']

  // Rôle de l'employé dans l'application
  role?: 'Employé' | 'Chargé de compte' | 'Administrateur';

  // Pour compatibilité avec l'existant
  estChargeCompte?: boolean;
}

// employe.model.ts - ajouter/modifier l'interface Service
export interface Service {
  id: string;
  matricule: string;
  nom: string;
  type_service?: 'Permanent' | 'Rotatif';
  planning?: Planning[];
  planningRotatif?: PlanningRotatif[];
  actif?: boolean;
  description?: string;
  responsablesIds?: string[]; // IDs des employés responsables
  responsables?: Employe[]; // Pour l'affichage (détaillé)
  effectif?: number;
  responsablePrincipal?: string; // ID du responsable principal (optionnel)
  createdAt?: string;
  updatedAt?: string;
}

/** Créneau horaire journalier */
export interface Planning {
  jour: string;
  heureDebut: number;
  minuteDebut: number;
  heureFin: number;
  minuteFin: number;
}

/** Planning rotatif jour/nuit */
export interface PlanningRotatif {
  date: string;
  employe_jour: string[];
  employe_nuit: string[];
  horaire_jour: string;
  horaire_nuit: string;
}
