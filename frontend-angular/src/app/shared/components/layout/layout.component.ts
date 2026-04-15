import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { filter } from 'rxjs/operators';

interface NavItem {
  label: string;
  route: string;
  icon: string;
  roles: string[];
}

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <div class="app-layout">
      <!-- Sidebar -->
      <aside class="sidebar">
        <div class="sidebar-logo">Academ<span>IQ</span></div>

        <ng-container *ngFor="let section of sections">
          <div class="nav-section-label">{{ section.label }}</div>
          <ng-container *ngFor="let item of section.items">
            <div *ngIf="canSee(item)"
                 class="nav-item"
                 [class.active]="activeRoute === item.route"
                 (click)="navigate(item.route)">
              <span class="nav-icon">{{ item.icon }}</span>
              {{ item.label }}
            </div>
          </ng-container>
        </ng-container>

        <div class="sidebar-user">
          <div class="user-avatar">{{ initials }}</div>
          <div>
            <div class="user-name">{{ auth.currentUser?.full_name }}</div>
            <div class="user-role">{{ auth.currentUser?.role }}</div>
          </div>
          <button class="logout-btn" (click)="auth.logout()" title="Sign out">↩</button>
        </div>
      </aside>

      <!-- Main area -->
      <div class="main-area">
        <div class="top-bar">
          <div class="page-title">{{ pageTitle }}</div>
          <div class="top-bar-actions">
            <input class="search-box" placeholder="🔍  Search..." [(ngModel)]="searchQuery" (keyup.enter)="doSearch()">
            <button class="btn-icon" title="Refresh" (click)="refresh()">↻</button>
          </div>
        </div>
        <router-outlet></router-outlet>
      </div>
    </div>
  `,
})
export class LayoutComponent {
  searchQuery = '';
  activeRoute = '';

  sections = [
    {
      label: 'Overview',
      items: [
        { label: 'Dashboard', route: '/dashboard', icon: '⬡', roles: ['admin', 'lecturer'] },
        { label: 'Students', route: '/students', icon: '◎', roles: ['admin', 'lecturer'] },
        { label: 'Risk Predictions', route: '/predictions', icon: '◈', roles: ['admin', 'lecturer'] },
      ],
    },
    {
      label: 'Management',
      items: [
        { label: 'Attendance', route: '/attendance', icon: '▦', roles: ['admin', 'lecturer'] },
        { label: 'Assessment Results', route: '/results', icon: '◫', roles: ['admin', 'lecturer'] },
        { label: 'Interventions', route: '/interventions', icon: '◐', roles: ['admin', 'lecturer'] },
      ],
    },
    {
      label: 'Account',
      items: [
        { label: 'My Profile', route: '/profile', icon: '◯', roles: ['student', 'admin', 'lecturer'] },
      ],
    },
  ];

  pageTitles: Record<string, string> = {
    '/dashboard': 'Dashboard',
    '/students': 'Students',
    '/predictions': 'Risk Predictions',
    '/attendance': 'Record Attendance',
    '/results': 'Assessment Results',
    '/interventions': 'Interventions',
    '/profile': 'My Profile',
  };

  constructor(public auth: AuthService, private router: Router) {
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd)
    ).subscribe((e: any) => {
      this.activeRoute = '/' + e.urlAfterRedirects.split('/')[1];
    });
  }

  get initials(): string {
    return (this.auth.currentUser?.full_name ?? '?').charAt(0).toUpperCase();
  }

  get pageTitle(): string {
    return this.pageTitles[this.activeRoute] ?? 'AcademIQ';
  }

  canSee(item: NavItem): boolean {
    return item.roles.includes(this.auth.currentUser?.role ?? '');
  }

  navigate(route: string) { this.router.navigate([route]); }
  refresh() { window.location.reload(); }
  doSearch() { /* wire to global search service if needed */ }
}
