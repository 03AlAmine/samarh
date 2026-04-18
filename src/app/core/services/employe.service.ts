// ─── EMPLOYE SERVICE ─────────────────────────────────────────────────────────
// CRUD employés + services d'une communauté.
// Toutes les opérations passent par FirebaseService.clientXxx()

import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';
import * as bcrypt from 'bcryptjs';
import { FirebaseService } from './firebase.service';
import { Employe, Service } from '../models/employe.model';

@Injectable({ providedIn: 'root' })
export class EmployeService {
  private fb = inject(FirebaseService);

  // ── Streams temps réel ────────────────────────────────────────────────────

  /** Tous les employés actifs (temps réel) */
  employes$: Observable<Employe[]> = this.fb.clientListenList<Employe>('Employe').pipe(
    map((list) => list.filter((e) => e.statut !== 'archive')),
    shareReplay(1),
  );

  /** Tous les services (temps réel) */
  services$: Observable<Service[]> = this.fb.clientListenList<Service>('Service').pipe(
    shareReplay(1),
  );

  // ── EMPLOYÉS ──────────────────────────────────────────────────────────────

  async getAll(): Promise<Employe[]> {
    return this.fb.clientGetList<Employe>('Employe');
  }

  async getById(id: string): Promise<Employe | null> {
    return this.fb.clientGet<Employe>(`Employe/${id}`);
  }

  async create(data: Omit<Employe, 'id'>): Promise<string> {
    const now = new Date().toISOString();
    return this.fb.clientPush('Employe', { ...data, createdAt: now, updatedAt: now });
  }

  async update(id: string, data: Partial<Employe>): Promise<void> {
    await this.fb.clientUpdate(`Employe/${id}`, {
      ...data,
      updatedAt: new Date().toISOString(),
    });
  }

  async archive(id: string): Promise<void> {
    await this.fb.clientUpdate(`Employe/${id}`, {
      statut: 'archive',
      updatedAt: new Date().toISOString(),
    });
  }

  async delete(id: string): Promise<void> {
    await this.fb.clientRemove(`Employe/${id}`);
  }

  /**
   * Vérifie les identifiants de connexion d'un employé.
   *
   * Gère deux cas :
   *  - Mot de passe haché bcrypt (stocké dans `mdp`, `password` ou `motDePasse`)
   *  - Mot de passe en clair (anciens comptes non encore migrés)
   */
  async findByLogin(login: string, password: string): Promise<Employe | null> {
    const employes = await this.getAll();

    // Trouver l'employé par login (insensible à la casse pour plus de tolérance)
    const employe = employes.find(
      (e) => e.login?.toLowerCase() === login.toLowerCase().trim(),
    );

    if (!employe) return null;

    // Le hash stocké peut être dans mdp, password ou motDePasse
    const storedHash: string = (employe as any).mdp || employe.password || (employe as any).motDePasse || '';

    if (!storedHash) return null;

    // Détecter si c'est un hash bcrypt (commence par $2a$ ou $2b$)
    const isBcrypt = storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$');

    if (isBcrypt) {
      const valid = await bcrypt.compare(password, storedHash);
      return valid ? employe : null;
    }

    // Fallback : comparaison directe (anciens comptes en clair)
    return storedHash === password ? employe : null;
  }

  // ── SERVICES ──────────────────────────────────────────────────────────────

  async getAllServices(): Promise<Service[]> {
    return this.fb.clientGetList<Service>('Service');
  }

  async getServiceById(id: string): Promise<Service | null> {
    return this.fb.clientGet<Service>(`Service/${id}`);
  }

  async createService(data: Omit<Service, 'id'>): Promise<string> {
    return this.fb.clientPush('Service', data);
  }

  async updateService(id: string, data: Partial<Service>): Promise<void> {
    await this.fb.clientUpdate(`Service/${id}`, data);
  }

  async deleteService(id: string): Promise<void> {
    await this.fb.clientRemove(`Service/${id}`);
  }

  // ── HELPERS ───────────────────────────────────────────────────────────────

  /** Retourne les employés d'un service donné */
  getEmployesByService(serviceMatricule: string): Observable<Employe[]> {
    return this.employes$.pipe(
      map((employes) => employes.filter((e) => e.service === serviceMatricule)),
    );
  }

  /** Recherche textuelle locale (nom, prénom, matricule, poste) */
  search(employes: Employe[], term: string): Employe[] {
    if (!term.trim()) return employes;
    const q = term.toLowerCase();
    return employes.filter(
      (e) =>
        e.nom?.toLowerCase().includes(q) ||
        e.prenom?.toLowerCase().includes(q) ||
        e.matricule?.toLowerCase().includes(q) ||
        e.poste?.toLowerCase().includes(q),
    );
  }
}
