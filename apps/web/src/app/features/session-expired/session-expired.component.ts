import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  inject,
  signal,
  WritableSignal,
} from '@angular/core';

import { MetaService } from '../../core';

type ExpiredReason =
  | 'link_expired'
  | 'link_invalid'
  | 'session_timeout'
  | 'unknown';

@Component({
  selector: 'app-session-expired',
  templateUrl: './session-expired.component.html',
  styleUrls: ['./session-expired.component.scss'],
  standalone: true,
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionExpiredComponent implements OnInit {
  private readonly meta = inject(MetaService);

  reason: WritableSignal<ExpiredReason> = signal('unknown');

  ngOnInit(): void {
    this.meta.SetMetaTitle('Session Expired');
    this.ParseReason();
  }

  private ParseReason(): void {
    const queryString = window.location.search;
    const urlParams = new URLSearchParams(queryString);
    const reason = urlParams.get('reason');

    if (
      reason === 'link_expired' ||
      reason === 'link_invalid' ||
      reason === 'session_timeout'
    ) {
      this.reason.set(reason);
    } else {
      this.reason.set('unknown');
    }
  }
}
