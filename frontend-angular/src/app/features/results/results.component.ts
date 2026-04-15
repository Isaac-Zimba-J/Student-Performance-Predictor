import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CourseService, ResultsService, StudentService } from '../../core/services/api.services';
import { CourseOut, AssessmentOut, StudentProfile, AssessmentResultOut } from '../../core/models';

@Component({
  selector: 'app-results',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start">

      <!-- Entry form -->
      <div class="card">
        <div class="card-title">Record assessment mark</div>

        <div class="form-group">
          <label>Student</label>
          <select [(ngModel)]="form.student_id" (ngModelChange)="onStudentChange()">
            <option value="">— select student —</option>
            <option *ngFor="let s of students" [value]="s.id">
              {{ s.student_number }} — {{ s.programme }} Yr{{ s.year_of_study }}
            </option>
          </select>
        </div>

        <div class="form-group">
          <label>Course</label>
          <select [(ngModel)]="selectedCourseId" (ngModelChange)="onCourseChange()">
            <option value="">— select course —</option>
            <option *ngFor="let c of courses" [value]="c.id">
              {{ c.code }} — {{ c.name }}
            </option>
          </select>
        </div>

        <div class="form-group">
          <label>Assessment</label>
          <select [(ngModel)]="form.assessment_id" [disabled]="!selectedCourseId">
            <option value="">— select assessment —</option>
            <option *ngFor="let a of filteredAssessments" [value]="a.id">
              {{ a.name }} ({{ a.assessment_type }}) — max {{ a.max_marks }} marks
            </option>
          </select>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Marks obtained</label>
            <input type="number" [(ngModel)]="marksInput"
                   [placeholder]="selectedAssessment ? 'Max ' + selectedAssessment.max_marks : '0'"
                   min="0" [max]="selectedAssessment?.max_marks ?? 100">
          </div>
          <div class="form-group">
            <label>Submitted on time?</label>
            <select [(ngModel)]="form.submitted_on_time">
              <option [ngValue]="true">Yes</option>
              <option [ngValue]="false">No</option>
            </select>
          </div>
        </div>

        <div *ngIf="selectedAssessment && marksInput !== null && marksInput !== undefined"
             style="margin-bottom:16px;font-size:13px;color:var(--muted2)">
          Score: <strong style="color:var(--text)">
            {{ ((marksInput / selectedAssessment.max_marks) * 100).toFixed(1) }}%
          </strong>
          &nbsp;({{ marksInput }} / {{ selectedAssessment.max_marks }})
        </div>

        <div style="display:flex;gap:12px;align-items:center">
          <button class="btn-sm primary" (click)="submit()" [disabled]="saving || !canSubmit">
            {{ saving ? 'Saving...' : 'Save mark' }}
          </button>
          <button class="btn-sm secondary" (click)="reset()">Clear</button>
          <span *ngIf="success" style="color:var(--green);font-size:13px">✓ Mark saved</span>
          <span *ngIf="error" style="color:var(--red);font-size:13px">{{ error }}</span>
        </div>
      </div>

      <!-- Recent results for selected student -->
      <div class="card">
        <div class="card-title">
          {{ form.student_id ? 'Results for ' + selectedStudentLabel : 'Student results' }}
        </div>

        <div *ngIf="!form.student_id" class="empty-state" style="padding:32px">
          <div class="empty-icon">📋</div>
          Select a student to view their results
        </div>

        <div *ngIf="form.student_id && loadingResults" class="empty-state" style="padding:32px">
          <div class="spinner"></div>
        </div>

        <div *ngIf="form.student_id && !loadingResults && studentResults.length === 0"
             class="empty-state" style="padding:32px">
          No results recorded yet.
        </div>

        <table class="student-table" *ngIf="studentResults.length > 0">
          <thead>
            <tr>
              <th>Assessment</th>
              <th>Marks</th>
              <th>%</th>
              <th>On time</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let r of studentResults">
              <td style="font-size:12px;color:var(--muted2)">{{ r.assessment_id | slice:0:8 }}…</td>
              <td>{{ r.marks_obtained ?? '—' }}</td>
              <td>
                <span *ngIf="r.percentage !== null"
                      [style.color]="r.percentage >= 50 ? 'var(--green)' : 'var(--red)'">
                  {{ r.percentage!.toFixed(1) }}%
                </span>
                <span *ngIf="r.percentage === null" style="color:var(--muted)">—</span>
              </td>
              <td>
                <span *ngIf="r.submitted_on_time" style="color:var(--green)">✓</span>
                <span *ngIf="!r.submitted_on_time" style="color:var(--red)">✗</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Course overview table -->
    <div class="card" style="margin-top:20px">
      <div class="card-title">Courses &amp; assessments</div>
      <div *ngIf="loadingCourses" class="empty-state"><div class="spinner"></div></div>
      <table class="student-table" *ngIf="!loadingCourses">
        <thead>
          <tr>
            <th>Code</th>
            <th>Course name</th>
            <th>Semester</th>
            <th>Assessments</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let c of courses">
            <td><strong>{{ c.code }}</strong></td>
            <td>{{ c.name }}</td>
            <td>Sem {{ c.semester }}</td>
            <td>
              <span *ngFor="let a of c.assessments" style="
                display:inline-block;margin-right:6px;margin-bottom:4px;
                padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;
                background:var(--surface2);color:var(--muted2);border:1px solid var(--border)">
                {{ a.name }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  `,
})
export class ResultsComponent implements OnInit {
  courses: CourseOut[] = [];
  students: StudentProfile[] = [];
  studentResults: AssessmentResultOut[] = [];

  selectedCourseId = '';
  marksInput: number | null = null;

  form: { student_id: string; assessment_id: string; submitted_on_time: boolean } = {
    student_id: '', assessment_id: '', submitted_on_time: true,
  };

  saving = false;
  success = false;
  error = '';
  loadingCourses = true;
  loadingResults = false;

  constructor(
    private courseService: CourseService,
    private resultsService: ResultsService,
    private studentService: StudentService,
  ) {}

  ngOnInit() {
    this.courseService.getAll().subscribe({
      next: c => { this.courses = c; this.loadingCourses = false; },
      error: () => this.loadingCourses = false,
    });
    this.studentService.getAll().subscribe({
      next: s => this.students = s,
    });
  }

  get filteredAssessments(): AssessmentOut[] {
    return this.courses.find(c => c.id === this.selectedCourseId)?.assessments ?? [];
  }

  get selectedAssessment(): AssessmentOut | undefined {
    return this.filteredAssessments.find(a => a.id === this.form.assessment_id);
  }

  get selectedStudentLabel(): string {
    const s = this.students.find(s => s.id === this.form.student_id);
    return s ? `${s.student_number}` : '';
  }

  get canSubmit(): boolean {
    return !!(this.form.student_id && this.form.assessment_id);
  }

  onCourseChange() {
    this.form.assessment_id = '';
  }

  onStudentChange() {
    if (!this.form.student_id) { this.studentResults = []; return; }
    this.loadingResults = true;
    this.resultsService.getForStudent(this.form.student_id).subscribe({
      next: r => { this.studentResults = r; this.loadingResults = false; },
      error: () => this.loadingResults = false,
    });
  }

  submit() {
    this.saving = true; this.success = false; this.error = '';
    const payload = {
      ...this.form,
      marks_obtained: this.marksInput,
    };
    this.resultsService.submit(payload).subscribe({
      next: result => {
        this.saving = false; this.success = true;
        // Refresh the student's results panel
        this.studentResults = [result, ...this.studentResults];
        setTimeout(() => this.success = false, 3000);
      },
      error: e => {
        this.saving = false;
        this.error = e.error?.detail || 'Failed to save mark';
      },
    });
  }

  reset() {
    this.form = { student_id: '', assessment_id: '', submitted_on_time: true };
    this.selectedCourseId = '';
    this.marksInput = null;
    this.studentResults = [];
    this.success = false; this.error = '';
  }
}
