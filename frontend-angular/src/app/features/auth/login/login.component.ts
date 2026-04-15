// login.component.ts
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <div class="auth-screen">
      <div class="auth-card">
        <div class="auth-logo">Academ<span>IQ</span></div>
        <div class="auth-subtitle">Student Performance Predictor — Sign in to continue</div>

        <div class="form-group">
          <label>Email address</label>
          <input type="email" [(ngModel)]="email" placeholder="you@university.ac.zm" (keyup.enter)="login()">
        </div>
        <div class="form-group">
          <label>Password</label>
          <input type="password" [(ngModel)]="password" placeholder="••••••••" (keyup.enter)="login()">
        </div>
        <div *ngIf="error" style="color:var(--red);font-size:13px;margin-bottom:12px">{{ error }}</div>
        <button class="btn-primary" (click)="login()" [disabled]="loading">
          {{ loading ? 'Signing in...' : 'Sign in' }}
        </button>
        <div class="auth-toggle">No account? <a routerLink="/register">Register here</a></div>
      </div>
    </div>
  `,
})
export class LoginComponent {
  email = ''; password = ''; loading = false; error = '';

  constructor(private auth: AuthService, private router: Router) {}

  login() {
    this.loading = true; this.error = '';
    this.auth.login({ email: this.email, password: this.password }).subscribe({
      next: res => {
        const route = res.role === 'student' ? '/profile' : '/dashboard';
        this.router.navigate([route]);
      },
      error: e => {
        this.error = e.error?.detail || 'Invalid email or password';
        this.loading = false;
      },
    });
  }
}
