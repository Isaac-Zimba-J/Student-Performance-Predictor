import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AttendanceService, CourseService, StudentService } from '../../core/services/api.services';
import { CourseOut, StudentProfile } from '../../core/models';

@Component({
  selector: 'app-attendance',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="card">
      <div class="card-title">Record weekly attendance</div>

      <div class="form-row">
        <div class="form-group">
          <label>Student</label>
          <select [(ngModel)]="form.student_id">
            <option value="">— select student —</option>
            <option *ngFor="let s of students" [value]="s.id">
              {{ s.student_number }} — {{ s.programme }} Yr{{ s.year_of_study }}
            </option>
          </select>
        </div>
        <div class="form-group">
          <label>Course</label>
          <select [(ngModel)]="form.course_id">
            <option value="">— select course —</option>
            <option *ngFor="let c of courses" [value]="c.id">
              {{ c.code }} — {{ c.name }}
            </option>
          </select>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Week number</label>
          <input type="number" [(ngModel)]="form.week_number" min="1" max="52">
        </div>
        <div class="form-group">
          <label>Classes held this week</label>
          <input type="number" [(ngModel)]="form.classes_held" min="0">
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Classes attended</label>
          <input type="number" [(ngModel)]="form.classes_attended" min="0">
        </div>
        <div class="form-group">
          <label>LMS logins this week</label>
          <input type="number" [(ngModel)]="form.lms_logins" min="0">
        </div>
      </div>

      <div class="form-group" style="max-width:300px">
        <label>Assignment submissions</label>
        <input type="number" [(ngModel)]="form.assignment_submissions" min="0">
      </div>

      <div *ngIf="form.classes_held > 0" style="margin-bottom:16px">
        <div style="font-size:13px;color:var(--muted2);margin-bottom:6px">Attendance rate this week</div>
        <div class="risk-meter" style="max-width:300px">
          <div class="risk-fill"
               [class]="attendanceRateClass"
               [style.width.%]="attendanceRatePct">
          </div>
        </div>
        <div style="font-size:12px;margin-top:4px" [style.color]="attendanceRateColor">
          {{ attendanceRatePct.toFixed(0) }}%
        </div>
      </div>

      <div style="display:flex;gap:12px;align-items:center;margin-top:8px">
        <button class="btn-sm primary" (click)="submit()" [disabled]="saving || !canSubmit">
          {{ saving ? 'Saving...' : 'Record attendance' }}
        </button>
        <button class="btn-sm secondary" (click)="reset()">Reset</button>
        <span *ngIf="success" style="color:var(--green);font-size:13px">✓ Attendance recorded</span>
        <span *ngIf="error" style="color:var(--red);font-size:13px">{{ error }}</span>
      </div>
    </div>

    <div class="card" style="margin-top:20px">
      <div class="card-title">Attendance rate guide</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
        <div class="stat-card low" style="padding:14px">
          <div class="stat-label">Good (≥80%)</div>
          <div style="font-size:20px;font-weight:700;color:var(--green)">≥80%</div>
          <div class="stat-sub">On track</div>
        </div>
        <div class="stat-card medium" style="padding:14px">
          <div class="stat-label">Warning (60–79%)</div>
          <div style="font-size:20px;font-weight:700;color:var(--amber)">60–79%</div>
          <div class="stat-sub">Monitor closely</div>
        </div>
        <div class="stat-card high" style="padding:14px">
          <div class="stat-label">Critical (&lt;60%)</div>
          <div style="font-size:20px;font-weight:700;color:var(--red)">&lt;60%</div>
          <div class="stat-sub">Immediate action</div>
        </div>
      </div>
    </div>
  `,
})
export class AttendanceComponent implements OnInit {
  courses: CourseOut[] = [];
  students: StudentProfile[] = [];

  form = {
    student_id: '', course_id: '', week_number: 1,
    classes_held: 3, classes_attended: 3, lms_logins: 0, assignment_submissions: 0,
  };
  saving = false;
  success = false;
  error = '';

  constructor(
    private attendanceService: AttendanceService,
    private courseService: CourseService,
    private studentService: StudentService,
  ) {}

  ngOnInit() {
    this.courseService.getAll().subscribe({ next: c => this.courses = c });
    this.studentService.getAll().subscribe({ next: s => this.students = s });
  }

  get attendanceRatePct(): number {
    if (!this.form.classes_held) return 0;
    return Math.min(100, (this.form.classes_attended / this.form.classes_held) * 100);
  }

  get attendanceRateClass(): string {
    const p = this.attendanceRatePct;
    if (p >= 80) return 'low';
    if (p >= 60) return 'medium';
    return 'high';
  }

  get attendanceRateColor(): string {
    const p = this.attendanceRatePct;
    if (p >= 80) return 'var(--green)';
    if (p >= 60) return 'var(--amber)';
    return 'var(--red)';
  }

  get canSubmit(): boolean {
    return !!(this.form.student_id && this.form.course_id);
  }

  submit() {
    this.saving = true; this.success = false; this.error = '';
    this.attendanceService.record(this.form).subscribe({
      next: () => {
        this.saving = false; this.success = true;
        setTimeout(() => this.success = false, 3000);
      },
      error: e => {
        this.saving = false;
        this.error = e.error?.detail || 'Failed to record attendance';
      },
    });
  }

  reset() {
    this.form = {
      student_id: '', course_id: '', week_number: 1,
      classes_held: 3, classes_attended: 3, lms_logins: 0, assignment_submissions: 0,
    };
    this.success = false; this.error = '';
  }
}
