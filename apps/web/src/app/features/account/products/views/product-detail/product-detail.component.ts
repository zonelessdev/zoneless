import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import type { Product } from '@zoneless/shared-types';

@Component({
  selector: 'app-product-detail',
  imports: [],
  templateUrl: './product-detail.component.html',
  styleUrl: './product-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductDetailComponent {
  @Input() product: Product | null = null;
}
