// ─── ADMIN COMMUNAUTÉS ───────────────────────────────────────────────────────

import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FirebaseService } from '../../../core/services/firebase.service';
import { Communaute } from '../../../core/models/user.model';

@Component({
  selector: 'app-communautes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './communautes.html',
  styleUrls: ['./communautes.scss'],
})
export class CommunautesComponent implements OnInit {
  private fb = inject(FirebaseService);

  loading = signal(true);
  communautes = signal<Communaute[]>([]);
  searchTerm = signal('');

  filtered() {
    const q = this.searchTerm().toLowerCase();
    return this.communautes().filter(
      c => !q || c.nom?.toLowerCase().includes(q) || c.id?.toLowerCase().includes(q),
    );
  }

  ngOnInit(): void {
    this.load();
  }

  private async load(): Promise<void> {
    try {
      const data = await this.fb.adminGet<Record<string, Communaute>>('communautes');
      if (data) {
        this.communautes.set(
          Object.entries(data).map(([id, c]) => ({ ...c, id })),
        );
      }
    } finally {
      this.loading.set(false);
    }
  }

  async toggleStatus(c: Communaute): Promise<void> {
    const newStatus = c.status === 'active' ? 'suspended' : 'active';
    await this.fb.adminUpdate(`communautes/${c.id}`, { status: newStatus });
    this.communautes.update(list =>
      list.map(x => x.id === c.id ? { ...x, status: newStatus } : x)
    );
  }

  membres(c: Communaute): number {
    return Array.isArray(c.membres) ? c.membres.length : 0;
  }
}
