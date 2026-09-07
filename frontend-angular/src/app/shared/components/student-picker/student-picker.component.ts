import { Component, EventEmitter, Input, Output, HostListener, ElementRef, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { StudentService } from '../../../core/services/api.services';
import { StudentProfile } from '../../../core/models';

/**
 * Searchable, scrollable student selector.
 *
 * A plain <select> would render one <option> per student — unusable once the
 * cohort runs to thousands. This queries the server as you type and shows a
 * short, scrollable result list instead.
 */
@Component({
  selector: 'app-student-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="picker">
      <input
        class="picker-input"
        type="text"
        [placeholder]="placeholder"
        [(ngModel)]="query"
        (ngModelChange)="onQueryChange($event)"
        (focus)="open()"
        (keydown)="onKeydown($event)"
        autocomplete="off">

      <button *ngIf="selected || query" class="picker-clear" type="button"
              (click)="clear()" title="Clear selection">✕</button>

      <div class="picker-panel" *ngIf="isOpen" (mousedown)="$event.preventDefault()">
        <div *ngIf="loading" class="picker-status"><span class="spinner"></span></div>

        <div *ngIf="!loading && results.length === 0" class="picker-status">
          No students match "{{ query }}".
        </div>

        <div *ngFor="let s of results; let i = index"
             class="picker-option"
             [class.active]="i === activeIndex"
             (mouseenter)="activeIndex = i"
             (click)="choose(s)">
          <span class="opt-main">{{ s.full_name }}</span>
          <span class="opt-sub">{{ s.student_number }} · {{ s.programme }} · Year {{ s.year_of_study }}</span>
        </div>

        <div *ngIf="!loading && total > results.length" class="picker-more">
          Showing {{ results.length }} of {{ total | number }} — keep typing to narrow the search
        </div>
      </div>
    </div>
  `,
})
export class StudentPickerComponent implements OnInit, OnDestroy {
  @Input() placeholder = 'Search students by name or number…';
  /** Currently selected student id (empty string when nothing is selected). */
  @Input() studentId = '';
  @Output() studentIdChange = new EventEmitter<string>();
  @Output() studentChange = new EventEmitter<StudentProfile | null>();

  query = '';
  results: StudentProfile[] = [];
  total = 0;
  loading = false;
  isOpen = false;
  activeIndex = 0;
  selected: StudentProfile | null = null;

  private readonly search$ = new Subject<string>();
  private sub?: Subscription;

  constructor(private students: StudentService, private host: ElementRef) {}

  ngOnInit() {
    this.sub = this.search$.pipe(
      debounceTime(250),
      distinctUntilChanged(),
      switchMap(term => {
        this.loading = true;
        return this.students.search({ search: term, limit: 25 });
      }),
    ).subscribe({
      next: page => {
        this.results = page.items;
        this.total = page.total;
        this.activeIndex = 0;
        this.loading = false;
      },
      error: () => { this.results = []; this.total = 0; this.loading = false; },
    });

    // Prime the list so the first click already shows something useful.
    this.search$.next('');
  }

  ngOnDestroy() { this.sub?.unsubscribe(); }

  open() {
    this.isOpen = true;
    if (this.results.length === 0 && !this.loading) this.search$.next(this.query);
  }

  onQueryChange(value: string) {
    this.isOpen = true;
    // Typing after a selection means the user is picking someone else.
    if (this.selected && value !== this.labelFor(this.selected)) this.setSelection(null);
    this.search$.next(value);
  }

  choose(s: StudentProfile) {
    this.setSelection(s);
    this.query = this.labelFor(s);
    this.isOpen = false;
  }

  clear() {
    this.setSelection(null);
    this.query = '';
    this.search$.next('');
  }

  onKeydown(event: KeyboardEvent) {
    if (!this.isOpen && ['ArrowDown', 'Enter'].includes(event.key)) { this.open(); return; }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.activeIndex = Math.min(this.activeIndex + 1, this.results.length - 1);
      this.scrollActiveIntoView();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.activeIndex = Math.max(this.activeIndex - 1, 0);
      this.scrollActiveIntoView();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const pick = this.results[this.activeIndex];
      if (pick) this.choose(pick);
    } else if (event.key === 'Escape') {
      this.isOpen = false;
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (!this.host.nativeElement.contains(event.target)) {
      this.isOpen = false;
      // A half-typed query with nothing chosen would otherwise linger.
      if (!this.selected) this.query = '';
    }
  }

  private setSelection(s: StudentProfile | null) {
    this.selected = s;
    this.studentId = s?.id ?? '';
    this.studentIdChange.emit(this.studentId);
    this.studentChange.emit(s);
  }

  private labelFor(s: StudentProfile): string {
    return `${s.full_name} — ${s.student_number}`;
  }

  private scrollActiveIntoView() {
    queueMicrotask(() => {
      const panel: HTMLElement | null = this.host.nativeElement.querySelector('.picker-panel');
      const option = panel?.querySelectorAll('.picker-option')[this.activeIndex] as HTMLElement | undefined;
      option?.scrollIntoView({ block: 'nearest' });
    });
  }
}
