import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CourseService, ResultsService, StudentService } from '../../core/services/api.services';
import { CourseOut, CourseCreate, AssessmentOut, StudentProfile, AssessmentResultOut } from '../../core/models';

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
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div class="card-title" style="margin:0">Courses &amp; assessments</div>
        <button class="btn-sm primary" (click)="showCourseForm = !showCourseForm">+ Add course</button>
      </div>
      <div *ngIf="courseSuccess" style="color:var(--green);font-size:13px;margin-bottom:12px">✓ Course created successfully</div>

      <!-- Course creation form -->
      <div *ngIf="showCourseForm" style="margin-bottom:20px;padding:16px;border:1px solid var(--border);border-radius:8px">
        <div class="card-title">New course</div>
        <div class="form-row">
          <div class="form-group">
            <label>Course code</label>
            <input type="text" [(ngModel)]="newCourse.course_code" placeholder="CS401">
          </div>
          <div class="form-group">
            <label>Course name</label>
            <input type="text" [(ngModel)]="newCourse.course_name" placeholder="Algorithms">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Credits</label>
            <input type="number" [(ngModel)]="newCourse.credits" min="1" max="6">
          </div>
          <div class="form-group">
            <label>Semester</label>
            <select [(ngModel)]="newCourse.semester">
              <option [ngValue]="1">Semester 1</option>
              <option [ngValue]="2">Semester 2</option>
            </select>
          </div>
          <div class="form-group">
            <label>Academic year</label>
            <input type="number" [(ngModel)]="newCourse.year" placeholder="2024">
          </div>
        </div>
        <div style="display:flex;gap:12px;align-items:center">
          <button class="btn-sm primary" (click)="saveCourse()" [disabled]="savingCourse">
            {{ savingCourse ? 'Saving...' : 'Create course' }}
          </button>
          <button class="btn-sm secondary" (click)="showCourseForm = false">Cancel</button>
          <span *ngIf="courseError" style="color:var(--red);font-size:13px">{{ courseError }}</span>
        </div>
      </div>

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

  showCourseForm = false;
  savingCourse = false;
  courseSuccess = false;
  courseError = '';
  newCourse: CourseCreate = {
    course_code: '', course_name: '', credits: 3, semester: 1,
    year: new Date().getFullYear(),
  };

  constructor(
    private courseService: CourseService,
    private resultsService: ResultsService,
    private studentService: StudentService,
  ) {}

  saveCourse() {
    if (!this.newCourse.course_code || !this.newCourse.course_name) return;
    this.savingCourse = true; this.courseError = '';
    this.courseService.create(this.newCourse).subscribe({
      next: course => {
        this.courses = [...this.courses, course];
        this.savingCourse = false;
        this.courseSuccess = true;
        this.showCourseForm = false;
        this.newCourse = {
          course_code: '', course_name: '', credits: 3, semester: 1,
          year: new Date().getFullYear(),
        };
        setTimeout(() => this.courseSuccess = false, 3000);
      },
      error: e => {
        this.savingCourse = false;
        this.courseError = e.error?.detail || 'Failed to create course';
      },
    });
  }

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
