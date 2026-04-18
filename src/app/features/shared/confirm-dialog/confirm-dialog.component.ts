import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConfirmDialogService } from '../../../core/services/confirm-dialog.service';
import { trigger, transition, style, animate } from '@angular/animations';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule],
  animations: [
    trigger('backdrop', [
      transition(':enter', [style({opacity:0}), animate('150ms', style({opacity:1}))]),
      transition(':leave', [animate('150ms', style({opacity:0}))]),
    ]),
    trigger('box', [
      transition(':enter', [
        style({opacity:0, transform:'scale(0.95) translateY(-8px)'}),
        animate('180ms cubic-bezier(0.4,0,0.2,1)', style({opacity:1, transform:'scale(1) translateY(0)'})),
      ]),
    ]),
  ],
  template: `
    @if (svc.options(); as opts) {
      <div class="cd-backdrop" @backdrop (click)="svc.cancel()">
        <div class="cd-box" @box (click)="$event.stopPropagation()">
          <div class="cd-icon cd-icon--{{ opts.type || 'danger' }}">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/>
              <path d="M12 8v4M12 16h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
          </div>
          @if (opts.title) { <h3 class="cd-title">{{ opts.title }}</h3> }
          <p class="cd-message">{{ opts.message }}</p>
          <div class="cd-actions">
            <button class="cd-btn cd-btn--cancel" (click)="svc.cancel()">
              {{ opts.cancelLabel || 'Annuler' }}
            </button>
            <button class="cd-btn cd-btn--{{ opts.type || 'danger' }}" (click)="svc.confirm()">
              {{ opts.confirmLabel || 'Confirmer' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .cd-backdrop { position:fixed;inset:0;background:rgba(0,0,0,0.4);backdrop-filter:blur(2px);z-index:500;display:flex;align-items:center;justify-content:center;padding:20px; }
    .cd-box { background:var(--surface);border-radius:16px;padding:28px 28px 24px;max-width:380px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.2);text-align:center; }
    .cd-icon { width:56px;height:56px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px; }
    .cd-icon--danger  { background:var(--danger-light);  color:var(--danger); }
    .cd-icon--warning { background:var(--warning-light); color:var(--warning); }
    .cd-icon--info    { background:var(--accent-light);  color:var(--accent); }
    .cd-title  { font-size:16px;font-weight:700;color:var(--text-primary);margin:0 0 8px; }
    .cd-message{ font-size:14px;color:var(--text-secondary);line-height:1.6;margin:0 0 24px; }
    .cd-actions{ display:flex;gap:10px;justify-content:center; }
    .cd-btn { flex:1;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:600;font-family:inherit;border:none;cursor:pointer;transition:background 0.15s; }
    .cd-btn--cancel  { background:var(--surface);color:var(--text-primary);border:1.5px solid var(--border); }
    .cd-btn--cancel:hover { background:var(--bg); }
    .cd-btn--danger  { background:var(--danger);  color:#fff; }
    .cd-btn--danger:hover  { background:#b91c1c; }
    .cd-btn--warning { background:var(--warning); color:#fff; }
    .cd-btn--info    { background:var(--accent);  color:#fff; }
  `],
})
export class ConfirmDialogComponent {
  svc = inject(ConfirmDialogService);
}
