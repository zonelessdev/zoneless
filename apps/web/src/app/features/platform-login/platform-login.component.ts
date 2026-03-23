import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  inject,
  signal,
  WritableSignal,
} from '@angular/core';
import { Router } from '@angular/router';
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
  private readonly auth = inject(AuthService);

  seo = {
    title: 'Platform Login | Zoneless',
    description: 'Sign in to your Zoneless platform dashboard',
    image: '',
    url: '/platform-login',
    noIndex: true,
  };

  submitting: WritableSignal<boolean> = signal(false);
  apiKey: WritableSignal<string> = signal('');
  error: WritableSignal<string> = signal('');

  ngOnInit(): void {
    this.meta.SetMeta(this.seo);
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
