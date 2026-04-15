import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PredictionService } from '../../core/services/api.services';
import { PredictionOut } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="grid-2">
      <div class="card">
        <div class="card-title">My academic risk</div>
        <div *ngIf="loading" class="empty-state"><div class="spinner"></div></div>
        <div *ngIf="error" class="empty-state">
          {{ error }}<br>
          <small>Your lecturer needs to log your attendance first.</small>
        </div>
        <div *ngIf="prediction && !loading">
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

          <div class="card-title" style="margin-top:16px">What is affecting your score</div>
          <div class="factor-item" *ngFor="let f of prediction.risk_factors">
            <div class="factor-header">
              <span class="factor-name">{{ f.factor }}</span>
              <span class="factor-val">{{ f.value }}</span>
            </div>
            <div class="factor-bar">
              <div class="factor-fill" [ngClass]="f.impact > 0 ? 'negative' : 'positive'"
                   [style.width.%]="barWidth(f.impact)"></div>
            </div>
          </div>

          <div style="font-size:12px;color:var(--muted2);margin-top:16px">
            Last updated: {{ prediction.predicted_at | date:'mediumDate' }}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Personalised recommendations</div>
        <div *ngIf="!prediction" class="empty-state">Waiting for prediction data…</div>
        <div class="rec-item" *ngFor="let r of prediction?.recommendations; let i = index">
          <span class="rec-icon">{{ icons[i] || '▸' }}</span>
          <span>{{ r }}</span>
        </div>
      </div>
    </div>
  `,
})
export class ProfileComponent implements OnInit {
  prediction: PredictionOut | null = null;
  loading = true;
  error = '';
  icons = ['📚', '👤', '⚠️', '⏰', '💬', '✅'];

  constructor(private predService: PredictionService, public auth: AuthService) {}

  ngOnInit() {
    this.predService.getMyPrediction().subscribe({
      next: p => { this.prediction = p; this.loading = false; },
      error: () => { this.error = 'No prediction available yet.'; this.loading = false; },
    });
  }

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

  barWidth(impact: number): number {
    return Math.min(Math.abs(impact) * 300, 100);
  }
}
