// ─── USER MODELS ─────────────────────────────────────────────────────────────
// Trois types d'utilisateurs : admin SaaS, gérant de communauté, employé communauté

export type UserType = 'individual' | 'company' | 'employee';
export type AccountType = 'free' | 'basic' | 'premium' | 'enterprise';
export type UserStatus = 'pending' | 'active' | 'suspended' | 'rejected';

/** Champs communs à tous les utilisateurs */
export interface UserBase {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  userType: UserType;
  accountType: AccountType;
  status: UserStatus;
  createdAt: string;
  emailVerified: boolean;
  lastLogin?: string;
  avatar?: string;
  communauteId?: string;
  /** Vrai pour les employés connectés via login communauté (sans Firebase Auth) */
  isCommunauteUser?: boolean;
}

/** Utilisateur individuel */
export interface IndividualUser extends UserBase {
  userType: 'individual';
  dateOfBirth?: string;
  cin?: string;
  address?: string;
  gender?: 'male' | 'female';
}

/** Utilisateur entreprise */
export interface CompanyUser extends UserBase {
  userType: 'company';
  companyName: string;
  companyType: 'sarl' | 'sa' | 'eurl' | 'sas' | 'other';
  address: string;
  industry: string;
  employeesCount: number;
}

/** Employé connecté via login communauté */
export interface EmployeeUser extends UserBase {
  userType: 'employee';
  role: string; // "Administrateur" ou "Employé"
  login?: string;
  matricule?: string;
  service?: string;
  poste?: string;
  services?: string[]; // services autorisés (["Tous"] = admin communauté)
  communauteNom?: string;
}

export type AppUser = IndividualUser | CompanyUser | EmployeeUser;

/** Communauté (espace de travail d'un gérant) */
export interface Communaute {
  id: string;
  uidAdmin: string;
  nom: string;
  type: 'company' | 'individual';
  membres: string[];
  firebaseConfig?: FirebaseClientConfig;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'suspended';
}

export interface FirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  databaseURL: string;
  projectId: string;
  messagingSenderId: string;
  appId: string;
  storageBucket?: string;
}
