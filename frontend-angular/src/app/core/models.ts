// ── Enums ────────────────────────────────────────────────────
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type UserRole = 'student' | 'lecturer' | 'admin';
export type SESStatus = 'low' | 'middle' | 'high';
export type InterventionType = 'tutoring' | 'counseling' | 'alert' | 'resource';

// ── Auth ─────────────────────────────────────────────────────
export interface LoginRequest {
  email: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  role: UserRole;
  user_id: string;
  full_name: string;
}

export interface CurrentUser {
  id: string;
  full_name: string;
  role: UserRole;
  email: string;
}

// ── Student ───────────────────────────────────────────────────
export interface StudentProfile {
  id: string;
  student_number: string;
  full_name: string;
  programme: string;
  year_of_study: number;
  ses_status: SESStatus;
  is_scholarship: boolean;
  is_employed_part_time: boolean;
  distance_from_campus_km: number;
}

// ── Predictions ───────────────────────────────────────────────
export interface RiskFactorDetail {
  factor: string;
  impact: number;
  value: string;
}

export interface PredictionOut {
  student_id: string;
  student_name: string;
  student_number: string;
  risk_level: RiskLevel;
  risk_score: number;
  predicted_gpa: number | null;
  risk_factors: RiskFactorDetail[];
  recommendations: string[];
  model_version: string;
  predicted_at: string;
}

export interface PredictionHistoryPoint {
  id: string;
  risk_level: RiskLevel;
  risk_score: number;
  predicted_gpa: number | null;
  predicted_at: string;
}

export interface RiskSummary {
  total_students: number;
  low_risk: number;
  medium_risk: number;
  high_risk: number;
  critical_risk: number;
  at_risk_percentage: number;
}

// ── Attendance ────────────────────────────────────────────────
export interface AttendanceCreate {
  student_id: string;
  course_id: string;
  week_number: number;
  classes_held: number;
  classes_attended: number;
  lms_logins: number;
  assignment_submissions: number;
}

export interface AttendanceOut extends AttendanceCreate {
  id: string;
  attendance_rate: number;
  recorded_at: string;
}

// ── Courses & Assessments ─────────────────────────────────────
export interface AssessmentOut {
  id: string;
  course_id: string;
  name: string;
  assessment_type: string;
  max_marks: number;
  weight_percent: number;
}

export interface CourseOut {
  id: string;
  code: string;
  name: string;
  credits: number;
  semester: number;
  academic_year: string;
  total_classes: number;
  assessments: AssessmentOut[];
}

export interface AssessmentResultCreate {
  student_id: string;
  assessment_id: string;
  marks_obtained: number | null;
  submitted_on_time: boolean;
}

// ── Assessment ────────────────────────────────────────────────
export interface AssessmentResultOut {
  id: string;
  student_id: string;
  assessment_id: string;
  marks_obtained: number | null;
  submitted_on_time: boolean;
  percentage: number | null;
  recorded_at: string;
}

// ── Interventions ─────────────────────────────────────────────
export interface InterventionCreate {
  student_id: string;
  intervention_type: InterventionType;
  description: string;
  recommended_by: string;
}

export interface InterventionOut {
  id: string;
  student_id: string;
  intervention_type: string;
  description: string;
  recommended_by: string;
  is_actioned: boolean;
  outcome_note: string | null;
  created_at: string;
  actioned_at: string | null;
}

// ── Semester GPA ──────────────────────────────────────────────
export interface SemesterGPACreate {
  student_id: string;
  semester: number;
  year: number;
  gpa: number;
}

export interface SemesterGPAOut {
  id: string;
  student_id: string;
  semester: number;
  year: number;
  gpa: number;
}

// ── Dashboard ─────────────────────────────────────────────────
export interface StudentDashboard {
  profile: StudentProfile;
  current_risk: PredictionOut | null;
  attendance_summary: {
    total_classes_held: number;
    total_classes_attended: number;
    attendance_rate: number;
    weeks_tracked: number;
  };
  recent_results: AssessmentResultOut[];
  pending_interventions: InterventionOut[];
}
