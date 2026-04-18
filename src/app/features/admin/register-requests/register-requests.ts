// ─── ADMIN DEMANDES D'INSCRIPTION ────────────────────────────────────────────

import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FirebaseService } from '../../../core/services/firebase.service';
import { ToastService } from '../../../core/services/toast.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-register-requests',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './register-requests.html',
  styleUrls: ['./register-requests.scss'],
})
export class RegisterRequestsComponent implements OnInit {
  private fb = inject(FirebaseService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);

  loading = signal(true);
  pending = signal<any[]>([]);
  selected = signal<any | null>(null);
  processing = signal(false);
  rejectReason = signal('');

  ngOnInit(): void {
    this.load();
  }

  private async load(): Promise<void> {
    try {
      const data = await this.fb.adminGet<Record<string, any>>('pending_users');
      if (data) {
        const list = Object.values(data).filter(u => u.status === 'pending');
        this.pending.set(list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
      }
    } finally {
      this.loading.set(false);
    }
  }

  select(u: any): void {
    this.selected.set(u);
    this.rejectReason.set('');
  }

  closeModal(): void {
    this.selected.set(null);
  }

  async approve(): Promise<void> {
    const u = this.selected();
    if (!u) return;
    this.processing.set(true);
    try {
      await this.auth.approveUser(u.uid, this.auth.currentUser!.uid);
      this.pending.update(list => list.filter(x => x.uid !== u.uid));
      this.toast.success(`Compte de ${u.firstName} ${u.lastName} approuvé`);
      this.closeModal();
    } catch (e: any) {
      this.toast.error(e.message || 'Erreur lors de l\'approbation.');
    } finally {
      this.processing.set(false);
    }
  }

  async reject(): Promise<void> {
    const u = this.selected();
    const reason = this.rejectReason().trim();
    if (!u || !reason) return;
    this.processing.set(true);
    try {
      await this.auth.rejectUser(u.uid, this.auth.currentUser!.uid, reason);
      this.pending.update(list => list.filter(x => x.uid !== u.uid));
      this.toast.warning(`Demande de ${u.firstName} ${u.lastName} rejetée`);
      this.closeModal();
    } catch (e: any) {
      this.toast.error(e.message || 'Erreur lors du rejet.');
    } finally {
      this.processing.set(false);
    }
  }

  typeLabel(t: string): string {
    return { individual: 'Particulier', company: 'Entreprise', employee: 'Employé' }[t] || t;
  }

  initials(u: any): string {
    return `${(u.firstName || '?')[0]}${(u.lastName || '')[0] || ''}`.toUpperCase();
  }
}
