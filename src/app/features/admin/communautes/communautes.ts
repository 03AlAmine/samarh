import {
  Component, inject, signal, OnInit,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FirebaseService } from '../../../core/services/firebase.service';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmDialogService } from '../../../core/services/confirm-dialog.service';
import { Communaute } from '../../../core/models/user.model';

@Component({
  selector: 'app-communautes',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './communautes.html',
  styleUrls: ['./communautes.scss'],
})
export class CommunautesComponent implements OnInit {
  private fb      = inject(FirebaseService);
  private toast   = inject(ToastService);
  private confirm = inject(ConfirmDialogService);

  loading    = signal(true);
  communautes = signal<Communaute[]>([]);
  searchTerm = signal('');
  selected   = signal<Communaute | null>(null);

  filtered() {
    const q = this.searchTerm().toLowerCase();
    return this.communautes().filter(
      c => !q || c.nom?.toLowerCase().includes(q) || c.id?.toLowerCase().includes(q),
    );
  }

  ngOnInit(): void { this.load(); }

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

  openDetail(c: Communaute): void { this.selected.set(c); }
  closeDetail(): void { this.selected.set(null); }

  async toggleStatus(c: Communaute, event?: Event): Promise<void> {
    event?.stopPropagation();
    const newStatus = c.status === 'active' ? 'suspended' : 'active';
    const label = newStatus === 'suspended' ? 'Suspendre' : 'Réactiver';
    const ok = await this.confirm.ask(
      `${label} la communauté "${c.nom}" ?`, label, 'warning'
    );
    if (!ok) return;
    await this.fb.adminUpdate(`communautes/${c.id}`, { status: newStatus });
    this.communautes.update(list =>
      list.map(x => x.id === c.id ? { ...x, status: newStatus } : x)
    );
    if (this.selected()?.id === c.id) {
      this.selected.update(x => x ? { ...x, status: newStatus } : x);
    }
    this.toast.success(`Communauté ${newStatus === 'active' ? 'réactivée' : 'suspendue'}`);
  }

  membres(c: Communaute): number {
    return Array.isArray(c.membres) ? c.membres.length : 0;
  }

  hasConfig(c: Communaute): boolean {
    return !!(c as any).firebaseConfig?.databaseURL;
  }

  configKeys(c: Communaute): string[] {
    const cfg = (c as any).firebaseConfig;
    if (!cfg) return [];
    return ['apiKey','databaseURL','projectId','messagingSenderId','appId']
      .filter(k => cfg[k]);
  }

  maskKey(value: string): string {
    if (!value || value.length < 12) return '••••••••';
    return value.slice(0, 8) + '••••' + value.slice(-4);
  }
}
