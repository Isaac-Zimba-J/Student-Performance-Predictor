import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { InterventionService, StudentService } from '../../core/services/api.services';
import { InterventionOut, StudentProfile } from '../../core/models';

@Component({
  selector: 'app-interventions',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <div class="card" style="margin-bottom:20px">
      <div class="card-title">Filter interventions</div>
      <div style="display:flex;gap:12px;align-items:center">
        <select class="search-box" style="width:220px" [(ngModel)]="selectedStudentId" (ngModelChange)="load()">
          <option value="">— Select a student —</option>
          <option *ngFor="let s of students" [value]="s.id">
            {{ s.student_number }} ({{ s.programme }})
          </option>
        </select>
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--muted2);cursor:pointer">
          <input type="checkbox" [(ngModel)]="pendingOnly" (ngModelChange)="load()">
          Pending only
        </label>
      </div>
    </div>

    <div *ngIf="!selectedStudentId" class="empty-state">
      <div class="empty-icon">◐</div>
      Select a student above to view their interventions.
    </div>

    <div *ngIf="selectedStudentId">
      <div *ngIf="loading" class="empty-state"><div class="spinner"></div></div>

      <div *ngIf="!loading && interventions.length === 0" class="empty-state">
        <div class="empty-icon">✓</div>
        No {{ pendingOnly ? 'pending' : '' }} interventions for this student.
      </div>

      <div *ngFor="let iv of interventions" class="card" style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div style="flex:1">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
              <span class="tag" [ngClass]="typeClass(iv.intervention_type)">
                {{ iv.intervention_type }}
              </span>
              <span *ngIf="iv.is_actioned" style="color:var(--green);font-size:12px;font-weight:600">✓ Actioned</span>
              <span *ngIf="!iv.is_actioned" style="color:var(--amber);font-size:12px;font-weight:600">● Pending</span>
            </div>
            <div style="font-size:14px;font-weight:500;margin-bottom:4px">{{ iv.description }}</div>
            <div style="font-size:12px;color:var(--muted2)">
              Logged {{ iv.created_at | date:'mediumDate' }} · by {{ iv.recommended_by }}
              <span *ngIf="iv.actioned_at"> · Actioned {{ iv.actioned_at | date:'mediumDate' }}</span>
            </div>
            <div *ngIf="iv.outcome_note" style="font-size:13px;color:var(--muted2);margin-top:8px;font-style:italic">
              "{{ iv.outcome_note }}"
            </div>
          </div>
          <div *ngIf="!iv.is_actioned" style="margin-left:20px">
            <input *ngIf="actioningId === iv.id"
                   type="text" [(ngModel)]="outcomeNote"
                   placeholder="Outcome note (optional)"
                   class="search-box" style="width:200px;margin-bottom:8px;display:block">
            <button *ngIf="actioningId !== iv.id" class="btn-sm primary" (click)="startAction(iv.id)">
              Mark actioned
            </button>
            <div *ngIf="actioningId === iv.id" style="display:flex;gap:8px">
              <button class="btn-sm primary" (click)="confirmAction(iv.id)" [disabled]="saving">
                {{ saving ? '...' : 'Confirm' }}
              </button>
              <button class="btn-sm secondary" (click)="actioningId = ''">Cancel</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class InterventionsComponent implements OnInit {
  students: StudentProfile[] = [];
  interventions: InterventionOut[] = [];
  selectedStudentId = '';
  pendingOnly = false;
  loading = false;
  actioningId = '';
  outcomeNote = '';
  saving = false;

  constructor(
    private ivService: InterventionService,
    private studentService: StudentService,
  ) {}

  ngOnInit() {
    this.studentService.getAll().subscribe({ next: d => this.students = d });
  }

  load() {
    if (!this.selectedStudentId) return;
    this.loading = true;
    this.ivService.getForStudent(this.selectedStudentId, this.pendingOnly).subscribe({
      next: data => { this.interventions = data; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  startAction(id: string) { this.actioningId = id; this.outcomeNote = ''; }

  confirmAction(id: string) {
    this.saving = true;
    this.ivService.markActioned(id, this.outcomeNote || undefined).subscribe({
      next: updated => {
        const idx = this.interventions.findIndex(i => i.id === id);
        if (idx >= 0) this.interventions[idx] = updated;
        this.actioningId = ''; this.saving = false;
      },
      error: () => { this.saving = false; },
    });
  }

  typeClass(type: string): string {
    const map: Record<string, string> = {
      tutoring: 'ses-high', counseling: 'ses-middle',
      alert: 'ses-low', resource: 'ses-high',
    };
    return map[type] || '';
  }
}
