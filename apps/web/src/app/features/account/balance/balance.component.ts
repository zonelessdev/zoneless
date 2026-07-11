import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { AuthService } from '../../../core';
import { ExpressBalanceComponent } from './views/express-balance/express-balance.component';
import { FullBalanceComponent } from './views/full-balance/full-balance.component';

@Component({
  selector: 'app-balance',
  imports: [ExpressBalanceComponent, FullBalanceComponent],
  template: `
    @if (isFull()) {
    <app-full-balance />
    } @else {
    <app-express-balance />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BalanceComponent {
  private readonly authService = inject(AuthService);

  isFull = computed(() => this.authService.dashboardType() === 'full');
}
