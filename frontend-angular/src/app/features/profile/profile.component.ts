import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PredictionService } from '../../core/services/api.services';
import { PredictionOut } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { RiskFactorsComponent } from '../../shared/components/risk-factors/risk-factors.component';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, RiskFactorsComponent],
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

          <div class="card-title" style="margin-top:16px;margin-bottom:4px">What is affecting your score</div>
          <div style="font-size:12px;color:var(--muted2);margin-bottom:14px">
            Each factor below was assessed for you; the bar shows how much it moved your score.
          </div>
          <app-risk-factors [factors]="prediction.risk_factors"></app-risk-factors>

          <div style="font-size:12px;color:var(--muted2);margin-top:16px">
            Last updated: {{ prediction.predicted_at | date:'mediumDate' }}
          </div>
        </div>
      </div>

      <!-- Recommendations only exist once there is a prediction to base them on -->
      <div class="card" *ngIf="prediction && !loading">
        <div class="card-title">Personalised recommendations</div>
        <div class="rec-item" *ngFor="let r of prediction.recommendations; let i = index">
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

}
