import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { AuthService } from '../../../core';
import { ExpressHomeComponent } from './express-home/express-home.component';
import { FullHomeComponent } from './full-home/full-home.component';

@Component({
  selector: 'app-home',
  imports: [ExpressHomeComponent, FullHomeComponent],
  template: `
    @if (isFull()) {
    <app-full-home />
    } @else {
    <app-express-home />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  private readonly authService = inject(AuthService);

  isFull = computed(() => this.authService.dashboardType() === 'full');
}
