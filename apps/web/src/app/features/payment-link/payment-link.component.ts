import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
  WritableSignal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { MetaService } from '../../core';
import { CheckoutSessionService } from '../../data/services/checkout-session.service';
import { PageLoaderComponent } from '../../shared';

@Component({
  selector: 'app-payment-link',
  imports: [PageLoaderComponent],
  templateUrl: './payment-link.component.html',
  styleUrl: './payment-link.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentLinkComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly checkoutSessionService = inject(CheckoutSessionService);
  private readonly metaService = inject(MetaService);

  loading: WritableSignal<boolean> = signal(true);
  errorMessage: WritableSignal<string | null> = signal(null);

  async ngOnInit(): Promise<void> {
    this.metaService.SetMetaTitle('Payment Link');
    const urlSlug = this.route.snapshot.paramMap.get('paymentLinkId');
    if (!urlSlug) {
      this.errorMessage.set('Payment link not found');
      this.loading.set(false);
      return;
    }

    try {
      const session = await this.checkoutSessionService.OpenPaymentLink(
        urlSlug
      );
      await this.router.navigate(['/c', session.url_slug], {
        replaceUrl: true,
      });
    } catch (error) {
      this.errorMessage.set(this.ErrorMessage(error));
      this.loading.set(false);
    }
  }

  private ErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) return error.message;
    return 'This payment link is unavailable.';
  }
}
