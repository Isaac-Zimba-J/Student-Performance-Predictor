import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { StudentService } from '../../../core/services/api.services';
import { StudentProfile } from '../../../core/models';
import { PagerComponent } from '../../../shared/components/pager/pager.component';

@Component({
  selector: 'app-student-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, PagerComponent],
  template: `
    <div class="card card-flush">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:18px">
        <div>
          <div class="card-title" style="margin:0 0 4px">All Students</div>
          <div style="font-size:12px;color:var(--muted2)">
            <ng-container *ngIf="!loading">{{ total | number }} student{{ total === 1 ? '' : 's' }} match your filters</ng-container>
            <ng-container *ngIf="loading">Loading…</ng-container>
          </div>
        </div>
      </div>

      <div class="filter-bar">
        <input class="search-box" [(ngModel)]="searchQuery" (ngModelChange)="search$.next($event)"
               placeholder="🔍  Search by name, student number or programme…">

        <select class="search-box compact" [(ngModel)]="filterProgramme" (ngModelChange)="resetAndLoad()">
          <option value="">All programmes</option>
          <option *ngFor="let p of programmes" [value]="p">{{ p }}</option>
        </select>

        <select class="search-box compact" [(ngModel)]="filterYear" (ngModelChange)="resetAndLoad()">
          <option value="">All years</option>
          <option *ngFor="let y of [1,2,3,4]" [value]="y">Year {{ y }}</option>
        </select>

        <button class="btn-sm secondary" (click)="clearFilters()"
                [disabled]="!searchQuery && !filterProgramme && !filterYear">Clear</button>
      </div>

      <div *ngIf="error" class="empty-state" style="color:var(--red)">{{ error }}</div>

      <!-- The table scrolls inside this box; the header stays pinned. -->
      <div class="scroll-area" *ngIf="!error">
        <table class="student-table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Programme</th>
              <th>Year</th>
              <th>SES status</th>
              <th>Scholarship</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngIf="loading">
              <td colspan="6" class="empty-state"><div class="spinner"></div></td>
            </tr>

            <tr *ngFor="let s of students; trackBy: trackById">
              <td>
                <div class="student-name">{{ s.full_name }}</div>
                <div style="font-size:11px;color:var(--muted2)">{{ s.student_number }}</div>
              </td>
              <td>{{ s.programme }}</td>
              <td>Year {{ s.year_of_study }}</td>
              <td><span class="tag ses-{{s.ses_status}}">{{ s.ses_status }}</span></td>
              <td>
                <span *ngIf="s.is_scholarship" style="color:var(--green)">✓</span>
                <span *ngIf="!s.is_scholarship" style="color:var(--muted)">—</span>
              </td>
              <td>
                <a [routerLink]="['/students', s.id]" class="btn-sm primary">View prediction</a>
              </td>
            </tr>

            <tr *ngIf="!loading && students.length === 0">
              <td colspan="6" class="empty-state">No students match your search.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <app-pager
        [page]="page" [pageSize]="pageSize" [total]="total" noun="students"
        (pageChange)="goToPage($event)"
        (pageSizeChange)="changePageSize($event)">
      </app-pager>
    </div>
  `,
})
export class StudentListComponent implements OnInit, OnDestroy {
  students: StudentProfile[] = [];
  programmes: string[] = [];

  searchQuery = '';
  filterProgramme = '';
  filterYear: number | '' = '';

  page = 0;
  pageSize = 25;
  total = 0;

  loading = true;
  error = '';

  readonly search$ = new Subject<string>();
  private searchSub?: Subscription;

  constructor(private studentService: StudentService) {}

  ngOnInit() {
    // Debounced so typing doesn't fire a request per keystroke.
    this.searchSub = this.search$
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe(() => this.resetAndLoad());

    this.studentService.getProgrammes().subscribe({
      next: p => this.programmes = p,
      error: () => this.programmes = [],
    });

    this.load();
  }

  ngOnDestroy() { this.searchSub?.unsubscribe(); }

  load() {
    this.loading = true;
    this.error = '';
    this.studentService.search({
      search: this.searchQuery,
      programme: this.filterProgramme || undefined,
      year: this.filterYear || undefined,
      skip: this.page * this.pageSize,
      limit: this.pageSize,
    }).subscribe({
      next: page => {
        this.students = page.items;
        this.total = page.total;
        this.loading = false;
      },
      error: () => {
        this.error = 'Could not load students — is the API running?';
        this.students = [];
        this.loading = false;
      },
    });
  }

  /** Any filter change invalidates the current page offset. */
  resetAndLoad() {
    this.page = 0;
    this.load();
  }

  clearFilters() {
    this.searchQuery = '';
    this.filterProgramme = '';
    this.filterYear = '';
    this.resetAndLoad();
  }

  goToPage(page: number) {
    this.page = page;
    this.load();
    this.scrollListToTop();
  }

  changePageSize(size: number) {
    this.pageSize = size;
    this.resetAndLoad();
    this.scrollListToTop();
  }

  trackById(_: number, s: StudentProfile) { return s.id; }

  private scrollListToTop() {
    document.querySelector('.scroll-area')?.scrollTo({ top: 0 });
  }
}
