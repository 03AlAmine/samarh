// user.model.ts - version finale corrigée

export type UserType = 'individual' | 'company' | 'employee' | 'admin';
export type AccountType = 'free' | 'basic' | 'premium' | 'enterprise';
export type UserStatus = 'pending' | 'active' | 'suspended' | 'rejected';
export type RoleType = 'Employé' | 'Chargé de compte' | 'Administrateur';

// ─── UserBase (champs communs) ───────────────────────────────────────────────
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
  isCommunauteUser?: boolean;
}

// ─── AppUser (utilisé dans AuthService) ───────────────────────────────────────
export interface AppUser {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  userType: 'admin' | 'company' | 'individual' | 'employee';
  accountType: 'free' | 'basic' | 'premium' | 'enterprise';
  status: 'active' | 'pending' | 'rejected' | 'suspended';
  createdAt: string;
  emailVerified: boolean;
  communauteId?: string;
  companyName?: string;
  isCommunauteUser?: boolean;
  login?: string;
  matricule?: string;
  services?: string[];
  role?: RoleType;
  pin?: string;
}

// ─── EmployeeUser (pour les employés communauté) ──────────────────────────────
export interface EmployeeUser extends AppUser {
  userType: 'employee';
  login?: string;
  matricule?: string;
  service?: string;
  poste?: string;
  services?: string[];
  communauteNom?: string;
  role?: RoleType;  // ✅ Type correct
}

// ─── Communauté ───────────────────────────────────────────────────────────────
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

// ─── IndividualUser / CompanyUser (pour compatibilité) ────────────────────────
export interface IndividualUser extends UserBase {
  userType: 'individual';
  dateOfBirth?: string;
  cin?: string;
  address?: string;
  gender?: 'male' | 'female';
}

export interface CompanyUser extends UserBase {
  userType: 'company';
  companyName: string;
  companyType: 'sarl' | 'sa' | 'eurl' | 'sas' | 'other';
  address: string;
  industry: string;
  employeesCount: number;
}
