// employe-form.ts - version corrigée
import {
  Component, Input, Output, EventEmitter,
  OnInit, inject, ChangeDetectionStrategy, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import * as bcrypt from 'bcryptjs';
import { Employe, Service } from '../../../core/models/employe.model';

type Tab = 'infos' | 'acces';

@Component({
  selector: 'app-employe-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './employe-form.html',
  styleUrls: ['./employe-form.scss'],
})
export class EmployeFormComponent implements OnInit {
  @Input() employe:  Employe | null = null;
  @Input() services: Service[] = [];
  @Input() loading   = false;
  @Output() saved     = new EventEmitter<Partial<Employe>>();
  @Output() cancelled = new EventEmitter<void>();

  private fb = inject(FormBuilder);

  activeTab  = signal<Tab>('infos');
  hashing    = false;

  // ── Services sélectionnés pour les permissions ────────────────────────────
  selectedServices = signal<Set<string>>(new Set());
  role             = signal<'Employé' | 'Chargé de compte' | 'Admin communauté'>('Employé');

  form = this.fb.group({
    nom:          ['', Validators.required],
    prenom:       ['', Validators.required],
    matricule:    ['', Validators.required],
    email:        [''],
    telephone:    [''],
    poste:        [''],
    service:      [''],  // service d'affectation (1 seul)
    typeContrat:  ['CDI'],
    dateEmbauche: [''],
    statut:       ['actif'],
    login:        [''],
    password:     [''],
  });

  ngOnInit(): void {

    if (this.employe) {
      this.form.patchValue({
        nom:          this.employe.nom          || '',
        prenom:       this.employe.prenom       || '',
        matricule:    this.employe.matricule    || '',
        email:        this.employe.email        || '',
        telephone:    this.employe.telephone    || '',
        poste:        this.employe.poste        || '',
        service:      this.employe.service      || '',
        typeContrat:  this.employe.typeContrat  || 'CDI',
        dateEmbauche: this.employe.dateEmbauche || '',
        statut:       this.employe.statut       || 'actif',
        login:        this.employe.login        || '',
      });

      // ── Charger les permissions existantes ────────────────────────────────
      const emp = this.employe as any;


      // services[] = liste des matricules de services gérés
      if (emp.services === 'Tous' || emp.role === 'Administrateur') {
        this.role.set('Admin communauté');
        this.selectedServices.set(new Set());
      } else if (Array.isArray(emp.services) && emp.services.length > 0) {
        this.role.set('Chargé de compte');
        this.selectedServices.set(new Set(emp.services));
      } else {
        this.role.set('Employé');
        this.selectedServices.set(new Set());
      }
    }
  }

  // ── Onglets ───────────────────────────────────────────────────────────────
  setTab(t: Tab): void {
    this.activeTab.set(t);
  }

  // ── Gestion sélection services ────────────────────────────────────────────
  toggleService(matricule: string): void {
    this.selectedServices.update(set => {
      const n = new Set(set);
      n.has(matricule) ? n.delete(matricule) : n.add(matricule);
      return n;
    });
  }

  isServiceSelected(matricule: string): boolean {
    return this.selectedServices().has(matricule);
  }

  setRole(r: 'Employé' | 'Chargé de compte' | 'Admin communauté'): void {
    this.role.set(r);
    if (r === 'Employé') {
      this.selectedServices.set(new Set());
    }
  }

  get roleDescription(): string {
    switch (this.role()) {
      case 'Admin communauté':
        return 'Accès complet : peut voir et gérer tous les services, employés, pointages.';
      case 'Chargé de compte':
        return 'Accès limité aux services sélectionnés : peut ajouter/modifier les employés de ces services.';
      default:
        return 'Accès lecture seule à son propre profil et ses pointages.';
    }
  }

  // ── Soumission corrigée avec plus de logs ─────────────────────────────────
  async submit(): Promise<void> {

    // Vérifier les champs invalides
    if (this.form.invalid) {
      Object.keys(this.form.controls).forEach(key => {
        const control = this.form.get(key);
        if (control?.invalid) {
          control.markAsTouched();
        }
      });
      return;
    }

    const val = { ...this.form.value } as any;
    const rawPassword: string = val.password || '';


    if (rawPassword) {
      this.hashing = true;
      try {
        val.mdp = await bcrypt.hash(rawPassword, 13);
      } catch (error) {
        console.error('❌ Erreur lors du hash du mot de passe:', error);
      } finally {
        this.hashing = false;
      }
    }
    delete val.password;

    // ── Ajouter les champs de permission ────────────────────────────────────
    const roleVal = this.role();

    if (roleVal === 'Admin communauté') {
      val.services         = 'Tous';
      val.role             = 'Administrateur';
      val.estChargeCompte  = false;
    } else if (roleVal === 'Chargé de compte') {
      val.services         = Array.from(this.selectedServices());
      val.role             = 'Chargé de compte';
      val.estChargeCompte  = true;
      val.dateNominationChargedCompte = new Date().toISOString();
    } else {
      val.services        = [];
      val.role            = 'Employé';
      val.estChargeCompte = false;
    }

    this.saved.emit(val as Partial<Employe>);
  }

  cancel(): void {
    this.cancelled.emit();
  }

  get f() {
    return this.form.controls;
  }
}
