// shell/shell.ts
import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  HostListener,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd, RouterOutlet } from '@angular/router';
import { Subject, filter, takeUntil } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { ToastComponent } from '../../features/shared/toast/toast.component';
import { ConfirmDialogComponent } from '../../features/shared/confirm-dialog/confirm-dialog.component';
import { TopbarComponent } from '../topbar/topbar';
import { SidebarComponent } from '../sidebar/sidebar';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    CommonModule,
    ToastComponent,
    ConfirmDialogComponent,
    TopbarComponent,
    SidebarComponent,
    RouterOutlet,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class ShellComponent implements OnInit, OnDestroy {
  private auth = inject(AuthService);
  private router = inject(Router);
  private destroy$ = new Subject<void>();

  sidebarOpen = signal(false); // Pour mobile
  sidebarCollapsed = signal(false); // Pour desktop (réduite)
  currentRoute = signal('');
  user = signal<any>(null);
  screenWidth = signal(window.innerWidth);

  isMobile = computed(() => this.screenWidth() < 1024);

  ngOnInit(): void {
    this.auth.user$.pipe(takeUntil(this.destroy$)).subscribe((u) => this.user.set(u));

    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntil(this.destroy$),
      )
      .subscribe((e: any) => {
        this.currentRoute.set(e.urlAfterRedirects);
        // Sur mobile, fermer la sidebar après navigation
        if (this.isMobile()) {
          this.sidebarOpen.set(false);
        }
      });

    this.currentRoute.set(this.router.url);

    // Initialiser l'état de la sidebar
    this.initSidebarState();
  }

  private initSidebarState(): void {
    const width = window.innerWidth;
    if (width < 1024) {
      this.sidebarOpen.set(false);
      this.sidebarCollapsed.set(false);
    } else {
      this.sidebarOpen.set(true);
      // Option: restaurer l'état depuis localStorage
      const savedState = localStorage.getItem('sidebarCollapsed');
      if (savedState !== null) {
        this.sidebarCollapsed.set(savedState === 'true');
      } else {
        this.sidebarCollapsed.set(false);
      }
    }
  }

  @HostListener('window:resize')
  onResize(): void {
    const width = window.innerWidth;
    this.screenWidth.set(width);

    if (width < 1024) {
      // Passage en mobile
      this.sidebarOpen.set(false);
    } else {
      // Passage en desktop
      this.sidebarOpen.set(true);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  toggleSidebar(): void {
    if (this.isMobile()) {
      // Sur mobile : ouvrir/fermer le tiroir
      this.sidebarOpen.update(v => !v);
    } else {
      // Sur desktop : réduire/agrandir la sidebar
      this.sidebarCollapsed.update(v => {
        const newState = !v;
        localStorage.setItem('sidebarCollapsed', String(newState));
        return newState;
      });
    }
  }

  onSidebarCollapsedChange(collapsed: boolean): void {
    this.sidebarCollapsed.set(collapsed);
    localStorage.setItem('sidebarCollapsed', String(collapsed));
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    // Fermer la sidebar mobile si on clique en dehors
    if (
      this.isMobile() &&
      this.sidebarOpen() &&
      !target.closest('.sidebar-toggle') &&
      !target.closest('.sidebar')
    ) {
      this.sidebarOpen.set(false);
    }
  }
}
