import { Component, Input, Output, EventEmitter, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import * as bcrypt from 'bcryptjs';
import { Employe, Service } from '../../core/models/employe.model';

@Component({
  selector: 'app-employe-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './employe-form.html',
  styleUrls: ['./employe-form.scss'],
})
export class EmployeFormComponent implements OnInit {
  @Input() employe: Employe | null = null;
  @Input() services: Service[] = [];
  @Input() loading = false;
  @Output() saved = new EventEmitter<Partial<Employe>>();
  @Output() cancelled = new EventEmitter<void>();

  private fb = inject(FormBuilder);

  hashing = false;

  form = this.fb.group({
    nom:          ['', Validators.required],
    prenom:       ['', Validators.required],
    matricule:    ['', Validators.required],
    email:        [''],
    telephone:    [''],
    poste:        [''],
    service:      [''],
    typeContrat:  ['CDI'],
    dateEmbauche: [''],
    statut:       ['actif'],
    login:        [''],
    password:     [''],   // champ MDP en clair — hashé avant envoi
  });

  ngOnInit(): void {
    if (this.employe) {
      this.form.patchValue({
        nom:          this.employe.nom || '',
        prenom:       this.employe.prenom || '',
        matricule:    this.employe.matricule || '',
        email:        this.employe.email || '',
        telephone:    this.employe.telephone || '',
        poste:        this.employe.poste || '',
        service:      this.employe.service || '',
        typeContrat:  this.employe.typeContrat || 'CDI',
        dateEmbauche: this.employe.dateEmbauche || '',
        statut:       this.employe.statut || 'actif',
        login:        this.employe.login || '',
        // password volontairement laissé vide en édition
      });
    }
  }

  async submit(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }

    const val = { ...this.form.value } as any;
    const rawPassword: string = val.password || '';

    // ── Hash bcrypt si un mot de passe est fourni ─────────────────────────
    if (rawPassword) {
      this.hashing = true;
      try {
        // Stocker sous "mdp" pour rester cohérent avec la convention existante
        val.mdp = await bcrypt.hash(rawPassword, 13);
      } finally {
        this.hashing = false;
      }
    }
    // Supprimer le champ password en clair — ne jamais l'envoyer à Firebase
    delete val.password;

    this.saved.emit(val as Partial<Employe>);
  }

  cancel(): void { this.cancelled.emit(); }

  get f() { return this.form.controls; }
}
