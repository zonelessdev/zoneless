import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  inject,
  signal,
  WritableSignal,
} from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { MetaService, AuthService } from '../../core';
import { LoaderComponent } from '../../shared';

@Component({
  selector: 'app-platform-login',
  templateUrl: './platform-login.component.html',
  styleUrls: ['./platform-login.component.scss'],
  standalone: true,
  imports: [FormsModule, LoaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformLoginComponent implements OnInit {
  private readonly meta = inject(MetaService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);

  submitting: WritableSignal<boolean> = signal(false);
  apiKey: WritableSignal<string> = signal('');
  error: WritableSignal<string> = signal('');

  ngOnInit(): void {
    this.meta.SetMetaTitle('Platform Login');

    // Support pre-issued login tokens (?token=...) from operator-managed
    // hosting, so users can sign in without pasting an API key
    const token = this.route.snapshot.queryParamMap.get('token');
    if (token) {
      this.LoginWithToken(token);
    }
  }

  async LoginWithToken(token: string): Promise<void> {
    this.error.set('');
    this.submitting.set(true);

    try {
      await this.auth.LoginWithToken(token);
      this.router.navigateByUrl('/');
    } catch (err: unknown) {
      console.error('Token login failed:', err);
      this.error.set('This login link is invalid or has expired');
      this.submitting.set(false);
    }
  }

  async LoginWithApiKey(): Promise<void> {
    const key = this.apiKey().trim();

    if (!key) {
      this.error.set('Please enter your API key');
      return;
    }

    this.error.set('');
    this.submitting.set(true);

    try {
      await this.auth.LoginWithApiKey(key);
      this.router.navigateByUrl('/');
    } catch (err: unknown) {
      console.error('API key login failed:', err);
      this.error.set(err instanceof Error ? err.message : 'Invalid API key');
    } finally {
      this.submitting.set(false);
    }
  }
}
