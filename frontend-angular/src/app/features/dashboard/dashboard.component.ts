import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PredictionService } from '../../core/services/api.services';
import { RiskSummary, LatestPredictionRow } from '../../core/models';

interface DonutSlice {
  color: string;
  offset: number;
  dash: number;
  label: string;
  count: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <div class="stat-grid">
      <div class="stat-card total">
        <div class="stat-label">Total Students</div>
        <div class="stat-value">{{ summary?.total_students ?? '—' }}</div>
        <div class="stat-sub">Enrolled this semester</div>
      </div>
      <div class="stat-card low">
        <div class="stat-label">Low Risk</div>
        <div class="stat-value" style="color:var(--green)">{{ summary?.low_risk ?? '—' }}</div>
        <div class="stat-sub">On track</div>
      </div>
      <div class="stat-card medium">
        <div class="stat-label">Medium Risk</div>
        <div class="stat-value" style="color:var(--amber)">{{ summary?.medium_risk ?? '—' }}</div>
        <div class="stat-sub">Needs monitoring</div>
      </div>
      <div class="stat-card high">
        <div class="stat-label">High / Critical</div>
        <div class="stat-value" style="color:var(--red)">
          {{ (summary?.high_risk ?? 0) + (summary?.critical_risk ?? 0) }}
        </div>
        <div class="stat-sub">{{ summary?.at_risk_percentage }}% at risk</div>
      </div>
    </div>

    <div class="grid-3">
      <!-- Alerts panel -->
      <div class="card">
        <div class="card-title">At-risk students requiring action</div>
        <ng-container *ngIf="summary; else loading">
          <ng-container *ngIf="(summary.high_risk + summary.critical_risk) > 0; else noAlerts">
            <div class="alert-item critical" *ngIf="summary.critical_risk > 0">
              <div>⚠️</div>
              <div>
                <div style="font-weight:600;font-size:14px">
                  {{ summary.critical_risk }} student{{ summary.critical_risk > 1 ? 's' : '' }} at CRITICAL risk
                </div>
                <div class="alert-meta">Immediate intervention required</div>
              </div>
            </div>
            <div class="alert-item high" *ngIf="summary.high_risk > 0">
              <div>⚡</div>
              <div>
                <div style="font-weight:600;font-size:14px">
                  {{ summary.high_risk }} student{{ summary.high_risk > 1 ? 's' : '' }} at HIGH risk
                </div>
                <div class="alert-meta">Targeted support recommended this week</div>
              </div>
            </div>
            <div style="margin-top:16px">
              <a routerLink="/students" class="btn-sm primary">View all students →</a>
            </div>
          </ng-container>
          <ng-template #noAlerts>
            <div class="empty-state">
              <div class="empty-icon">✓</div>No critical alerts right now.
            </div>
          </ng-template>
        </ng-container>
        <ng-template #loading>
          <div class="empty-state"><div class="spinner"></div></div>
        </ng-template>
      </div>

      <!-- Donut chart panel -->
      <div class="card" style="display:flex;flex-direction:column;align-items:center;justify-content:center">
        <div class="card-title" style="align-self:flex-start">Risk distribution</div>

        <div *ngIf="!summary" class="empty-state"><div class="spinner"></div></div>

        <ng-container *ngIf="summary && summary.total_students === 0">
          <div class="empty-state">No predictions yet — run predictions first.</div>
        </ng-container>

        <ng-container *ngIf="summary && summary.total_students > 0">
          <!-- SVG donut -->
          <svg width="180" height="180" viewBox="0 0 180 180" style="overflow:visible">
            <circle cx="90" cy="90" r="70" fill="none" stroke="var(--surface2)" stroke-width="24"/>
            <circle
              *ngFor="let s of donutSlices"
              cx="90" cy="90" r="70"
              fill="none"
              [attr.stroke]="s.color"
              stroke-width="24"
              stroke-linecap="butt"
              [attr.stroke-dasharray]="s.dash + ' ' + (circumference - s.dash)"
              [attr.stroke-dashoffset]="s.offset"
              style="transform:rotate(-90deg);transform-origin:90px 90px;transition:stroke-dasharray .6s ease"
            />
            <!-- centre label -->
            <text x="90" y="85" text-anchor="middle" fill="var(--text)"
                  font-size="22" font-weight="800" font-family="Syne,sans-serif">
              {{ summary.total_students }}
            </text>
            <text x="90" y="103" text-anchor="middle" fill="var(--muted2)" font-size="11">
              students
            </text>
          </svg>

          <!-- Legend -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 20px;margin-top:16px;width:100%">
            <div *ngFor="let s of donutSlices" style="display:flex;align-items:center;gap:8px;font-size:13px">
              <span style="width:10px;height:10px;border-radius:50%;flex-shrink:0"
                    [style.background]="s.color"></span>
              <span style="color:var(--muted2)">{{ s.label }}</span>
              <span style="color:var(--text);font-weight:600;margin-left:auto">{{ s.count }}</span>
            </div>
          </div>
        </ng-container>
      </div>
    </div>

    <!-- Students needing attention -->
    <div class="card card-flush" style="margin-top:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:16px">
        <div>
          <div class="card-title" style="margin:0 0 4px">Students needing attention</div>
          <div style="font-size:12px;color:var(--muted2)">
            Highest-risk students first, from each student's latest prediction.
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <select class="search-box compact pager-select" [(ngModel)]="attentionFilter" (ngModelChange)="loadAttention()">
            <option value="">Critical &amp; high</option>
            <option value="critical">Critical only</option>
            <option value="high">High only</option>
            <option value="medium">Medium only</option>
          </select>
          <a routerLink="/predictions" class="btn-sm secondary">All predictions →</a>
        </div>
      </div>

      <div *ngIf="loadingAttention" class="empty-state"><div class="spinner"></div></div>

      <div *ngIf="!loadingAttention && attention.length === 0" class="empty-state">
        <div class="empty-icon">✓</div>No students in this band right now.
      </div>

      <div class="scroll-area short" *ngIf="!loadingAttention && attention.length > 0">
        <table class="student-table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Programme</th>
              <th>Year</th>
              <th>Risk</th>
              <th>Score</th>
              <th>Predicted GPA</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let r of attention; trackBy: trackById">
              <td>
                <div class="student-name">{{ r.student_name }}</div>
                <div style="font-size:11px;color:var(--muted2)">{{ r.student_number }}</div>
              </td>
              <td>{{ r.programme }}</td>
              <td>Year {{ r.year_of_study }}</td>
              <td>
                <span class="risk-badge {{ r.risk_level }}">
                  <span class="risk-dot"></span>{{ r.risk_level.toUpperCase() }}
                </span>
              </td>
              <td>
                <div style="min-width:90px">
                  <div style="font-size:13px;font-weight:600">{{ (r.risk_score * 100).toFixed(0) }}%</div>
                  <div class="risk-meter"><div class="risk-fill {{ r.risk_level }}" [style.width.%]="r.risk_score * 100"></div></div>
                </div>
              </td>
              <td>{{ r.predicted_gpa !== null ? r.predicted_gpa.toFixed(2) : '—' }}</td>
              <td style="text-align:right">
                <a [routerLink]="['/students', r.student_id]" class="btn-sm primary">View</a>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div *ngIf="attentionTotal > attention.length" style="font-size:12px;color:var(--muted2);margin-top:12px">
        Showing the top {{ attention.length }} of {{ attentionTotal | number }} —
        <a routerLink="/predictions" style="color:var(--accent2)">see the full list</a>.
      </div>
    </div>
  `,
})
export class DashboardComponent implements OnInit {
  summary: RiskSummary | null = null;
  attention: LatestPredictionRow[] = [];
  filteredTotal = 0;
  attentionFilter = '';
  loadingAttention = true;
  readonly circumference = 2 * Math.PI * 70;

  constructor(private predictionService: PredictionService) {}

  ngOnInit() {
    this.predictionService.getRiskSummary().subscribe({
      next: s => { this.summary = s; },
    });
    this.loadAttention();
  }

  /**
   * Top of the at-risk list. The API sorts critical → high → medium → low, so
   * with no band filter the first page is exactly the critical + high students.
   */
  loadAttention() {
    this.loadingAttention = true;
    this.predictionService.getLatest({ riskLevel: this.attentionFilter || undefined, limit: 15 }).subscribe({
      next: page => {
        this.attention = this.attentionFilter
          ? page.items
          : page.items.filter(r => r.risk_level === 'critical' || r.risk_level === 'high');
        this.filteredTotal = page.total;
        this.loadingAttention = false;
      },
      error: () => { this.attention = []; this.loadingAttention = false; },
    });
  }

  /** Unpaged size of the band being shown; the summary may arrive after the list. */
  get attentionTotal(): number {
    if (this.attentionFilter) return this.filteredTotal;
    return (this.summary?.critical_risk ?? 0) + (this.summary?.high_risk ?? 0);
  }

  trackById(_: number, r: LatestPredictionRow) { return r.student_id; }

  get donutSlices(): DonutSlice[] {
    if (!this.summary || this.summary.total_students === 0) return [];

    const segments = [
      { label: 'Low',      count: this.summary.low_risk,      color: '#22c55e' },
      { label: 'Medium',   count: this.summary.medium_risk,   color: '#f59e0b' },
      { label: 'High',     count: this.summary.high_risk,     color: '#ef4444' },
      { label: 'Critical', count: this.summary.critical_risk, color: '#dc2626' },
    ];

    const total = this.summary.total_students;
    let cumulativeDash = 0;
    return segments.map(seg => {
      const dash = (seg.count / total) * this.circumference;
      // stroke-dashoffset starts at 0 = 3 o'clock; offset shifts start point
      const offset = -cumulativeDash;
      cumulativeDash += dash;
      return { ...seg, dash, offset };
    });
  }
}
