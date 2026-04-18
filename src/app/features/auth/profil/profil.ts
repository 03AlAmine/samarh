import {
  Component, inject, signal, computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { FirebaseService } from '../../../core/services/firebase.service';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmDialogService } from '../../../core/services/confirm-dialog.service';
import {
  Auth, updatePassword, updateEmail,
  reauthenticateWithCredential, EmailAuthProvider,
} from '@angular/fire/auth';

type Tab = 'infos' | 'securite';

@Component({
  selector: 'app-profil',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './profil.html',
  styleUrls: ['./profil.scss'],
})
export class ProfilComponent {
  private auth    = inject(AuthService);
  private fb      = inject(FirebaseService);
  private toast   = inject(ToastService);
  private confirm = inject(ConfirmDialogService);
  private router  = inject(Router);
  private fireAuth = inject(Auth);
  private formBuilder = inject(FormBuilder);

  activeTab = signal<Tab>('infos');
  savingInfos = signal(false);
  savingPassword = signal(false);
  showCurrentPwd = signal(false);
  showNewPwd = signal(false);

  get user() { return this.auth.currentUser as any; }
  get isFirebaseUser() { return !this.user?.isCommunauteUser; }
  get isAdmin() { return this.auth.isAdmin; }
  get isCommunauteUser() { return !!this.user?.isCommunauteUser; }

  initials = computed(() => {
    const u = this.user;
    if (!u) return '?';
    return `${(u.firstName || u.prenom || '?')[0]}${(u.lastName || u.nom || '')[0] || ''}`.toUpperCase();
  });

  displayName = computed(() => {
    const u = this.user;
    if (!u) return '';
    return `${u.firstName || u.prenom || ''} ${u.lastName || u.nom || ''}`.trim();
  });

  roleLabel = computed(() => {
    const u = this.user;
    if (!u) return '';
    if (u.userType === 'admin') return 'Super Admin';
    if (u.isCommunauteUser) {
      // Employé communauté admin : services="Tous" (string) ou ["Tous"] ou role="Administrateur"
      if (u.services === 'Tous' || (Array.isArray(u.services) && u.services[0] === 'Tous')) return 'Admin communauté';
      if (u.role === 'Administrateur' || u.role === 'admin') return 'Admin communauté';
      return u.poste || 'Employé';
    }
    if (u.userType === 'company') return 'Gérant';
    if (u.userType === 'individual') return 'Gérant';
    return 'Utilisateur';
  });

  communauteNom = computed(() => this.user?.communauteNom || '');
  matricule     = computed(() => this.user?.matricule || '');
  createdAt     = computed(() => {
    const d = this.user?.createdAt;
    if (!d) return '';
    return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  });

  // ── Formulaire infos ───────────────────────────────────────────────────────
  infoForm = this.formBuilder.group({
    firstName: [this.user?.firstName || this.user?.prenom || '', Validators.required],
    lastName:  [this.user?.lastName  || this.user?.nom    || '', Validators.required],
    phone:     [this.user?.phone     || this.user?.telephone || ''],
  });

  // ── Formulaire mot de passe ───────────────────────────────────────────────
  pwdForm = this.formBuilder.group({
    currentPassword: ['', Validators.required],
    newPassword:     ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', Validators.required],
  }, { validators: this.matchPasswords });

  private matchPasswords(group: AbstractControl) {
    const np = group.get('newPassword')?.value;
    const cp = group.get('confirmPassword')?.value;
    return np === cp ? null : { mismatch: true };
  }

  setTab(t: Tab) { this.activeTab.set(t); }
  toggleCurrentPwd() { this.showCurrentPwd.update(v => !v); }
  toggleNewPwd()     { this.showNewPwd.update(v => !v); }

  // ── Sauvegarder infos ─────────────────────────────────────────────────────
  async saveInfos(): Promise<void> {
    if (this.infoForm.invalid) { this.infoForm.markAllAsTouched(); return; }
    this.savingInfos.set(true);
    try {
      const { firstName, lastName, phone } = this.infoForm.value;
      const u = this.user;

      if (this.isFirebaseUser && u?.uid) {
        await this.fb.adminUpdate(`users/${u.uid}`, {
          firstName, lastName, phone,
          updatedAt: new Date().toISOString(),
        });
        // Mettre à jour le subject local
        this.auth['userSubject'].next({ ...u, firstName, lastName, phone });
      }
      // Pour les employés communauté, pas de Firebase Auth — on met à jour juste la session
      if (this.isCommunauteUser) {
        const session = JSON.parse(
          sessionStorage.getItem('communauteSession') || localStorage.getItem('communauteSession') || '{}'
        );
        const updated = { ...session, prenom: firstName, nom: lastName, telephone: phone };
        sessionStorage.setItem('communauteSession', JSON.stringify(updated));
        if (localStorage.getItem('communauteSession')) {
          localStorage.setItem('communauteSession', JSON.stringify(updated));
        }
      }
      this.toast.success('Profil mis à jour');
    } catch (e: any) {
      this.toast.error(e.message || 'Erreur lors de la mise à jour.');
    } finally {
      this.savingInfos.set(false);
    }
  }

  // ── Changer mot de passe ──────────────────────────────────────────────────
  async changePassword(): Promise<void> {
    if (this.pwdForm.invalid) { this.pwdForm.markAllAsTouched(); return; }
    this.savingPassword.set(true);
    try {
      const { currentPassword, newPassword } = this.pwdForm.value;
      const fireUser = this.fireAuth.currentUser;
      if (!fireUser?.email) throw new Error('Utilisateur non connecté.');

      // Re-authentification requise par Firebase avant changement de mot de passe
      const credential = EmailAuthProvider.credential(fireUser.email, currentPassword!);
      await reauthenticateWithCredential(fireUser, credential);
      await updatePassword(fireUser, newPassword!);

      this.pwdForm.reset();
      this.toast.success('Mot de passe modifié avec succès');
    } catch (e: any) {
      const msgs: Record<string, string> = {
        'auth/wrong-password': 'Mot de passe actuel incorrect.',
        'auth/requires-recent-login': 'Session expirée. Reconnectez-vous.',
        'auth/weak-password': 'Le nouveau mot de passe est trop faible.',
      };
      this.toast.error(msgs[e.code] || e.message || 'Erreur lors du changement.');
    } finally {
      this.savingPassword.set(false);
    }
  }

  // ── Déconnexion ───────────────────────────────────────────────────────────
  async logout(): Promise<void> {
    const ok = await this.confirm.ask(
      'Vous serez redirigé vers la page de connexion.',
      'Se déconnecter', 'warning', 'Déconnexion'
    );
    if (ok) await this.auth.logout();
  }

  get fi() { return this.infoForm.controls; }
  get fp() { return this.pwdForm.controls; }
}
