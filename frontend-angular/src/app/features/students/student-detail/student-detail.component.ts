import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PredictionService, InterventionService, AttendanceService, SemesterGPAService, StudentService } from '../../../core/services/api.services';
import { PredictionOut, PredictionHistoryPoint, InterventionOut, AttendanceOut, SemesterGPAOut, StudentProfile } from '../../../core/models';
import { AuthService } from '../../../core/services/auth.service';
import { RiskFactorsComponent } from '../../../shared/components/risk-factors/risk-factors.component';

interface ChartPoint { x: number; y: number; point: PredictionHistoryPoint; }

@Component({
  selector: 'app-student-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, RiskFactorsComponent],
  template: `
    <a routerLink="/students" class="btn-sm secondary" style="display:inline-block;margin-bottom:20px">← Back to students</a>

    <!-- Student details -->
    <div class="card" style="margin-bottom:20px" *ngIf="profile">
      <div style="display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap;align-items:flex-start">
        <div>
          <div style="font-family:var(--font-head);font-size:22px;font-weight:700;margin-bottom:6px">
            {{ profile.full_name }}
          </div>
          <div style="font-size:13px;color:var(--muted2);display:flex;gap:10px;flex-wrap:wrap;align-items:center">
            <span>{{ profile.student_number }}</span>
            <span>·</span><span>{{ profile.programme }}</span>
            <span>·</span><span>Year {{ profile.year_of_study }}</span>
            <span>·</span><span class="tag ses-{{ profile.ses_status }}">SES {{ profile.ses_status }}</span>
            <span *ngIf="profile.is_scholarship" class="tag" style="background:rgba(99,102,241,0.15);color:var(--accent2)">Scholarship</span>
            <span *ngIf="profile.is_employed_part_time" class="tag" style="background:var(--surface2);color:var(--muted2)">Works part-time</span>
            <span>·</span><span>{{ profile.distance_from_campus_km }} km from campus</span>
          </div>
        </div>

        <!-- Sign-in details: lets staff log in as this student for demos and support -->
        <div style="min-width:320px;flex:0 1 380px">
          <div class="card-title" style="margin-bottom:6px">Sign-in details</div>
          <div class="credential-row">
            <span class="credential-label">Email</span>
            <span class="credential-value">{{ profile.email }}</span>
            <button class="copy-btn" (click)="copy(profile.email)">{{ copied === profile.email ? 'Copied' : 'Copy' }}</button>
          </div>
          <div class="credential-row" *ngIf="isAdmin">
            <span class="credential-label">Password</span>
            <ng-container *ngIf="resetResult; else resetControls">
              <span class="credential-value">{{ resetResult.password }}</span>
              <button class="copy-btn" (click)="copy(resetResult.password)">{{ copied === resetResult.password ? 'Copied' : 'Copy' }}</button>
              <span style="color:var(--green);font-size:12px">✓ Reset</span>
            </ng-container>
            <ng-template #resetControls>
              <span style="color:var(--muted);font-size:12px">hidden</span>
              <button class="copy-btn" (click)="resetPassword()" [disabled]="resetting">
                {{ resetting ? 'Resetting…' : 'Reset to demo password' }}
              </button>
            </ng-template>
          </div>
          <div *ngIf="resetError" style="color:var(--red);font-size:12px;margin-top:6px">{{ resetError }}</div>
          <div *ngIf="!isAdmin" style="font-size:11px;color:var(--muted);margin-top:6px">
            Seeded demo accounts use the shared demo password. An admin can reset it from this page.
          </div>
        </div>
      </div>
    </div>

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

      <!-- Key risk assessment: only rendered once there is a prediction to explain -->
      <div class="card" *ngIf="prediction && !loadingPred">
        <div class="card-title" style="margin-bottom:4px">Key risk assessment</div>
        <div style="font-size:12px;color:var(--muted2);margin-bottom:16px">
          What the model assessed for this student and how each factor moved the score.
        </div>
        <app-risk-factors [factors]="prediction.risk_factors"></app-risk-factors>
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

    <!-- Semester GPA record -->
    <div class="card" style="margin-top:20px">
      <div class="card-title">Record semester GPA</div>
      <div class="form-row">
        <div class="form-group">
          <label>Academic year</label>
          <input type="number" [(ngModel)]="gpaForm.year" placeholder="2024">
        </div>
        <div class="form-group">
          <label>Semester</label>
          <select [(ngModel)]="gpaForm.semester">
            <option [ngValue]="1">Semester 1</option>
            <option [ngValue]="2">Semester 2</option>
          </select>
        </div>
        <div class="form-group">
          <label>GPA (0.0–4.0)</label>
          <input type="number" [(ngModel)]="gpaForm.gpa" min="0" max="4" step="0.1">
        </div>
      </div>
      <button class="btn-sm primary" (click)="saveGPA()" [disabled]="savingGpa">
        {{ savingGpa ? 'Saving...' : 'Save GPA' }}
      </button>
      <span *ngIf="gpaSuccess" style="color:var(--green);font-size:13px;margin-left:12px">✓ GPA recorded</span>
      <div *ngIf="semesterGpas.length > 0" style="margin-top:12px;font-size:12px;color:var(--muted2)">
        <span *ngFor="let g of semesterGpas" style="margin-right:16px">
          {{ g.year }} S{{ g.semester }}: <strong style="color:var(--text)">{{ g.gpa.toFixed(2) }}</strong>
        </span>
      </div>
    </div>
  `,
})
export class StudentDetailComponent implements OnInit {
  studentId = '';
  profile: StudentProfile | null = null;
  prediction: PredictionOut | null = null;
  copied = '';
  resetting = false;
  resetResult: { email: string; password: string } | null = null;
  resetError = '';
  history: PredictionHistoryPoint[] = [];
  attendance: AttendanceOut[] = [];
  interventions: InterventionOut[] = [];
  loadingPred = true;
  predError = '';
  intType = 'tutoring';
  intDesc = '';
  savingInt = false;
  intSuccess = '';
  semesterGpas: SemesterGPAOut[] = [];
  gpaForm = { year: new Date().getFullYear(), semester: 1, gpa: 2.5 };
  savingGpa = false;
  gpaSuccess = false;
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
    private gpaService: SemesterGPAService,
    private studentService: StudentService,
  ) {}

  get isAdmin(): boolean { return this.auth.hasRole('admin'); }

  ngOnInit() {
    this.studentId = this.route.snapshot.paramMap.get('id')!;
    this.loadPrediction();
    this.loadHistory();
    this.loadAttendance();
    this.loadInterventions();
    this.loadGPAs();
  }

  /** One request returns the profile and the current prediction together. */
  loadPrediction() {
    this.loadingPred = true;
    this.studentService.getStudentDashboard(this.studentId).subscribe({
      next: d => {
        this.profile = d.profile;
        this.prediction = d.current_risk;
        if (!d.current_risk) this.predError = 'Not enough data to generate a prediction yet.';
        this.loadingPred = false;
      },
      error: () => { this.predError = 'Could not load this student.'; this.loadingPred = false; },
    });
  }

  refreshPrediction() {
    this.predError = '';
    this.loadingPred = true;
    this.predService.getStudentPrediction(this.studentId).subscribe({
      next: p => { this.prediction = p; this.loadingPred = false; this.loadHistory(); },
      error: () => { this.predError = 'Not enough data to generate a prediction yet.'; this.loadingPred = false; },
    });
  }

  resetPassword() {
    this.resetting = true; this.resetError = '';
    this.studentService.resetPassword(this.studentId).subscribe({
      next: r => { this.resetResult = r; this.resetting = false; },
      error: e => { this.resetError = e.error?.detail || 'Could not reset password'; this.resetting = false; },
    });
  }

  copy(text: string) {
    navigator.clipboard?.writeText(text).then(() => {
      this.copied = text;
      setTimeout(() => { if (this.copied === text) this.copied = ''; }, 1500);
    }).catch(() => {});
  }

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

  loadGPAs() {
    this.gpaService.getForStudent(this.studentId).subscribe({
      next: data => this.semesterGpas = data,
    });
  }

  saveGPA() {
    this.savingGpa = true;
    this.gpaService.record({ ...this.gpaForm, student_id: this.studentId }).subscribe({
      next: g => {
        this.semesterGpas = [g, ...this.semesterGpas];
        this.savingGpa = false;
        this.gpaSuccess = true;
        setTimeout(() => this.gpaSuccess = false, 3000);
      },
      error: () => { this.savingGpa = false; },
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

  attColor(rate: number): string {
    if (rate >= 0.8) return 'att-good';
    if (rate >= 0.6) return 'att-warn';
    return 'att-bad';
  }
}
