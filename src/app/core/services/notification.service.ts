// ─── NOTIFICATION SERVICE ─────────────────────────────────────────────────────
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map, shareReplay, filter, take, switchMap } from 'rxjs/operators';
import { FirebaseService } from './firebase.service';

export type NotifType =
  | 'retard' | 'absence' | 'validation'
  | 'approval' | 'rejection' | 'system';

export interface AppNotification {
  id:         string;
  type:       NotifType;
  title:      string;
  message:    string;
  read:       boolean;
  createdAt:  string;
  actionUrl?: string;
  data?:      any;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private fb = inject(FirebaseService);

  // ── Streams temps réel ────────────────────────────────────────────────────
  // IMPORTANT : attendre clientReady$ avant de s'abonner à Firebase
  // (même pattern que employe.service et pointage.service)

  notifications$: Observable<AppNotification[]> = this.fb.clientReady$.pipe(
    filter(ready => ready),
    take(1),
    switchMap(() => this.fb.clientListenList<AppNotification>('Notification')),
    map((list: AppNotification[]) =>
      list
        .filter(n => n && n.createdAt) // ignorer les entrées malformées
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 50)
    ),
    shareReplay(1),
  );

  unreadCount$: Observable<number> = this.notifications$.pipe(
    map(list => list.filter(n => !n.read).length),
    shareReplay(1),
  );

  // ── Écriture ──────────────────────────────────────────────────────────────

  async send(notif: Omit<AppNotification, 'id' | 'read' | 'createdAt'>): Promise<void> {
    await this.fb.clientPush('Notification', {
      ...notif,
      read:      false,
      createdAt: new Date().toISOString(),
    });
  }

  /** Alias pour error.interceptor.ts */
  async sendNotification(params: {
    userId?:   string;
    title:     string;
    message:   string;
    type?:     string;
    priority?: string;
  }): Promise<void> {
    await this.send({
      type:    (params.type as NotifType) || 'system',
      title:   params.title,
      message: params.message,
    });
  }

  async markRead(id: string): Promise<void> {
    await this.fb.clientUpdate(`Notification/${id}`, { read: true });
  }

  async markAllRead(notifications: AppNotification[]): Promise<void> {
    const updates: Record<string, any> = {};
    notifications.filter(n => !n.read).forEach(n => {
      updates[`Notification/${n.id}/read`] = true;
    });
    if (Object.keys(updates).length > 0) {
      await this.fb.clientUpdate('', updates);
    }
  }

  async delete(id: string): Promise<void> {
    await this.fb.clientRemove(`Notification/${id}`);
  }

  // ── Helpers RH ────────────────────────────────────────────────────────────

  async notifyRetard(nomEmploye: string, minutesRetard: number, employeId: string): Promise<void> {
    await this.send({
      type:      'retard',
      title:     'Retard signalé',
      message:   `${nomEmploye} est arrivé avec ${minutesRetard} min de retard.`,
      actionUrl: `/employes/${employeId}`,
    });
  }

  async notifyAbsence(nomEmploye: string, date: string, employeId: string): Promise<void> {
    await this.send({
      type:      'absence',
      title:     'Absence non justifiée',
      message:   `${nomEmploye} est absent le ${date} sans justification.`,
      actionUrl: `/employes/${employeId}`,
    });
  }

  timeAgo(dateStr: string): string {
    // Garde-fou : dateStr invalide ou undefined
    if (!dateStr) return '';
    const ts = new Date(dateStr).getTime();
    if (isNaN(ts)) return '';

    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    if (m < 1)  return 'À l\'instant';
    if (m < 60) return `Il y a ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `Il y a ${h}h`;
    const d = Math.floor(h / 24);
    if (d < 30) return `Il y a ${d}j`;
    return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }

  colorFor(type: NotifType): string {
    const colors: Record<NotifType, string> = {
      retard:     '#f59e0b',
      absence:    '#ef4444',
      validation: '#10b981',
      approval:   '#4f7df3',
      rejection:  '#ef4444',
      system:     '#6b7280',
    };
    return colors[type] || '#6b7280';
  }

  iconFor(type: NotifType): string {
    const icons: Record<NotifType, string> = {
      retard:     'clock',
      absence:    'user-x',
      validation: 'check-circle',
      approval:   'shield-check',
      rejection:  'x-circle',
      system:     'bell',
    };
    return icons[type] || 'bell';
  }
}
