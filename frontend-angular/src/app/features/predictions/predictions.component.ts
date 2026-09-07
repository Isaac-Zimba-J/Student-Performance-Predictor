import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { PredictionService } from '../../core/services/api.services';
import { LatestPredictionRow, PredictionOut, RiskLevel } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { PagerComponent } from '../../shared/components/pager/pager.component';

@Component({
  selector: 'app-predictions',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, PagerComponent],
  template: `
    <div class="card" style="margin-bottom:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap">
        <div>
          <div class="card-title" style="margin:0 0 4px">Risk predictions</div>
          <div style="font-size:13px;color:var(--muted2)">
            Latest score for every student, highest risk first. Re-run any student to refresh their score.
          </div>
        </div>
        <div style="display:flex;gap:10px" *ngIf="isAdmin">
          <button class="btn-sm secondary" (click)="triggerRetrain()" [disabled]="retraining">
            {{ retraining ? 'Retraining...' : '↺ Retrain model' }}
          </button>
        </div>
      </div>
      <div *ngIf="retrainMsg" style="margin-top:10px;font-size:13px" [style.color]="retrainErr ? 'var(--red)' : 'var(--green)'">
        {{ retrainMsg }}
      </div>
    </div>

    <div class="card card-flush">
      <div class="filter-bar">
        <input class="search-box" [(ngModel)]="searchQuery" (ngModelChange)="search$.next($event)"
               placeholder="🔍  Search by name, student number or programme…">

        <select class="search-box compact" [(ngModel)]="filterRisk" (ngModelChange)="resetAndLoad()">
          <option value="">All risk levels</option>
          <option value="critical">Critical only</option>
          <option value="high">High only</option>
          <option value="medium">Medium only</option>
          <option value="low">Low only</option>
        </select>

        <button class="btn-sm secondary" (click)="clearFilters()"
                [disabled]="!searchQuery && !filterRisk">Clear</button>

        <span class="pager-spacer"></span>
        <span style="font-size:12px;color:var(--muted2)">{{ total | number }} with a prediction</span>
      </div>

      <div *ngIf="error" class="empty-state" style="color:var(--red)">{{ error }}</div>

      <div class="scroll-area" style="--scroll-max: calc(100vh - 430px)" *ngIf="!error">
        <div *ngIf="loading" class="empty-state"><div class="spinner"></div></div>

        <div *ngIf="!loading && rows.length === 0" class="empty-state">
          <div class="empty-icon">◎</div>
          No predictions match your filters. Seed the database or run a prediction from a student's page.
        </div>

        <div *ngFor="let r of rows; trackBy: trackById" class="card"
             style="margin-bottom:10px;padding:16px 18px">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap">
            <div style="min-width:200px">
              <div style="font-weight:600">{{ r.student_name }}</div>
              <div style="font-size:12px;color:var(--muted2)">
                {{ r.student_number }} · {{ r.programme }} · Year {{ r.year_of_study }}
              </div>
            </div>

            <div style="display:flex;align-items:center;gap:16px">
              <div style="text-align:right">
                <span class="risk-badge {{ currentLevel(r) }}">
                  <span class="risk-dot"></span>{{ currentLevel(r).toUpperCase() }}
                </span>
                <div style="font-size:11px;color:var(--muted2);margin-top:4px">
                  Score: {{ (currentScore(r) * 100).toFixed(0) }}%
                  <span *ngIf="currentGpa(r) !== null"> · GPA: {{ currentGpa(r) }}</span>
                </div>
              </div>

              <button class="btn-sm secondary" (click)="runPrediction(r)" [disabled]="running[r.student_id]">
                {{ running[r.student_id] ? 'Running…' : '↻ Re-run' }}
              </button>
              <a [routerLink]="['/students', r.student_id]" class="btn-sm primary">Details →</a>
            </div>
          </div>

          <!-- Top factors appear once a prediction has been re-run in this session -->
          <div *ngIf="fresh[r.student_id] as pred" style="margin-top:14px">
            <div *ngFor="let f of pred.risk_factors.slice(0,3)" class="factor-item" style="margin-bottom:8px">
              <div class="factor-header">
                <span class="factor-name" style="font-size:12px">{{ f.factor }}</span>
                <span class="factor-val">{{ f.value }}</span>
              </div>
              <div class="factor-bar">
                <div class="factor-fill" [ngClass]="f.impact > 0 ? 'negative' : 'positive'"
                     [style.width.%]="barWidth(f.impact)"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <app-pager
        [page]="page" [pageSize]="pageSize" [total]="total" noun="predictions"
        (pageChange)="goToPage($event)"
        (pageSizeChange)="changePageSize($event)">
      </app-pager>
    </div>
  `,
})
export class PredictionsComponent implements OnInit, OnDestroy {
  rows: LatestPredictionRow[] = [];
  /** Predictions re-run in this session, keyed by student id. */
  fresh: Record<string, PredictionOut> = {};
  running: Record<string, boolean> = {};

  searchQuery = '';
  filterRisk = '';
  page = 0;
  pageSize = 25;
  total = 0;

  loading = true;
  error = '';
  retraining = false;
  retrainMsg = '';
  retrainErr = false;

  readonly search$ = new Subject<string>();
  private searchSub?: Subscription;

  constructor(private predService: PredictionService, public auth: AuthService) {}

  get isAdmin() { return this.auth.hasRole('admin'); }

  ngOnInit() {
    this.searchSub = this.search$
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe(() => this.resetAndLoad());
    this.load();
  }

  ngOnDestroy() { this.searchSub?.unsubscribe(); }

  load() {
    this.loading = true;
    this.error = '';
    this.predService.getLatest({
      search: this.searchQuery,
      riskLevel: this.filterRisk || undefined,
      skip: this.page * this.pageSize,
      limit: this.pageSize,
    }).subscribe({
      next: page => {
        this.rows = page.items;
        this.total = page.total;
        this.loading = false;
      },
      error: () => {
        this.error = 'Could not load predictions — is the API running?';
        this.rows = [];
        this.loading = false;
      },
    });
  }

  resetAndLoad() { this.page = 0; this.load(); }

  clearFilters() {
    this.searchQuery = '';
    this.filterRisk = '';
    this.resetAndLoad();
  }

  goToPage(page: number) { this.page = page; this.load(); this.scrollListToTop(); }

  changePageSize(size: number) { this.pageSize = size; this.resetAndLoad(); this.scrollListToTop(); }

  runPrediction(row: LatestPredictionRow) {
    this.running[row.student_id] = true;
    this.predService.getStudentPrediction(row.student_id).subscribe({
      next: pred => {
        this.fresh[row.student_id] = pred;
        this.running[row.student_id] = false;
      },
      error: () => { this.running[row.student_id] = false; },
    });
  }

  // A re-run in this session supersedes the stored value for display.
  currentLevel(r: LatestPredictionRow): RiskLevel { return this.fresh[r.student_id]?.risk_level ?? r.risk_level; }
  currentScore(r: LatestPredictionRow): number { return this.fresh[r.student_id]?.risk_score ?? r.risk_score; }
  currentGpa(r: LatestPredictionRow): number | null {
    const pred = this.fresh[r.student_id];
    return pred ? pred.predicted_gpa : r.predicted_gpa;
  }

  triggerRetrain() {
    this.retraining = true; this.retrainMsg = ''; this.retrainErr = false;
    this.predService.triggerTraining().subscribe({
      next: res => {
        this.retraining = false;
        this.retrainMsg = `Model retrained on ${res.samples} samples successfully.`;
      },
      error: e => {
        this.retraining = false;
        this.retrainErr = true;
        this.retrainMsg = e.error?.detail || 'Retraining failed';
      },
    });
  }

  barWidth(impact: number): number {
    return Math.min(Math.abs(impact) * 300, 100);
  }

  trackById(_: number, r: LatestPredictionRow) { return r.student_id; }

  private scrollListToTop() {
    document.querySelector('.scroll-area')?.scrollTo({ top: 0 });
  }
}
