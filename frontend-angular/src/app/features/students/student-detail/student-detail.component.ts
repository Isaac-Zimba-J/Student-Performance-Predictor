import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PredictionService, InterventionService, AttendanceService } from '../../../core/services/api.services';
import { PredictionOut, PredictionHistoryPoint, InterventionOut, AttendanceOut } from '../../../core/models';
import { AuthService } from '../../../core/services/auth.service';

interface ChartPoint { x: number; y: number; point: PredictionHistoryPoint; }

@Component({
  selector: 'app-student-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <a routerLink="/students" class="btn-sm secondary" style="display:inline-block;margin-bottom:20px">← Back to students</a>

    <div class="grid-2">
      <!-- Risk card -->
      <div class="card">
        <div class="card-title">Risk assessment</div>
        <div *ngIf="loadingPred" class="empty-state"><div class="spinner"></div></div>
        <div *ngIf="predError" class="empty-state">
          {{ predError }}<br><small>Add attendance and assessment records first.</small>
        </div>
        <div *ngIf="prediction && !loadingPred">
          <div style="text-align:center;margin-bottom:20px">
            <div class="score-circle" [style.background]="circleGradient">
              <div class="score-inner">
                <div class="score-num">{{ riskPct }}%</div>
                <div class="score-label">risk score</div>
              </div>
            </div>
            <span class="risk-badge {{ prediction.risk_level }}">
              <span class="risk-dot"></span>{{ prediction.risk_level.toUpperCase() }} RISK
            </span>
            <div *ngIf="prediction.predicted_gpa" style="margin-top:10px;font-size:13px;color:var(--muted2)">
              Predicted GPA: <strong>{{ prediction.predicted_gpa }}</strong>
            </div>
          </div>
          <div style="font-size:13px;color:var(--muted2)">
            <strong style="color:var(--text)">{{ prediction.student_name }}</strong>
            · {{ prediction.student_number }}<br>
            Last prediction: {{ prediction.predicted_at | date:'medium' }}
          </div>
          <div style="margin-top:14px">
            <button class="btn-sm primary" (click)="refreshPrediction()" [disabled]="loadingPred">
              ↻ Re-run prediction
            </button>
          </div>
        </div>
      </div>

      <!-- Risk factors -->
      <div class="card">
        <div class="card-title">Key risk factors</div>
        <div *ngIf="prediction">
          <div class="factor-item" *ngFor="let f of prediction.risk_factors">
            <div class="factor-header">
              <span class="factor-name">{{ f.factor }}</span>
              <span class="factor-val">{{ f.value }}</span>
            </div>
            <div class="factor-bar">
              <div class="factor-fill" [ngClass]="f.impact > 0 ? 'negative' : 'positive'"
                   [style.width.%]="barWidth(f.impact)"></div>
            </div>
          </div>
        </div>
        <div *ngIf="!prediction && !loadingPred" class="empty-state">Run prediction first</div>
      </div>
    </div>

    <!-- Recommendations -->
    <div class="card" style="margin-top:20px" *ngIf="prediction">
      <div class="card-title">Personalised recommendations</div>
      <div class="rec-item" *ngFor="let r of prediction.recommendations; let i = index">
        <span class="rec-icon">{{ icons[i] || '▸' }}</span>
        <span>{{ r }}</span>
      </div>
    </div>

    <!-- Risk history chart -->
    <div class="card" style="margin-top:20px">
      <div class="card-title">Risk score over time</div>

      <div *ngIf="history.length === 0" class="empty-state" style="padding:32px">
        <div class="empty-icon">📈</div>
        No prediction history yet — run a prediction to start tracking.
      </div>

      <ng-container *ngIf="history.length === 1">
        <div class="empty-state" style="padding:20px">
          Only one data point so far — run more predictions over time to see the trend.
        </div>
      </ng-container>

      <ng-container *ngIf="history.length >= 2">
        <div style="position:relative;overflow:visible">
          <svg [attr.width]="chartW" [attr.height]="chartH + 40"
               style="width:100%;overflow:visible;display:block">

            <!-- Y-axis grid lines at 0%, 25%, 50%, 75%, 100% -->
            <ng-container *ngFor="let pct of [0,25,50,75,100]">
              <line
                [attr.x1]="padL" [attr.y1]="yScale(pct/100)"
                [attr.x2]="chartW - padR" [attr.y2]="yScale(pct/100)"
                stroke="var(--border)" stroke-width="1"/>
              <text [attr.x]="padL - 8" [attr.y]="yScale(pct/100) + 4"
                    text-anchor="end" fill="var(--muted)" font-size="10">
                {{ pct }}%
              </text>
            </ng-container>

            <!-- Risk zone bands -->
            <rect [attr.x]="padL" [attr.y]="yScale(1)" [attr.width]="innerW" [attr.height]="yScale(0.75) - yScale(1)"
                  fill="rgba(239,68,68,0.06)"/>
            <rect [attr.x]="padL" [attr.y]="yScale(0.75)" [attr.width]="innerW" [attr.height]="yScale(0.5) - yScale(0.75)"
                  fill="rgba(245,158,11,0.06)"/>
            <rect [attr.x]="padL" [attr.y]="yScale(0.5)" [attr.width]="innerW" [attr.height]="yScale(0.25) - yScale(0.5)"
                  fill="rgba(245,158,11,0.04)"/>
            <rect [attr.x]="padL" [attr.y]="yScale(0.25)" [attr.width]="innerW" [attr.height]="yScale(0) - yScale(0.25)"
                  fill="rgba(34,197,94,0.06)"/>

            <!-- Gradient fill under line -->
            <defs>
              <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.3"/>
                <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
              </linearGradient>
            </defs>
            <polygon *ngIf="fillPoints" [attr.points]="fillPoints" fill="url(#lineGrad)"/>

            <!-- Line -->
            <polyline *ngIf="linePoints"
              [attr.points]="linePoints"
              fill="none" stroke="var(--accent)" stroke-width="2.5"
              stroke-linejoin="round" stroke-linecap="round"/>

            <!-- Data points -->
            <ng-container *ngFor="let cp of chartPoints; let i = index">
              <circle
                [attr.cx]="cp.x" [attr.cy]="cp.y" r="5"
                [attr.fill]="riskColor(cp.point.risk_level)"
                stroke="var(--surface)" stroke-width="2"
                style="cursor:pointer"
                (mouseenter)="hoveredIdx = i"
                (mouseleave)="hoveredIdx = -1"
              />
              <!-- Tooltip -->
              <g *ngIf="hoveredIdx === i">
                <rect
                  [attr.x]="tooltipX(cp.x)" [attr.y]="cp.y - 52"
                  width="120" height="46" rx="6"
                  fill="var(--surface)" stroke="var(--border)" stroke-width="1"/>
                <text [attr.x]="tooltipX(cp.x) + 8" [attr.y]="cp.y - 34"
                      fill="var(--text)" font-size="11" font-weight="600">
                  {{ (cp.point.risk_score * 100).toFixed(0) }}% — {{ cp.point.risk_level | uppercase }}
                </text>
                <text [attr.x]="tooltipX(cp.x) + 8" [attr.y]="cp.y - 19"
                      fill="var(--muted2)" font-size="10">
                  {{ cp.point.predicted_at | date:'dd MMM, HH:mm' }}
                </text>
                <text *ngIf="cp.point.predicted_gpa" [attr.x]="tooltipX(cp.x) + 8" [attr.y]="cp.y - 7"
                      fill="var(--muted2)" font-size="10">
                  GPA {{ cp.point.predicted_gpa }}
                </text>
              </g>
            </ng-container>

            <!-- X-axis labels (first, last, and every ~4th) -->
            <ng-container *ngFor="let cp of chartPoints; let i = index">
              <text *ngIf="i === 0 || i === chartPoints.length - 1 || i % 4 === 0"
                    [attr.x]="cp.x" [attr.y]="chartH + padB - 2"
                    text-anchor="middle" fill="var(--muted)" font-size="9">
                {{ cp.point.predicted_at | date:'dd/MM' }}
              </text>
            </ng-container>
          </svg>
        </div>

        <!-- Trend indicator -->
        <div style="display:flex;gap:16px;margin-top:12px;font-size:13px">
          <div>
            Trend:
            <strong [style.color]="trendColor">{{ trendLabel }}</strong>
          </div>
          <div style="color:var(--muted2)">
            {{ history.length }} prediction{{ history.length === 1 ? '' : 's' }} recorded
          </div>
          <div *ngIf="history[history.length-1]?.predicted_gpa" style="color:var(--muted2)">
            Latest predicted GPA: <strong style="color:var(--text)">{{ history[history.length-1].predicted_gpa }}</strong>
          </div>
        </div>
      </ng-container>
    </div>

    <!-- Attendance history -->
    <div class="card" style="margin-top:20px">
      <div class="card-title">Attendance history</div>
      <div *ngIf="attendance.length === 0" class="empty-state">No attendance records yet.</div>
      <div *ngIf="attendance.length > 0">
        <div class="att-bars">
          <div class="att-bar-wrap" *ngFor="let a of attendance.slice(-12)">
            <div class="att-bar" [ngClass]="attColor(a.attendance_rate)"
                 [style.height.px]="Math.max(4, a.attendance_rate * 72)"></div>
            <div class="att-week">W{{ a.week_number }}</div>
          </div>
        </div>
        <div style="font-size:12px;color:var(--muted2);margin-top:10px">
          Overall attendance:
          <strong style="color:var(--text)">
            {{ overallAttendance | number:'1.0-1' }}%
          </strong>
          across {{ attendance.length }} week(s)
        </div>
      </div>
    </div>

    <!-- Interventions -->
    <div class="card" style="margin-top:20px">
      <div class="card-title">Log intervention</div>
      <div class="form-row">
        <div class="form-group">
          <label>Type</label>
          <select [(ngModel)]="intType">
            <option value="tutoring">Tutoring session</option>
            <option value="counseling">Counseling referral</option>
            <option value="alert">Lecturer alert</option>
            <option value="resource">Learning resource</option>
          </select>
        </div>
        <div class="form-group">
          <label>Description</label>
          <input type="text" [(ngModel)]="intDesc" placeholder="Describe the planned intervention...">
        </div>
      </div>
      <button class="btn-sm primary" (click)="createIntervention()" [disabled]="savingInt">
        {{ savingInt ? 'Saving...' : 'Log intervention' }}
      </button>
      <div *ngIf="intSuccess" style="color:var(--green);font-size:13px;margin-top:8px">✓ {{ intSuccess }}</div>

      <div *ngIf="interventions.length > 0" style="margin-top:20px">
        <div class="card-title">Previous interventions</div>
        <div *ngFor="let iv of interventions" class="alert-item" [ngClass]="iv.is_actioned ? '' : 'high'">
          <div>{{ iv.is_actioned ? '✓' : '◐' }}</div>
          <div>
            <div style="font-weight:600;font-size:13px">{{ iv.intervention_type }} — {{ iv.description }}</div>
            <div class="alert-meta">{{ iv.created_at | date:'mediumDate' }} · by {{ iv.recommended_by }}</div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class StudentDetailComponent implements OnInit {
  studentId = '';
  prediction: PredictionOut | null = null;
  history: PredictionHistoryPoint[] = [];
  attendance: AttendanceOut[] = [];
  interventions: InterventionOut[] = [];
  loadingPred = true;
  predError = '';
  intType = 'tutoring';
  intDesc = '';
  savingInt = false;
  intSuccess = '';
  icons = ['📚', '👤', '⚠️', '⏰', '💬', '✅'];
  Math = Math;
  hoveredIdx = -1;

  // Chart layout constants
  readonly chartW = 600;
  readonly chartH = 160;
  readonly padL = 36;
  readonly padR = 16;
  readonly padT = 12;
  readonly padB = 24;

  constructor(
    private route: ActivatedRoute,
    private predService: PredictionService,
    private interventionService: InterventionService,
    private attendanceService: AttendanceService,
    private auth: AuthService,
  ) {}

  ngOnInit() {
    this.studentId = this.route.snapshot.paramMap.get('id')!;
    this.loadPrediction();
    this.loadHistory();
    this.loadAttendance();
    this.loadInterventions();
  }

  loadPrediction() {
    this.loadingPred = true;
    this.predService.getStudentPrediction(this.studentId).subscribe({
      next: p => { this.prediction = p; this.loadingPred = false; this.loadHistory(); },
      error: () => { this.predError = 'Not enough data to generate prediction yet.'; this.loadingPred = false; },
    });
  }

  refreshPrediction() { this.predError = ''; this.loadPrediction(); }

  loadHistory() {
    this.predService.getHistory(this.studentId).subscribe({
      next: h => this.history = h,
    });
  }

  loadAttendance() {
    this.attendanceService.getForStudent(this.studentId).subscribe({
      next: data => this.attendance = data,
    });
  }

  loadInterventions() {
    this.interventionService.getForStudent(this.studentId).subscribe({
      next: data => this.interventions = data,
    });
  }

  createIntervention() {
    if (!this.intDesc) return;
    this.savingInt = true;
    this.interventionService.create({
      student_id: this.studentId,
      intervention_type: this.intType as any,
      description: this.intDesc,
      recommended_by: this.auth.currentUser?.full_name ?? 'system',
    }).subscribe({
      next: iv => {
        this.interventions.unshift(iv);
        this.intDesc = '';
        this.savingInt = false;
        this.intSuccess = 'Intervention logged successfully';
        setTimeout(() => this.intSuccess = '', 3000);
      },
      error: () => { this.savingInt = false; },
    });
  }

  // ── Chart helpers ─────────────────────────────────────────────

  get innerW(): number { return this.chartW - this.padL - this.padR; }

  yScale(score: number): number {
    return this.padT + (1 - score) * this.chartH;
  }

  xScale(i: number): number {
    if (this.history.length < 2) return this.padL;
    return this.padL + (i / (this.history.length - 1)) * this.innerW;
  }

  get chartPoints(): ChartPoint[] {
    return this.history.map((p, i) => ({
      x: this.xScale(i),
      y: this.yScale(p.risk_score),
      point: p,
    }));
  }

  get linePoints(): string {
    return this.chartPoints.map(p => `${p.x},${p.y}`).join(' ');
  }

  get fillPoints(): string {
    if (!this.chartPoints.length) return '';
    const first = this.chartPoints[0];
    const last = this.chartPoints[this.chartPoints.length - 1];
    const bottom = this.yScale(0);
    return [
      ...this.chartPoints.map(p => `${p.x},${p.y}`),
      `${last.x},${bottom}`,
      `${first.x},${bottom}`,
    ].join(' ');
  }

  tooltipX(cx: number): number {
    // Keep tooltip inside the SVG
    return cx + 120 > this.chartW ? cx - 128 : cx + 8;
  }

  riskColor(level: string): string {
    const map: Record<string, string> = {
      low: '#22c55e', medium: '#f59e0b', high: '#ef4444', critical: '#dc2626',
    };
    return map[level] ?? 'var(--accent)';
  }

  get trendLabel(): string {
    if (this.history.length < 2) return '—';
    const delta = this.history[this.history.length - 1].risk_score - this.history[0].risk_score;
    if (delta > 0.05) return '▲ Increasing risk';
    if (delta < -0.05) return '▼ Improving';
    return '→ Stable';
  }

  get trendColor(): string {
    if (this.history.length < 2) return 'var(--muted2)';
    const delta = this.history[this.history.length - 1].risk_score - this.history[0].risk_score;
    if (delta > 0.05) return 'var(--red)';
    if (delta < -0.05) return 'var(--green)';
    return 'var(--amber)';
  }

  // ── Existing helpers ──────────────────────────────────────────

  get riskPct(): number {
    return Math.round((this.prediction?.risk_score ?? 0) * 100);
  }

  get circleGradient(): string {
    const colors: Record<string, string> = {
      low: 'var(--green)', medium: 'var(--amber)', high: 'var(--red)', critical: 'var(--red)',
    };
    const c = colors[this.prediction?.risk_level ?? 'low'];
    return `conic-gradient(${c} ${this.riskPct}%, var(--surface2) 0)`;
  }

  get overallAttendance(): number {
    if (!this.attendance.length) return 0;
    const totalHeld = this.attendance.reduce((s, a) => s + a.classes_held, 0);
    const totalAtt = this.attendance.reduce((s, a) => s + a.classes_attended, 0);
    return totalHeld ? (totalAtt / totalHeld) * 100 : 0;
  }

  barWidth(impact: number): number {
    return Math.min(Math.abs(impact) * 300, 100);
  }

  attColor(rate: number): string {
    if (rate >= 0.8) return 'att-good';
    if (rate >= 0.6) return 'att-warn';
    return 'att-bad';
  }
}
