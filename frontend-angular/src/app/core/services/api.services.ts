import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  PredictionOut, PredictionHistoryPoint, RiskSummary, StudentProfile, StudentDashboard,
  Page, StudentQuery, LatestPredictionRow,
  AttendanceCreate, AttendanceOut, InterventionCreate, InterventionOut,
  CourseOut, CourseCreate, AssessmentResultCreate, AssessmentResultOut,
  SemesterGPACreate, SemesterGPAOut,
} from '../models';
import { environment } from '../../../environments/environment';

const API = environment.apiUrl;

/**
 * Turn a full HTTP response into a `Page`, reading the unpaged total from the
 * `X-Total-Count` header the paged endpoints set. Falls back to the page length
 * when the header is missing (e.g. an older backend).
 */
function toPage<T>(res: HttpResponse<T[]>): Page<T> {
  const items = res.body ?? [];
  const header = res.headers.get('X-Total-Count');
  const total = header === null ? items.length : Number(header);
  return { items, total: Number.isFinite(total) ? total : items.length };
}

// ── Prediction Service ────────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class PredictionService {
  constructor(private http: HttpClient) {}

  getStudentPrediction(studentId: string): Observable<PredictionOut> {
    return this.http.get<PredictionOut>(`${API}/predictions/student/${studentId}`);
  }

  getMyPrediction(): Observable<PredictionOut> {
    return this.http.get<PredictionOut>(`${API}/predictions/my`);
  }

  getRiskSummary(): Observable<RiskSummary> {
    return this.http.get<RiskSummary>(`${API}/predictions/risk-summary`);
  }

  triggerTraining(): Observable<any> {
    return this.http.post(`${API}/predictions/train`, {});
  }

  getHistory(studentId: string): Observable<PredictionHistoryPoint[]> {
    return this.http.get<PredictionHistoryPoint[]>(`${API}/predictions/student/${studentId}/history`);
  }

  /**
   * Paged listing of the newest prediction per student, highest risk first —
   * one request instead of one per student.
   */
  getLatest(query: { search?: string; riskLevel?: string; skip?: number; limit?: number } = {}):
    Observable<Page<LatestPredictionRow>> {
    let params = new HttpParams()
      .set('skip', String(query.skip ?? 0))
      .set('limit', String(query.limit ?? 25));
    if (query.search?.trim()) params = params.set('search', query.search.trim());
    if (query.riskLevel) params = params.set('risk_level', query.riskLevel);

    return this.http
      .get<LatestPredictionRow[]>(`${API}/predictions/latest`, { params, observe: 'response' })
      .pipe(map(toPage));
  }
}

// ── Student Service ───────────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class StudentService {
  constructor(private http: HttpClient) {}

  /**
   * Paged, server-filtered student roster.
   * Searching and filtering run in SQL so the client never downloads the
   * whole cohort — essential once it runs to thousands of students.
   */
  search(query: StudentQuery = {}): Observable<Page<StudentProfile>> {
    let params = new HttpParams()
      .set('skip', String(query.skip ?? 0))
      .set('limit', String(query.limit ?? 50));
    if (query.search?.trim()) params = params.set('search', query.search.trim());
    if (query.programme) params = params.set('programme', query.programme);
    if (query.year) params = params.set('year', String(query.year));

    return this.http
      .get<StudentProfile[]>(`${API}/students/`, { params, observe: 'response' })
      .pipe(map(toPage));
  }

  /** Distinct programme names, for filter dropdowns. */
  getProgrammes(): Observable<string[]> {
    return this.http.get<string[]>(`${API}/students/programmes`);
  }

  getMyDashboard(): Observable<StudentDashboard> {
    return this.http.get<StudentDashboard>(`${API}/students/me/dashboard`);
  }

  getStudentDashboard(studentId: string): Observable<StudentDashboard> {
    return this.http.get<StudentDashboard>(`${API}/students/${studentId}/dashboard`);
  }
}

// ── Attendance Service ─────────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class AttendanceService {
  constructor(private http: HttpClient) {}

  record(data: AttendanceCreate): Observable<AttendanceOut> {
    return this.http.post<AttendanceOut>(`${API}/attendance/`, data);
  }

  getForStudent(studentId: string): Observable<AttendanceOut[]> {
    return this.http.get<AttendanceOut[]>(`${API}/attendance/student/${studentId}`);
  }
}

// ── Course Service ────────────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class CourseService {
  constructor(private http: HttpClient) {}

  getAll(): Observable<CourseOut[]> {
    return this.http.get<CourseOut[]>(`${API}/courses/`);
  }

  create(data: CourseCreate): Observable<CourseOut> {
    return this.http.post<CourseOut>(`${API}/courses/`, data);
  }
}

// ── Results Service ───────────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class ResultsService {
  constructor(private http: HttpClient) {}

  submit(data: AssessmentResultCreate): Observable<AssessmentResultOut> {
    return this.http.post<AssessmentResultOut>(`${API}/results/`, data);
  }

  getForStudent(studentId: string): Observable<AssessmentResultOut[]> {
    return this.http.get<AssessmentResultOut[]>(`${API}/results/student/${studentId}`);
  }
}

// ── Intervention Service ──────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class InterventionService {
  constructor(private http: HttpClient) {}

  create(data: InterventionCreate): Observable<InterventionOut> {
    return this.http.post<InterventionOut>(`${API}/interventions/`, data);
  }

  getForStudent(studentId: string, pendingOnly = false): Observable<InterventionOut[]> {
    let params = new HttpParams();
    if (pendingOnly) params = params.set('pending_only', 'true');
    return this.http.get<InterventionOut[]>(`${API}/interventions/student/${studentId}`, { params });
  }

  markActioned(id: string, outcomeNote?: string): Observable<InterventionOut> {
    return this.http.patch<InterventionOut>(`${API}/interventions/${id}`, {
      is_actioned: true,
      outcome_note: outcomeNote,
    });
  }
}

// ── Semester GPA Service ──────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class SemesterGPAService {
  constructor(private http: HttpClient) {}

  record(data: SemesterGPACreate): Observable<SemesterGPAOut> {
    return this.http.post<SemesterGPAOut>(`${API}/semester-gpa/`, data);
  }

  getForStudent(studentId: string): Observable<SemesterGPAOut[]> {
    return this.http.get<SemesterGPAOut[]>(`${API}/semester-gpa/student/${studentId}`);
  }
}
