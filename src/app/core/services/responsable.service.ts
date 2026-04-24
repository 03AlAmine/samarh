// responsable.service.ts
import { Injectable, inject } from '@angular/core';
import { EmployeService } from './employe.service';
import { Employe, Service } from '../models/employe.model';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ResponsableService {
  private employeService = inject(EmployeService);

  /**
   * Récupère les employés pouvant être responsables
   * Un responsable potentiel = employé avec rôle "Chargé de compte" ou "Administrateur"
   * OU qui a le champ estChargeCompte = true
   * OU qui a au moins un service dans son tableau services
   */
  async getCandidatsResponsables(): Promise<Employe[]> {
    const employes = await firstValueFrom(this.employeService.employes$);

    const candidats = employes.filter(e => {
      // Condition 1: A le rôle "Chargé de compte" ou "Administrateur"
      const hasRole = e.role === 'Chargé de compte' || e.role === 'Administrateur';
      // Condition 2: A le flag estChargeCompte à true
      const hasFlag = e.estChargeCompte === true;
      // Condition 3: A au moins un service dans son tableau services
      const hasServices = e.services && e.services.length > 0;

      return (hasRole || hasFlag || hasServices) && e.statut !== 'archive';
    });

    return candidats;
  }

  /**
   * Récupère les responsables d'un service spécifique
   */
  getResponsablesForService(service: Service, allEmployes: Employe[]): Employe[] {
    return allEmployes.filter(e => {
      const estResponsable = (e.role === 'Chargé de compte' || e.role === 'Administrateur' || e.estChargeCompte === true);
      const aAccesService = e.services?.includes(service.matricule) === true;
      return estResponsable && aAccesService && e.statut !== 'archive';
    });
  }

  /**
   * Récupère les IDs des responsables d'un service
   */
  getResponsableIdsForService(service: Service, allEmployes: Employe[]): string[] {
    return this.getResponsablesForService(service, allEmployes).map(r => r.id);
  }

  /**
   * Compte le nombre de responsables pour un service
   */
  getNombreResponsablesForService(service: Service, allEmployes: Employe[]): number {
    return this.getResponsablesForService(service, allEmployes).length;
  }

  /**
   * Vérifie si un employé est responsable d'un service
   */
  isResponsableForService(employeId: string, service: Service, allEmployes: Employe[]): boolean {
    const employe = allEmployes.find(e => e.id === employeId);
    if (!employe) return false;
    const estResponsable = employe.role === 'Chargé de compte' || employe.role === 'Administrateur' || employe.estChargeCompte === true;
    return estResponsable && (employe.services?.includes(service.matricule) || false);
  }
}
