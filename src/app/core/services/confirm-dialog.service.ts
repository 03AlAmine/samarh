import { Injectable, signal } from '@angular/core';

export interface ConfirmOptions {
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  type?: 'danger' | 'warning' | 'info';
}

@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  options  = signal<ConfirmOptions | null>(null);
  private resolver: ((v: boolean) => void) | null = null;

  ask(message: string, confirmLabel = 'Confirmer', type: 'danger' | 'warning' | 'info' = 'danger', title?: string): Promise<boolean> {
    this.options.set({ message, title, confirmLabel, type });
    return new Promise(resolve => { this.resolver = resolve; });
  }

  confirm(): void { this.resolve(true);  }
  cancel():  void { this.resolve(false); }

  private resolve(v: boolean): void {
    this.options.set(null);
    this.resolver?.(v);
    this.resolver = null;
  }
}
