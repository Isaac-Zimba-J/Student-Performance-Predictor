import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { Router } from '@angular/router';
import { CurrentUser, LoginRequest, TokenResponse } from '../models';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly API = environment.apiUrl;
  private _user$ = new BehaviorSubject<CurrentUser | null>(null);
  user$ = this._user$.asObservable();

  constructor(private http: HttpClient, private router: Router) {
    const stored = localStorage.getItem('academiq_user');
    if (stored) this._user$.next(JSON.parse(stored));
  }

  get currentUser(): CurrentUser | null { return this._user$.value; }
  get token(): string | null { return localStorage.getItem('academiq_token'); }
  get isLoggedIn(): boolean { return !!this.token; }

  login(data: LoginRequest): Observable<TokenResponse> {
    return this.http.post<TokenResponse>(`${this.API}/auth/login`, data).pipe(
      tap(res => {
        localStorage.setItem('academiq_token', res.access_token);
        const user: CurrentUser = {
          id: res.user_id, full_name: res.full_name,
          role: res.role, email: data.email,
        };
        localStorage.setItem('academiq_user', JSON.stringify(user));
        this._user$.next(user);
      })
    );
  }

  logout(): void {
    localStorage.removeItem('academiq_token');
    localStorage.removeItem('academiq_user');
    this._user$.next(null);
    this.router.navigate(['/login']);
  }

  register(payload: any): Observable<any> {
    const endpoint = payload.role === 'student'
      ? `${this.API}/auth/register/student`
      : `${this.API}/auth/register`;
    return this.http.post(endpoint, payload);
  }

  hasRole(...roles: string[]): boolean {
    return !!this.currentUser && roles.includes(this.currentUser.role);
  }
}
