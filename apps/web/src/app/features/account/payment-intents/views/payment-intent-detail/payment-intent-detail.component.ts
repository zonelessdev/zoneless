import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  WritableSignal,
  OnInit,
  OnDestroy,
  computed,
} from '@angular/core';
import { DecimalPipe, DatePipe, TitleCasePipe } from '@angular/common';
import type {
  Charge,
  ChargePaymentMethodDetailsCrypto,
  Customer,
  PaymentIntent,
} from '@zoneless/shared-types';
import { ChargeService, PaymentIntentService } from '../../../../../data';
import { PaymentIntentActionsService } from '../../services/payment-intent-actions.service';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PaymentIntentActionsHostComponent } from '../../components/payment-intent-actions-host/payment-intent-actions-host.component';
import { CopyTextComponent, StatusChipComponent } from '../../../../../shared';
import { EventsListComponent } from '../../../components';
import { MetadataToArray } from '../../../util/metadata';
import { MetaService } from '../../../../../core';
import { Subscription } from 'rxjs';

interface TimelineEvent {
  title: string;
  timestamp: number;
  active: boolean;
}

@Component({
  selector: 'app-payment-intent-detail',
  imports: [
    PaymentIntentActionsHostComponent,
    DecimalPipe,
    DatePipe,
    TitleCasePipe,
    EventsListComponent,
    CopyTextComponent,
    StatusChipComponent,
    RouterLink,
  ],
  templateUrl: './payment-intent-detail.component.html',
  styleUrl: './payment-intent-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentIntentDetailComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly paymentIntentService = inject(PaymentIntentService);
  private readonly chargeService = inject(ChargeService);
  private readonly metaService = inject(MetaService);
  readonly actions = inject(PaymentIntentActionsService);
  readonly MetadataToArray = MetadataToArray;

  paymentIntent: WritableSignal<PaymentIntent | null> = signal(null);
  charge: WritableSignal<Charge | null> = signal(null);
  loading: WritableSignal<boolean> = signal(false);

  readonly customer = computed(() => {
    const customer = this.paymentIntent()?.customer;
    if (customer && typeof customer === 'object') {
      return customer as Customer;
    }
    return null;
  });

  readonly customerId = computed(() => {
    const customer = this.paymentIntent()?.customer;
    if (!customer) return null;
    if (typeof customer === 'string') return customer;
    return customer.id;
  });

  readonly cryptoDetails = computed(
    (): ChargePaymentMethodDetailsCrypto | null => {
      return this.charge()?.payment_method_details?.crypto ?? null;
    }
  );

  readonly feeAmount = computed(() => {
    const pi = this.paymentIntent();
    const charge = this.charge();
    return charge?.application_fee_amount ?? pi?.application_fee_amount ?? null;
  });

  readonly netAmount = computed(() => {
    const pi = this.paymentIntent();
    if (!pi) return 0;
    const fee = this.feeAmount() ?? 0;
    return (pi.amount_received || pi.amount) - fee;
  });

  readonly timelineEvents = computed((): TimelineEvent[] => {
    const pi = this.paymentIntent();
    if (!pi) return [];
    return this.BuildTimeline(pi, this.charge());
  });

  readonly hasMetadata = computed(() => {
    const metadata = this.paymentIntent()?.metadata;
    return !!metadata && Object.keys(metadata).length > 0;
  });

  private sub?: Subscription;

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('paymentIntentId');
    if (!id) return;
    await this.LoadPaymentIntent(id);
    this.metaService.SetMetaTitle(this.GetMetaTitle());
    this.sub = this.actions.events$.subscribe((event) => {
      if (event.type === 'updated' && event.paymentIntent.id === id) {
        void this.LoadPaymentIntent(id);
      }
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  private async LoadPaymentIntent(id: string): Promise<void> {
    this.loading.set(true);
    try {
      const paymentIntent = await this.paymentIntentService.GetPaymentIntent(
        id
      );
      this.paymentIntent.set(paymentIntent);

      if (paymentIntent.latest_charge) {
        try {
          const charge = await this.chargeService.GetCharge(
            paymentIntent.latest_charge
          );
          this.charge.set(charge);
        } catch (error) {
          console.error('Failed to load charge:', error);
          this.charge.set(null);
        }
      } else {
        this.charge.set(null);
      }
    } finally {
      this.loading.set(false);
    }
  }

  private GetMetaTitle(): string {
    const pi = this.paymentIntent();
    if (!pi) return 'Payment';
    return `$${(pi.amount / 100).toFixed(2)} ${pi.currency.toUpperCase()}`;
  }

  OnEditMetadata(): void {
    const pi = this.paymentIntent();
    if (pi) this.actions.OpenEditMetadata(pi);
  }

  FormatAmount(cents: number): number {
    return cents / 100;
  }

  FormatCurrency(currency: string | null | undefined): string {
    return (currency ?? 'usdc').toUpperCase();
  }

  ShortenAddress(address: string | null | undefined): string {
    if (!address) return '—';
    if (address.length <= 12) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  FormatPaymentMethodType(type: string): string {
    if (type === 'crypto') return 'Crypto';
    return type
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  FormatRiskLevel(riskLevel: string | null | undefined): string {
    if (!riskLevel) return 'not_assessed';
    return riskLevel;
  }

  GetChargedToLabel(): string | null {
    const crypto = this.cryptoDetails();
    if (crypto?.buyer_address) {
      return this.ShortenAddress(crypto.buyer_address);
    }
    const customer = this.customer();
    if (customer) {
      return customer.name ?? customer.email ?? customer.id;
    }
    return this.customerId();
  }

  GetExplorerUrl(txHash: string | null | undefined): string | null {
    if (!txHash) return null;
    const livemode = this.paymentIntent()?.livemode;
    const clusterParam = livemode === false ? '?cluster=devnet' : '';
    return `https://explorer.solana.com/tx/${txHash}${clusterParam}`;
  }

  OnViewOnBlockchain(): void {
    const url = this.GetExplorerUrl(this.cryptoDetails()?.transaction_hash);
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  private BuildTimeline(
    pi: PaymentIntent,
    charge: Charge | null
  ): TimelineEvent[] {
    const events: TimelineEvent[] = [];
    const startedAt = pi.created * 1000;
    const completedAt =
      (charge?.created ?? pi.canceled_at ?? pi.created) * 1000;

    if (pi.status === 'succeeded') {
      events.push({
        title: 'Payment succeeded',
        timestamp: completedAt,
        active: true,
      });
    } else if (pi.status === 'canceled') {
      events.push({
        title: 'Payment canceled',
        timestamp: completedAt,
        active: true,
      });
    } else if (pi.status === 'processing') {
      events.push({
        title: 'Payment processing',
        timestamp: completedAt,
        active: true,
      });
    } else if (pi.last_payment_error) {
      events.push({
        title: 'Payment failed',
        timestamp: completedAt,
        active: true,
      });
    } else if (pi.status === 'requires_action') {
      events.push({
        title: 'Requires action',
        timestamp: completedAt,
        active: true,
      });
    } else if (pi.status === 'requires_capture') {
      events.push({
        title: 'Requires capture',
        timestamp: completedAt,
        active: true,
      });
    } else if (pi.status === 'requires_confirmation') {
      events.push({
        title: 'Requires confirmation',
        timestamp: completedAt,
        active: true,
      });
    } else if (pi.status === 'requires_payment_method') {
      events.push({
        title: 'Requires payment method',
        timestamp: completedAt,
        active: true,
      });
    }

    events.push({
      title: 'Payment started',
      timestamp: startedAt,
      active: events.length === 0,
    });

    return events;
  }
}
