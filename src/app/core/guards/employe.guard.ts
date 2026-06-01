// core/guards/employe.guard.ts
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthEmployeService } from '../services/auth-employe.service';

export const employeGuard = () => {
  const authEmploye = inject(AuthEmployeService);
  const router = inject(Router);

  if (authEmploye.isLoggedIn()) {
    return true;
  }

  router.navigate(['/login-employe']);
  return false;
};
