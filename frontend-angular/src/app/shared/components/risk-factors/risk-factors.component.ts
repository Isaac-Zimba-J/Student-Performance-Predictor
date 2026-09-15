import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RiskFactorDetail } from '../../../core/models';

/**
 * Renders a prediction's factor breakdown.
 *
 * Each factor's `impact` is its signed contribution to the risk score, so the
 * bar length is proportional to how much it moved the score and the colour
 * says which way: red raises risk, green protects, grey made no difference.
 */
@Component({
  selector: 'app-risk-factors',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="shown.length === 0" class="empty-state" style="padding:20px">
      No factors were assessed for this prediction.
    </div>

    <div class="factor-item" *ngFor="let f of shown" [class.compact]="compact">
      <div class="factor-header">
        <span class="factor-name">
          <span class="factor-dir" [ngClass]="direction(f)" [title]="directionLabel(f)">{{ arrow(f) }}</span>
          {{ f.factor }}
        </span>
        <span class="factor-val">{{ f.value }}</span>
      </div>
      <div class="factor-bar">
        <div class="factor-fill" [ngClass]="direction(f)" [style.width.%]="barWidth(f)"></div>
      </div>
      <div class="factor-detail" *ngIf="!compact && f.detail">{{ f.detail }}</div>
    </div>

    <div class="factor-legend" *ngIf="!compact && shown.length > 0">
      <span><i class="negative"></i> Raises risk</span>
      <span><i class="positive"></i> Protective</span>
      <span><i class="neutral"></i> No effect</span>
    </div>
  `,
})
export class RiskFactorsComponent {
  @Input() factors: RiskFactorDetail[] = [];
  /** Show only the first N factors (they arrive most-influential first). */
  @Input() limit = 0;
  /** Compact mode drops the explanation lines and legend — for list rows. */
  @Input() compact = false;

  /** Largest single weight in the rule-based model; a full bar means this much. */
  private readonly maxImpact = 0.4;

  get shown(): RiskFactorDetail[] {
    return this.limit > 0 ? this.factors.slice(0, this.limit) : this.factors;
  }

  direction(f: RiskFactorDetail): 'negative' | 'positive' | 'neutral' {
    if (f.impact > 0) return 'negative';
    if (f.impact < 0) return 'positive';
    return 'neutral';
  }

  directionLabel(f: RiskFactorDetail): string {
    return { negative: 'Raises risk', positive: 'Protective', neutral: 'No effect on score' }[this.direction(f)];
  }

  arrow(f: RiskFactorDetail): string {
    return { negative: '▲', positive: '▼', neutral: '–' }[this.direction(f)];
  }

  barWidth(f: RiskFactorDetail): number {
    return Math.min(Math.abs(f.impact) / this.maxImpact, 1) * 100;
  }
}
