// ─── REGISTER PENDING ─────────────────────────────────────────────────────────
// Affiché après inscription quand le compte est en statut "pending".
// L'utilisateur voit l'état de sa demande et peut se déconnecter.

import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Subscription, interval } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-register-pending',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './register-pending.html',
  styleUrls: ['./register-pending.scss'],
})
export class RegisterPendingComponent implements OnInit, OnDestroy {
  private auth = inject(AuthService);
  private pollSub?: Subscription;

  get email(): string {
    return (this.auth.currentUser as any)?.email ?? '';
  }

  get firstName(): string {
    return (this.auth.currentUser as any)?.firstName ?? '';
  }

  ngOnInit(): void {
    // Vérifier toutes les 30s si le compte a été approuvé
    this.pollSub = interval(30_000).subscribe(() => this.checkStatus());
  }

  ngOnDestroy(): void {
    this.pollSub?.unsubscribe();
  }

  private async checkStatus(): Promise<void> {
    const uid = (this.auth.currentUser as any)?.uid;
    if (!uid) return;
    // Si le statut a changé (approbation/rejet) le AuthService mettra à jour
    // via onAuthStateChanged → redirection automatique gérée par les guards
  }

  async logout(): Promise<void> {
    await this.auth.logout();
  }
}
