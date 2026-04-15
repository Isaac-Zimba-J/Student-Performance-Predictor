import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <div class="auth-screen">
      <div class="auth-card">
        <div class="auth-logo">Academ<span>IQ</span></div>
        <div class="auth-subtitle">Create your account</div>

        <div class="form-row">
          <div class="form-group">
            <label>Full name</label>
            <input type="text" [(ngModel)]="form.full_name" placeholder="Emeldah Miyanda">
          </div>
          <div class="form-group">
            <label>Role</label>
            <select [(ngModel)]="form.role" (ngModelChange)="onRoleChange()">
              <option value="student">Student</option>
              <option value="lecturer">Lecturer</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label>Email address</label>
          <input type="email" [(ngModel)]="form.email" placeholder="you@university.ac.zm">
        </div>
        <div class="form-group">
          <label>Password</label>
          <input type="password" [(ngModel)]="form.password" placeholder="Min. 8 characters">
        </div>

        <!-- Student-only fields -->
        <ng-container *ngIf="form.role === 'student'">
          <div class="form-row">
            <div class="form-group">
              <label>Student number</label>
              <input type="text" [(ngModel)]="profile.student_number" placeholder="21164180">
            </div>
            <div class="form-group">
              <label>Year of study</label>
              <select [(ngModel)]="profile.year_of_study">
                <option *ngFor="let y of [1,2,3,4]" [value]="y">Year {{ y }}</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>Programme</label>
            <input type="text" [(ngModel)]="profile.programme" placeholder="Computer Science">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Socioeconomic status</label>
              <select [(ngModel)]="profile.ses_status">
                <option value="low">Low</option>
                <option value="middle">Middle</option>
                <option value="high">High</option>
              </select>
            </div>
            <div class="form-group">
              <label>Scholarship?</label>
              <select [(ngModel)]="profile.is_scholarship">
                <option [ngValue]="false">No</option>
                <option [ngValue]="true">Yes</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Part-time employed?</label>
              <select [(ngModel)]="profile.is_employed_part_time">
                <option [ngValue]="false">No</option>
                <option [ngValue]="true">Yes</option>
              </select>
            </div>
            <div class="form-group">
              <label>Distance from campus (km)</label>
              <input type="number" [(ngModel)]="profile.distance_from_campus_km" min="0">
            </div>
          </div>
        </ng-container>

        <div *ngIf="error" style="color:var(--red);font-size:13px;margin-bottom:12px">{{ error }}</div>
        <div *ngIf="success" style="color:var(--green);font-size:13px;margin-bottom:12px">✓ {{ success }}</div>

        <button class="btn-primary" (click)="register()" [disabled]="loading">
          {{ loading ? 'Creating account...' : 'Create account' }}
        </button>
        <div class="auth-toggle">Have an account? <a routerLink="/login">Sign in</a></div>
      </div>
    </div>
  `,
})
export class RegisterComponent {
  form = { full_name: '', email: '', password: '', role: 'student' };
  profile = {
    student_number: '', year_of_study: 1, programme: '',
    ses_status: 'middle', is_scholarship: false,
    is_employed_part_time: false, distance_from_campus_km: 0,
  };
  loading = false; error = ''; success = '';

  constructor(private auth: AuthService, private router: Router) {}

  onRoleChange() { this.error = ''; }

  register() {
    this.loading = true; this.error = ''; this.success = '';
    const payload = this.form.role === 'student'
      ? { ...this.form, ...this.profile }
      : { ...this.form };

    this.auth.register(payload).subscribe({
      next: () => {
        this.success = 'Account created — signing you in...';
        this.auth.login({ email: this.form.email, password: this.form.password }).subscribe({
          next: res => this.router.navigate([res.role === 'student' ? '/profile' : '/dashboard']),
          error: () => { this.loading = false; this.router.navigate(['/login']); },
        });
      },
      error: e => {
        this.error = e.error?.detail || 'Registration failed';
        this.loading = false;
      },
    });
  }
}
