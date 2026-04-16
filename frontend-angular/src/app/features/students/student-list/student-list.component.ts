import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { StudentService } from '../../../core/services/api.services';
import { StudentProfile } from '../../../core/models';

@Component({
  selector: 'app-student-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <div class="card-title" style="margin:0">All Students</div>
        <div style="display:flex;gap:10px">
          <input class="search-box" [(ngModel)]="searchQuery" (ngModelChange)="filterStudents()"
                 placeholder="🔍  Search by name or programme...">
          <select class="search-box" style="width:auto" [(ngModel)]="filterYear" (ngModelChange)="filterStudents()">
            <option value="">All years</option>
            <option *ngFor="let y of [1,2,3,4]" [value]="y">Year {{ y }}</option>
          </select>
        </div>
      </div>

      <div *ngIf="loading" class="empty-state"><div class="spinner"></div></div>
      <div *ngIf="error" class="empty-state" style="color:var(--red)">{{ error }}</div>

      <table class="student-table" *ngIf="!loading && !error">
        <thead>
          <tr>
            <th>Student number</th>
            <th>Programme</th>
            <th>Year</th>
            <th>SES status</th>
            <th>Scholarship</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let s of filtered">
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
          <tr *ngIf="filtered.length === 0">
            <td colspan="6" class="empty-state">No students match your search.</td>
          </tr>
        </tbody>
      </table>
    </div>
  `,
})
export class StudentListComponent implements OnInit {
  students: StudentProfile[] = [];
  filtered: StudentProfile[] = [];
  searchQuery = '';
  filterYear: number | '' = '';
  loading = true;
  error = '';

  constructor(private studentService: StudentService) {}

  ngOnInit() {
    this.studentService.getAll().subscribe({
      next: data => { this.students = data; this.filtered = data; this.loading = false; },
      error: () => { this.error = 'Could not load students — is the API running?'; this.loading = false; },
    });
  }

  filterStudents() {
    this.filtered = this.students.filter(s => {
      const q = this.searchQuery.toLowerCase();
      const matchesSearch = !q ||
        s.student_number.toLowerCase().includes(q) ||
        s.full_name.toLowerCase().includes(q) ||
        s.programme.toLowerCase().includes(q);
      const matchesYear = !this.filterYear || s.year_of_study === +this.filterYear;
      return matchesSearch && matchesYear;
    });
  }
}
