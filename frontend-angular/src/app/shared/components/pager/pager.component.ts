import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

/**
 * Page navigation for server-paged lists.
 *
 * Emits page changes rather than slicing data itself — the caller refetches,
 * so this stays correct no matter how large the underlying collection is.
 */
@Component({
  selector: 'app-pager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="pager" *ngIf="total > 0">
      <span class="pager-info">
        Showing <strong>{{ firstItem | number }}–{{ lastItem | number }}</strong>
        of <strong>{{ total | number }}</strong> {{ noun }}
      </span>

      <span class="pager-spacer"></span>

      <select class="pager-select" [ngModel]="pageSize" (ngModelChange)="changePageSize(+$event)"
              title="Rows per page">
        <option *ngFor="let size of pageSizes" [value]="size">{{ size }} per page</option>
      </select>

      <button class="pager-btn" (click)="go(0)" [disabled]="page === 0" title="First page">«</button>
      <button class="pager-btn" (click)="go(page - 1)" [disabled]="page === 0" title="Previous page">‹</button>

      <ng-container *ngFor="let p of pageWindow">
        <span *ngIf="p < 0" class="pager-ellipsis">…</span>
        <button *ngIf="p >= 0" class="pager-btn" [class.active]="p === page" (click)="go(p)">
          {{ p + 1 }}
        </button>
      </ng-container>

      <button class="pager-btn" (click)="go(page + 1)" [disabled]="page >= lastPage" title="Next page">›</button>
      <button class="pager-btn" (click)="go(lastPage)" [disabled]="page >= lastPage" title="Last page">»</button>
    </div>
  `,
})
export class PagerComponent {
  /** Zero-based current page. */
  @Input() page = 0;
  @Input() pageSize = 25;
  @Input() total = 0;
  @Input() noun = 'results';
  @Input() pageSizes = [25, 50, 100, 200];

  @Output() pageChange = new EventEmitter<number>();
  @Output() pageSizeChange = new EventEmitter<number>();

  get lastPage(): number {
    return Math.max(0, Math.ceil(this.total / this.pageSize) - 1);
  }

  get firstItem(): number {
    return this.total === 0 ? 0 : this.page * this.pageSize + 1;
  }

  get lastItem(): number {
    return Math.min(this.total, (this.page + 1) * this.pageSize);
  }

  /** Page numbers to render; -1 marks an ellipsis gap. */
  get pageWindow(): number[] {
    const last = this.lastPage;
    if (last <= 6) return Array.from({ length: last + 1 }, (_, i) => i);

    const window = new Set<number>([0, last, this.page]);
    for (const offset of [-1, 1]) {
      const p = this.page + offset;
      if (p > 0 && p < last) window.add(p);
    }

    const sorted = [...window].sort((a, b) => a - b);
    const out: number[] = [];
    sorted.forEach((p, i) => {
      if (i > 0 && p - sorted[i - 1] > 1) out.push(-1);
      out.push(p);
    });
    return out;
  }

  go(page: number) {
    const target = Math.max(0, Math.min(page, this.lastPage));
    if (target !== this.page) this.pageChange.emit(target);
  }

  changePageSize(size: number) {
    this.pageSizeChange.emit(size);
  }
}
