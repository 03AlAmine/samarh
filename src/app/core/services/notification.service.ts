// src/app/core/services/notification.service.ts
import { Injectable, inject, NgZone, Injector, runInInjectionContext } from '@angular/core';
import {
  Database,
  ref,
  set,
  push,
  query,
  orderByChild,
  equalTo,
  onValue,
  update,
  remove,
} from '@angular/fire/database';
import { AuthService } from './auth.service';
import { Observable } from 'rxjs';

export interface Notification {
  id?: string;
  userId: string;
  title: string;
  message: string;
  type: 'course' | 'payment' | 'system' | 'chat' | 'approval' | 'rejection';
  read: boolean;
  createdAt: string;
  actionUrl?: string;
  data?: any;
}

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private database = inject(Database);
  private authService = inject(AuthService);
  private ngZone = inject(NgZone);
  private injector = inject(Injector);

  constructor() {
  }

  /**
   * Envoie une notification
   */
  async sendNotification(notification: any): Promise<string> {
    return runInInjectionContext(this.injector, async () => {
      try {
        const notificationRef = ref(this.database, 'notifications');
        const newNotificationRef = push(notificationRef);

        const fullNotification: Notification = {
          ...notification,
          id: newNotificationRef.key!,
          read: false,
          createdAt: new Date().toISOString(),
        };

        await set(newNotificationRef, fullNotification);
        return newNotificationRef.key!;
      } catch (error) {
        console.error('Erreur envoi notification:', error);
        throw error;
      }
    });
  }

  /**
   * Récupère les notifications d'un utilisateur (Observable)
   */
  getUserNotifications(userId: string): Observable<Notification[]> {
    return new Observable((observer) => {
      runInInjectionContext(this.injector, () => {
        const notificationsRef = query(
          ref(this.database, 'notifications'),
          orderByChild('userId'),
          equalTo(userId),
        );

        const unsubscribe = onValue(
          notificationsRef,
          (snapshot) => {
            this.ngZone.run(() => {
              const notifications: Notification[] = [];
              snapshot.forEach((childSnapshot) => {
                notifications.push({
                  id: childSnapshot.key,
                  ...childSnapshot.val(),
                });
              });

              notifications.sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
              );
              observer.next(notifications);
            });
          },
          (error) => {
            this.ngZone.run(() => {
              console.error('Erreur récupération notifications:', error);
              observer.error(error);
            });
          },
        );

        return () => unsubscribe();
      });
    });
  }

  /**
   * Marque une notification comme lue
   */
  async markAsRead(notificationId: string): Promise<void> {
    return runInInjectionContext(this.injector, async () => {
      try {
        await update(ref(this.database, `notifications/${notificationId}`), {
          read: true,
        });
      } catch (error) {
        console.error('Erreur marquage notification:', error);
      }
    });
  }

  /**
   * Marque toutes les notifications d'un utilisateur comme lues
   */
  async markAllAsRead(userId: string): Promise<void> {
    return runInInjectionContext(this.injector, async () => {
      try {
        const notifications = await this.getUserNotificationsOnce(userId);
        const updates: any = {};

        notifications.forEach((notification) => {
          if (!notification.read && notification.id) {
            updates[`notifications/${notification.id}/read`] = true;
          }
        });

        if (Object.keys(updates).length > 0) {
          await update(ref(this.database), updates);
        }
      } catch (error) {
        console.error('Erreur marquage toutes notifications:', error);
      }
    });
  }

  /**
   * Supprime une notification
   */
  async deleteNotification(notificationId: string): Promise<void> {
    return runInInjectionContext(this.injector, async () => {
      try {
        await remove(ref(this.database, `notifications/${notificationId}`));
      } catch (error) {
        console.error('Erreur suppression notification:', error);
      }
    });
  }

  /**
   * Récupère le nombre de notifications non lues (Observable)
   */
  getUnreadCount(userId: string): Observable<number> {
    return new Observable((observer) => {
      runInInjectionContext(this.injector, () => {
        const notificationsRef = query(
          ref(this.database, 'notifications'),
          orderByChild('userId'),
          equalTo(userId),
        );

        const unsubscribe = onValue(
          notificationsRef,
          (snapshot) => {
            this.ngZone.run(() => {
              let unreadCount = 0;
              snapshot.forEach((childSnapshot) => {
                const notification = childSnapshot.val();
                if (!notification.read) {
                  unreadCount++;
                }
              });
              observer.next(unreadCount);
            });
          },
          (error) => {
            this.ngZone.run(() => {
              console.error('Erreur récupération compteur:', error);
              observer.error(error);
            });
          },
        );

        return () => unsubscribe();
      });
    });
  }

  /**
   * Récupère les notifications d'un utilisateur (Promise - one time)
   */
  private async getUserNotificationsOnce(userId: string): Promise<Notification[]> {
    return runInInjectionContext(this.injector, async () => {
      return new Promise((resolve) => {
        const notificationsRef = query(
          ref(this.database, 'notifications'),
          orderByChild('userId'),
          equalTo(userId),
        );

        const unsubscribe = onValue(
          notificationsRef,
          (snapshot) => {
            this.ngZone.run(() => {
              const notifications: Notification[] = [];
              snapshot.forEach((childSnapshot) => {
                notifications.push({
                  id: childSnapshot.key,
                  ...childSnapshot.val(),
                });
              });
              unsubscribe();
              resolve(notifications);
            });
          },
          (error) => {
            this.ngZone.run(() => {
              console.error('Erreur récupération notifications one-time:', error);
              unsubscribe();
              resolve([]);
            });
          },
        );
      });
    });
  }

  // ==================== NOTIFICATIONS PRÉDÉFINIES ====================

  /**
   * Notification d'inscription à un cours
   */
  async notifyCourseEnrollment(
    studentId: string,
    courseTitle: string,
    courseId: string,
  ): Promise<void> {
    await this.sendNotification({
      userId: studentId,
      title: 'Inscription confirmée',
      message: `Vous êtes maintenant inscrit au cours "${courseTitle}"`,
      type: 'course',
      actionUrl: `/courses/${courseId}`,
    });
  }

  /**
   * Notification de paiement réussi
   */
  async notifyPaymentSuccess(
    studentId: string,
    courseTitle: string,
    amount: number,
  ): Promise<void> {
    await this.sendNotification({
      userId: studentId,
      title: 'Paiement confirmé',
      message: `Votre paiement de ${amount} XOF pour "${courseTitle}" a été accepté`,
      type: 'payment',
    });
  }

  /**
   * Rappel de cours
   */
  async notifyClassReminder(
    studentId: string,
    courseTitle: string,
    classTime: string,
  ): Promise<void> {
    await this.sendNotification({
      userId: studentId,
      title: 'Rappel de cours',
      message: `Vous avez un cours de "${courseTitle}" à ${classTime}`,
      type: 'course',
    });
  }

  /**
   * Notification d'approbation de compte
   */
  async notifyAccountApproval(userId: string, userFullName: string): Promise<void> {
    await this.sendNotification({
      userId: userId,
      title: 'Compte approuvé',
      message: `Félicitations ${userFullName}, votre compte a été approuvé. Vous pouvez maintenant vous connecter.`,
      type: 'approval',
    });
  }

  /**
   * Notification de rejet de compte
   */
  async notifyAccountRejection(
    userId: string,
    userFullName: string,
    reason: string,
  ): Promise<void> {
    await this.sendNotification({
      userId: userId,
      title: 'Compte rejeté',
      message: `Votre compte a été rejeté pour la raison suivante: ${reason}`,
      type: 'rejection',
      data: { reason },
    });
  }

  // ==================== MÉTHODES SIMPLIFIÉES POUR L'UI ====================

  showSuccess(message: string): void {
  }

  showError(message: string): void {
    console.error('❌ Error:', message);
  }

  showWarning(message: string): void {
    console.warn('⚠️ Warning:', message);
  }

  showInfo(message: string): void {
  }
}
