import { Routes } from '@angular/router';
import { authGuard, roleGuard } from './core/guards/auth.guard';

export const APP_ROUTES: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login/login.component').then(m => m.LoginComponent),
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./features/auth/register/register.component').then(m => m.RegisterComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./shared/components/layout/layout.component').then(m => m.LayoutComponent),
    children: [
      {
        path: 'dashboard',
        canActivate: [roleGuard(['admin', 'lecturer'])],
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
      },
      {
        path: 'students',
        canActivate: [roleGuard(['admin', 'lecturer'])],
        loadComponent: () =>
          import('./features/students/student-list/student-list.component').then(m => m.StudentListComponent),
      },
      {
        path: 'students/:id',
        canActivate: [roleGuard(['admin', 'lecturer'])],
        loadComponent: () =>
          import('./features/students/student-detail/student-detail.component').then(m => m.StudentDetailComponent),
      },
      {
        path: 'predictions',
        canActivate: [roleGuard(['admin', 'lecturer'])],
        loadComponent: () =>
          import('./features/predictions/predictions.component').then(m => m.PredictionsComponent),
      },
      {
        path: 'attendance',
        canActivate: [roleGuard(['admin', 'lecturer'])],
        loadComponent: () =>
          import('./features/attendance/attendance.component').then(m => m.AttendanceComponent),
      },
      {
        path: 'interventions',
        canActivate: [roleGuard(['admin', 'lecturer'])],
        loadComponent: () =>
          import('./features/interventions/interventions.component').then(m => m.InterventionsComponent),
      },
      {
        path: 'results',
        canActivate: [roleGuard(['admin', 'lecturer'])],
        loadComponent: () =>
          import('./features/results/results.component').then(m => m.ResultsComponent),
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./features/profile/profile.component').then(m => m.ProfileComponent),
      },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: 'login' },
];
