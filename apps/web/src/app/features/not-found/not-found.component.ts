import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { MetaService } from '../../core';

@Component({
  selector: 'app-not-found',
  templateUrl: './not-found.component.html',
  styleUrls: ['./not-found.component.scss'],
  standalone: true,
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundComponent {
  private readonly meta = inject(MetaService);

  seo = {
    title: 'Page Not Found | Zoneless',
    description: 'Page not found',
    image: '',
    url: '/not-found',
    noIndex: true,
  };

  constructor() {
    this.meta.SetMeta(this.seo);
  }
}
