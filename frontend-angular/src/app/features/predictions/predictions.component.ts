import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { StudentService, PredictionService } from '../../core/services/api.services';
import { StudentProfile, PredictionOut } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-predictions',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="card" style="margin-bottom:20px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <div class="card-title" style="margin:0 0 4px">Bulk risk predictions</div>
          <div style="font-size:13px;color:var(--muted2)">
            Click "Run prediction" on any student to generate their latest risk score.
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

    <div *ngIf="loading" class="empty-state"><div class="spinner"></div></div>

    <div *ngFor="let s of students" class="card" style="margin-bottom:12px">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="font-weight:600">{{ s.student_number }}</div>
          <div style="font-size:12px;color:var(--muted2)">{{ s.programme }} · Year {{ s.year_of_study }}</div>
        </div>

        <div style="display:flex;align-items:center;gap:16px">
          <ng-container *ngIf="predictions[s.id] as pred">
            <div style="text-align:right">
              <span class="risk-badge {{ pred.risk_level }}">
                <span class="risk-dot"></span>{{ pred.risk_level.toUpperCase() }}
              </span>
              <div style="font-size:11px;color:var(--muted2);margin-top:4px">
                Score: {{ (pred.risk_score * 100).toFixed(0) }}%
                <span *ngIf="pred.predicted_gpa"> · GPA: {{ pred.predicted_gpa }}</span>
              </div>
            </div>
            <a [routerLink]="['/students', s.id]" class="btn-sm secondary">Details →</a>
          </ng-container>

          <ng-container *ngIf="!predictions[s.id]">
            <button class="btn-sm primary"
                    (click)="runPrediction(s)"
                    [disabled]="running[s.id]">
              {{ running[s.id] ? 'Running...' : 'Run prediction' }}
            </button>
          </ng-container>
        </div>
      </div>

      <!-- Top risk factor bar for predicted students -->
      <div *ngIf="predictions[s.id] as pred" style="margin-top:14px">
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

    <div *ngIf="!loading && students.length === 0" class="empty-state">
      <div class="empty-icon">◎</div>
      No students found. Register students first.
    </div>
  `,
})
export class PredictionsComponent implements OnInit {
  students: StudentProfile[] = [];
  predictions: Record<string, PredictionOut> = {};
  running: Record<string, boolean> = {};
  loading = true;
  retraining = false;
  retrainMsg = '';
  retrainErr = false;

  constructor(
    private studentService: StudentService,
    private predService: PredictionService,
    public auth: AuthService,
  ) {}

  get isAdmin() { return this.auth.hasRole('admin'); }

  ngOnInit() {
    this.studentService.getAll().subscribe({
      next: data => { this.students = data; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  runPrediction(student: StudentProfile) {
    this.running[student.id] = true;
    this.predService.getStudentPrediction(student.id).subscribe({
      next: pred => {
        this.predictions[student.id] = pred;
        this.running[student.id] = false;
      },
      error: () => { this.running[student.id] = false; },
    });
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
}
