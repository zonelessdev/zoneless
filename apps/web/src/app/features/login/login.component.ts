import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  inject,
} from '@angular/core';
import { Router } from '@angular/router';

import { MetaService, AuthService } from '../../core';
import { PageLoaderComponent } from '../../shared';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
  standalone: true,
  imports: [PageLoaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent implements OnInit {
  private readonly meta = inject(MetaService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  seo = {
    title: 'Sign In | Zoneless',
    description: 'Sign in to your Zoneless account',
    image: '',
    url: '/login',
    noIndex: true,
  };

  async ngOnInit(): Promise<void> {
    this.meta.SetMeta(this.seo);

    const token = this.GetTokenFromUrl();

    if (!token) {
      this.router.navigateByUrl('/session-expired?reason=link_invalid');
      return;
    }

    try {
      await this.auth.Exchange(token);
      this.router.navigateByUrl('/');
    } catch (err: unknown) {
      console.error('Login failed:', err);
      this.router.navigateByUrl('/session-expired?reason=link_expired');
    }
  }

  private GetTokenFromUrl(): string | null {
    const queryString = window.location.search;
    const urlParams = new URLSearchParams(queryString);
    return urlParams.get('token');
  }
}
