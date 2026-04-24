// src/app/core/services/role-filter.service.ts
import { Injectable, computed, signal, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { Employe, Service } from '../models/employe.model';
import { PresenceBrute } from '../models/pointage.model';

@Injectable({ providedIn: 'root' })
export class RoleFilterService {
  private auth = inject(AuthService);

  /**
   * Filtre les services selon le rôle de l'utilisateur
   * - Admin → tous les services
   * - Chargé de compte → uniquement ses services
   */
  filterServices(services: Service[]): Service[] {
    if (this.auth.isAdmin) return services;
    const userServices = this.getUserServiceMatricules();
    return services.filter(s => userServices.includes(s.matricule));
  }

  /**
   * Vérifie si l'utilisateur peut voir un service spécifique
   */
  canViewService(serviceMatricule: string): boolean {
    if (this.auth.isAdmin) return true;
    return this.getUserServiceMatricules().includes(serviceMatricule);
  }

  /**
   * Filtre les employés selon le rôle
   * - Admin → tous les employés actifs
   * - Chargé de compte → employés dont le service est dans ses services autorisés
   */
  filterEmployes(employes: Employe[]): Employe[] {
    if (this.auth.isAdmin) {
      return employes.filter(e => e.statut !== 'archive');
    }
    const userServices = this.getUserServiceMatricules();
    return employes.filter(e =>
      e.statut !== 'archive' &&
      e.service &&
      userServices.includes(e.service)
    );
  }

  /**
   * Filtre les présences selon le rôle
   */
  filterPresences(presences: PresenceBrute[], employes: Employe[]): PresenceBrute[] {
    if (this.auth.isAdmin) return presences;
    const employeMatricules = new Set(
      this.filterEmployes(employes).map(e => e.matricule)
    );
    return presences.filter(p => employeMatricules.has(p.matricule));
  }

  /**
   * Vérifie si l'utilisateur peut modifier un employé
   * - Admin → oui
   * - Chargé de compte → oui si l'employé est dans ses services
   */
  canEditEmploye(employe: Employe): boolean {
    if (this.auth.isAdmin) return true;
    if (!this.auth.canEditEmployes) return false;
    const userServices = this.getUserServiceMatricules();
    return employe.service ? userServices.includes(employe.service) : false;
  }

  /**
   * Vérifie si l'utilisateur peut voir les détails d'un employé
   */
  canViewEmploye(employe: Employe): boolean {
    if (this.auth.isAdmin) return true;
    const userServices = this.getUserServiceMatricules();
    return employe.service ? userServices.includes(employe.service) : false;
  }

  /**
   * Récupère les matricules des services autorisés pour l'utilisateur
   */
  private getUserServiceMatricules(): string[] {
    const user = this.auth.currentUser as any;
    if (!user) return [];
    // Si l'utilisateur a "Tous" ou est admin
    if (user.services === 'Tous' || this.auth.isAdmin) return [];
    if (Array.isArray(user.services)) return user.services;
    return [];
  }

  /**
   * Retourne la liste des services autorisés avec leurs noms (pour affichage)
   */
  getUserServicesNames(services: Service[]): string {
    if (this.auth.isAdmin) return 'Tous les services';
    const userServices = this.getUserServiceMatricules();
    const names = services
      .filter(s => userServices.includes(s.matricule))
      .map(s => s.nom);
    return names.join(', ') || '—';
  }
}
