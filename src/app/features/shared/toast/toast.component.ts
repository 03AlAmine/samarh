// ─── TOAST COMPONENT ─────────────────────────────────────────────────────────
// Composant global placé dans le shell — affiche les toasts en bas à droite.

import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService, Toast } from '../../../core/services/toast.service';
import { trigger, transition, style, animate } from '@angular/animations';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-container">
      @for (toast of toastService.toasts(); track toast.id) {
        <div class="toast toast--{{ toast.type }}" role="alert" [@slideIn]>
          <div class="toast-icon">
            @switch (toast.type) {
              @case ('success') {
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" />
                  <path
                    d="M8 12l3 3 5-5"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              }
              @case ('error') {
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" />
                  <path
                    d="M15 9l-6 6M9 9l6 6"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                  />
                </svg>
              }
              @case ('warning') {
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linejoin="round"
                  />
                  <path
                    d="M12 9v4M12 17h.01"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                  />
                </svg>
              }
              @case ('info') {
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" />
                  <path
                    d="M12 8v4M12 16h.01"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                  />
                </svg>
              }
            }
          </div>

          <span class="toast-message">{{ toast.message }}</span>

          <button class="toast-close" (click)="toastService.dismiss(toast.id)" aria-label="Fermer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path
                d="M18 6 6 18M6 6l12 12"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              />
            </svg>
          </button>

          <!-- Barre de progression -->
          <div class="toast-progress" [style.animation-duration]="toast.duration + 'ms'"></div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .toast-container {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 1000;
        display: flex;
        flex-direction: column;
        gap: 10px;
        max-width: 360px;
        width: calc(100vw - 48px);
        pointer-events: none;
      }

      .toast {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 13px 14px 13px 14px;
        border-radius: 10px;
        border: 1px solid;
        background: #fff;
        box-shadow:
          0 4px 16px rgba(0, 0, 0, 0.12),
          0 1px 4px rgba(0, 0, 0, 0.06);
        pointer-events: all;
        position: relative;
        overflow: hidden;
        font-family: 'DM Sans', system-ui, sans-serif;
      }

      .toast--success {
        border-color: #bbf7d0;
        .toast-icon {
          color: #16a34a;
        }
      }
      .toast--error {
        border-color: #fecaca;
        .toast-icon {
          color: #dc2626;
        }
      }
      .toast--warning {
        border-color: #fde68a;
        .toast-icon {
          color: #d97706;
        }
      }
      .toast--info {
        border-color: #bfdbfe;
        .toast-icon {
          color: #4f7df3;
        }
      }

      .toast-icon {
        flex-shrink: 0;
        display: flex;
        align-items: center;
      }

      .toast-message {
        flex: 1;
        font-size: 13.5px;
        font-weight: 500;
        color: #111827;
        line-height: 1.4;
      }

      .toast-close {
        flex-shrink: 0;
        width: 24px;
        height: 24px;
        border: none;
        background: transparent;
        cursor: pointer;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #9ca3af;
        transition:
          background 0.15s,
          color 0.15s;
        padding: 0;

        &:hover {
          background: #f5f6fa;
          color: #374151;
        }
      }

      /* Barre de progression */
      .toast-progress {
        position: absolute;
        bottom: 0;
        left: 0;
        height: 3px;
        width: 100%;
        animation: shrink linear forwards;
      }

      .toast--success .toast-progress {
        background: #16a34a;
      }
      .toast--error .toast-progress {
        background: #dc2626;
      }
      .toast--warning .toast-progress {
        background: #d97706;
      }
      .toast--info .toast-progress {
        background: #4f7df3;
      }

      @keyframes shrink {
        from {
          width: 100%;
        }
        to {
          width: 0%;
        }
      }

      @media (max-width: 480px) {
        .toast-container {
          bottom: 16px;
          right: 16px;
          left: 16px;
          width: auto;
        }
      }
    `,
  ],
  animations: [
    trigger('slideIn', [
      transition(':enter', [
        style({ transform: 'translateX(110%)', opacity: 0 }),
        animate(
          '220ms cubic-bezier(0.4, 0, 0.2, 1)',
          style({ transform: 'translateX(0)', opacity: 1 }),
        ),
      ]),
      transition(':leave', [
        animate(
          '180ms cubic-bezier(0.4, 0, 0.2, 1)',
          style({ transform: 'translateX(110%)', opacity: 0 }),
        ),
      ]),
    ]),
  ],
})
export class ToastComponent {
  toastService = inject(ToastService);
}
