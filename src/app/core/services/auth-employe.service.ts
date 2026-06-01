// core/services/auth-employe.service.ts
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { EmployeService } from './employe.service';
import { Employe } from '../models/employe.model';

@Injectable({ providedIn: 'root' })
export class AuthEmployeService {
  private employeService = inject(EmployeService);

  private currentEmployeSubject = new BehaviorSubject<Employe | null>(null);
  currentEmploye$ = this.currentEmployeSubject.asObservable();

  /**
   * Connexion par matricule ou email + PIN
   */
  async login(identifiant: string, pin: string): Promise<Employe> {
    const employes = await this.employeService.getAll();

    // Recherche par matricule ou email
    const employe = employes.find(e =>
      e.matricule === identifiant ||
      e.email === identifiant ||
      e.login === identifiant
    );

    if (!employe) {
      throw new Error('Identifiant incorrect');
    }

    if (employe.statut !== 'actif') {
      throw new Error('Compte désactivé. Contactez votre responsable.');
    }

    // Vérification du PIN
    if (employe.pin !== pin) {
      throw new Error('Code PIN incorrect');
    }

    // Stocker la session
    sessionStorage.setItem('employeSession', JSON.stringify({
      id: employe.id,
      matricule: employe.matricule,
      nom: employe.nom,
      prenom: employe.prenom,
      pin: employe.pin,
      service: employe.service,
      role: employe.role
    }));

    this.currentEmployeSubject.next(employe);
    return employe;
  }

  logout(): void {
    sessionStorage.removeItem('employeSession');
    this.currentEmployeSubject.next(null);
  }

  getCurrentEmploye(): Employe | null {
    const session = sessionStorage.getItem('employeSession');
    if (session) {
      const data = JSON.parse(session);
      // Recharger l'employé complet si nécessaire
      return data as Employe;
    }
    return this.currentEmployeSubject.value;
  }

  isLoggedIn(): boolean {
    return !!this.getCurrentEmploye();
  }
}
