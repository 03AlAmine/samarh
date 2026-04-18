// ─── ADMIN UTILISATEURS ──────────────────────────────────────────────────────

import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FirebaseService } from '../../../core/services/firebase.service';

@Component({
  selector: 'app-utilisateurs',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">Utilisateurs</h1>
        <p class="page-subtitle">{{ filtered().length }} utilisateur{{ filtered().length > 1 ? 's' : '' }}</p>
      </div>
    </div>

    <div class="card" style="padding:12px 16px;margin-bottom:20px">
      <div class="search-row">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="1.7"/><path d="m21 21-4.35-4.35" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
        <input class="search-input" type="text" placeholder="Rechercher par nom ou email…"
          [value]="searchTerm()" (input)="searchTerm.set($any($event.target).value)"/>
        <select style="border:none;outline:none;font-size:13px;font-family:inherit;color:var(--text-secondary);background:transparent"
          [value]="filterType()" (change)="filterType.set($any($event.target).value)">
          <option value="">Tous types</option>
          <option value="individual">Particulier</option>
          <option value="company">Entreprise</option>
          <option value="employee">Employé</option>
        </select>
      </div>
    </div>

    @if (loading()) {
      <div style="display:flex;justify-content:center;padding:48px"><div class="spinner"></div></div>
    }

    @if (!loading()) {
      <div class="card table-wrapper">
        @if (filtered().length === 0) {
          <div class="empty-state"><p>Aucun utilisateur</p></div>
        }
        @if (filtered().length > 0) {
          <table class="data-table">
            <thead>
              <tr><th>Utilisateur</th><th>Email</th><th>Type</th><th>Statut</th><th>Inscription</th><th></th></tr>
            </thead>
            <tbody>
              @for (u of filtered(); track u.uid) {
                <tr>
                  <td>
                    <div style="display:flex;align-items:center;gap:10px">
                      <div class="mini-avatar">{{ (u.firstName||'?')[0] }}{{ (u.lastName||'')[0] }}</div>
                      <span style="font-weight:600;font-size:13.5px">{{ u.firstName }} {{ u.lastName }}</span>
                    </div>
                  </td>
                  <td style="color:var(--text-secondary);font-size:13px">{{ u.email }}</td>
                  <td>
                    <span class="badge badge--accent">{{ typeLabel(u.userType) }}</span>
                  </td>
                  <td>
                    <span class="badge badge--{{ statusClass(u.status) }}">{{ statusLabel(u.status) }}</span>
                  </td>
                  <td style="color:var(--text-secondary);font-size:13px">{{ u.createdAt | date:'dd/MM/yyyy' }}</td>
                  <td>
                    @if (u.status === 'active') {
                      <button class="btn-action warn" (click)="toggleStatus(u)">Suspendre</button>
                    } @else if (u.status === 'suspended') {
                      <button class="btn-action" (click)="toggleStatus(u)">Réactiver</button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
    }
  `,
  styles: [`
    .search-row { display:flex; align-items:center; gap:10px; color:var(--text-secondary); }
    .search-input { flex:1; border:none; outline:none; font-size:13.5px; font-family:inherit; color:var(--text-primary); background:transparent; }
    .mini-avatar { width:30px; height:30px; border-radius:8px; background:linear-gradient(135deg,#4f7df3,#7c3aed); color:#fff; font-size:11px; font-weight:700; display:flex; align-items:center; justify-content:center; flex-shrink:0; text-transform:uppercase; }
    .btn-action { border:1.5px solid var(--border); background:transparent; padding:5px 12px; border-radius:6px; font-size:12.5px; font-weight:600; cursor:pointer; color:var(--text-primary); transition:background 0.15s; font-family:inherit; &:hover { background:var(--bg); } &.warn { border-color:#fecaca; color:var(--danger); &:hover { background:var(--danger-light); } } }
  `],
})
export class UtilisateursComponent implements OnInit {
  private fb = inject(FirebaseService);

  loading = signal(true);
  users = signal<any[]>([]);
  searchTerm = signal('');
  filterType = signal('');

  filtered() {
    const q = this.searchTerm().toLowerCase();
    const t = this.filterType();
    return this.users().filter(u => {
      const matchQ = !q || u.firstName?.toLowerCase().includes(q) ||
        u.lastName?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
      const matchT = !t || u.userType === t;
      return matchQ && matchT;
    });
  }

  ngOnInit(): void {
    this.load();
  }

  private async load(): Promise<void> {
    try {
      const data = await this.fb.adminGet<Record<string, any>>('users');
      if (data) this.users.set(Object.values(data));
    } finally {
      this.loading.set(false);
    }
  }

  async toggleStatus(u: any): Promise<void> {
    const newStatus = u.status === 'active' ? 'suspended' : 'active';
    await this.fb.adminUpdate(`users/${u.uid}`, { status: newStatus });
    this.users.update(list => list.map(x => x.uid === u.uid ? { ...x, status: newStatus } : x));
  }

  typeLabel(t: string): string {
    return { individual: 'Particulier', company: 'Entreprise', employee: 'Employé' }[t] || t;
  }
  statusLabel(s: string): string {
    return { active: 'Actif', pending: 'En attente', suspended: 'Suspendu', rejected: 'Rejeté' }[s] || s;
  }
  statusClass(s: string): string {
    return { active: 'success', pending: 'warning', suspended: 'neutral', rejected: 'danger' }[s] || 'neutral';
  }
}
