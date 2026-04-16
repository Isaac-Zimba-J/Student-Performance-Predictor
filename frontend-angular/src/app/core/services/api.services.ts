import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  PredictionOut, PredictionHistoryPoint, RiskSummary, StudentProfile, StudentDashboard,
  AttendanceCreate, AttendanceOut, InterventionCreate, InterventionOut,
  CourseOut, AssessmentResultCreate, AssessmentResultOut,
  SemesterGPACreate, SemesterGPAOut,
} from '../models';
import { environment } from '../../../environments/environment';

const API = environment.apiUrl;

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
}

// ── Student Service ───────────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class StudentService {
  constructor(private http: HttpClient) {}

  getAll(filters?: { programme?: string; year?: number }): Observable<StudentProfile[]> {
    let params = new HttpParams();
    if (filters?.programme) params = params.set('programme', filters.programme);
    if (filters?.year) params = params.set('year', filters.year.toString());
    return this.http.get<StudentProfile[]>(`${API}/students/`, { params });
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
