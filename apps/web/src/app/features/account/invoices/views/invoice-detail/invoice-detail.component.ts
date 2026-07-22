import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnDestroy,
  OnInit,
  signal,
  WritableSignal,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { Invoice, InvoicePayment } from '@zoneless/shared-types';
import { Subscription as RxSubscription } from 'rxjs';
import { InvoiceService } from '../../../../../data';
import { MetaService } from '../../../../../core';
import {
  CopyTextComponent,
  PopupMenuAction,
  PopupMenuComponent,
  StatusChipComponent,
} from '../../../../../shared';
import { EventsListComponent } from '../../../components';
import { MetadataToArray } from '../../../util/metadata';
import { InvoiceActionsService } from '../../services/invoice-actions.service';
import { InvoiceActionsHostComponent } from '../../components/invoice-actions-host/invoice-actions-host.component';
import {
  BuildInvoiceTimeline,
  FormatInvoiceAmount,
  FormatInvoiceBillingDetails,
  FormatInvoiceBillingMethod,
  FormatInvoiceCurrency,
  FormatInvoiceCustomerEmail,
  FormatInvoiceCustomerTitle,
  FormatInvoiceDiscountLabel,
  FormatInvoiceLineDescription,
  FormatInvoiceLinePeriod,
  FormatInvoiceNumber,
  FormatInvoicePaymentDescription,
  FormatInvoicePaymentMethods,
  FormatInvoicePaymentStatus,
  FormatInvoiceSubscriptionProduct,
  GetInvoiceCustomerId,
  GetInvoiceLineUnitAmount,
  GetInvoicePaymentTimestamp,
  GetInvoiceSubscriptionId,
  GetInvoiceSubscriptionStatus,
} from '../../util/invoice-display';

@Component({
  selector: 'app-invoice-detail',
  imports: [
    InvoiceActionsHostComponent,
    PopupMenuComponent,
    DatePipe,
    DecimalPipe,
    RouterLink,
    EventsListComponent,
    CopyTextComponent,
    StatusChipComponent,
  ],
  templateUrl: './invoice-detail.component.html',
  styleUrl: './invoice-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvoiceDetailComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly invoiceService = inject(InvoiceService);
  private readonly metaService = inject(MetaService);
  readonly actions = inject(InvoiceActionsService);

  readonly MetadataToArray = MetadataToArray;
  readonly FormatInvoiceNumber = FormatInvoiceNumber;
  readonly FormatInvoiceCustomerTitle = FormatInvoiceCustomerTitle;
  readonly FormatInvoiceCustomerEmail = FormatInvoiceCustomerEmail;
  readonly FormatInvoiceBillingMethod = FormatInvoiceBillingMethod;
  readonly FormatInvoiceBillingDetails = FormatInvoiceBillingDetails;
  readonly FormatInvoiceCurrency = FormatInvoiceCurrency;
  readonly FormatInvoiceAmount = FormatInvoiceAmount;
  readonly FormatInvoiceLineDescription = FormatInvoiceLineDescription;
  readonly FormatInvoiceLinePeriod = FormatInvoiceLinePeriod;
  readonly FormatInvoiceDiscountLabel = FormatInvoiceDiscountLabel;
  readonly FormatInvoicePaymentDescription = FormatInvoicePaymentDescription;
  readonly FormatInvoicePaymentMethods = FormatInvoicePaymentMethods;
  readonly FormatInvoicePaymentStatus = FormatInvoicePaymentStatus;
  readonly FormatInvoiceSubscriptionProduct = FormatInvoiceSubscriptionProduct;
  readonly GetInvoiceLineUnitAmount = GetInvoiceLineUnitAmount;
  readonly GetInvoicePaymentTimestamp = GetInvoicePaymentTimestamp;
  readonly GetInvoiceSubscriptionId = GetInvoiceSubscriptionId;
  readonly GetInvoiceSubscriptionStatus = GetInvoiceSubscriptionStatus;

  invoice: WritableSignal<Invoice | null> = signal(null);
  loading: WritableSignal<boolean> = signal(false);

  readonly customerTitle = computed(() => {
    const invoice = this.invoice();
    return invoice ? FormatInvoiceCustomerTitle(invoice) : '';
  });

  readonly customerId = computed(() => {
    const invoice = this.invoice();
    return invoice ? GetInvoiceCustomerId(invoice) : null;
  });

  readonly customerEmail = computed(() => {
    const invoice = this.invoice();
    if (!invoice) return null;
    const email = FormatInvoiceCustomerEmail(invoice);
    return email === '—' ? null : email;
  });

  readonly lineItems = computed(() => {
    return this.invoice()?.lines?.data ?? [];
  });

  readonly discountAmounts = computed(() => {
    return this.invoice()?.total_discount_amounts ?? [];
  });

  readonly payments = computed(() => {
    return this.invoice()?.payments?.data ?? [];
  });

  readonly timelineEvents = computed(() => {
    const invoice = this.invoice();
    return invoice ? BuildInvoiceTimeline(invoice) : [];
  });

  readonly hasMetadata = computed(() => {
    const metadata = this.invoice()?.metadata;
    return !!metadata && Object.keys(metadata).length > 0;
  });

  readonly subscriptionId = computed(() => {
    const invoice = this.invoice();
    return invoice ? GetInvoiceSubscriptionId(invoice) : null;
  });

  private sub?: RxSubscription;

  invoiceActions: PopupMenuAction[] = [
    {
      title: 'Copy invoice ID',
      action: () => {
        const invoice = this.invoice();
        if (invoice) this.actions.CopyInvoiceId(invoice);
      },
    },
  ];

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('invoiceId');
    if (!id) return;
    await this.LoadInvoice(id);
    this.metaService.SetMetaTitle(this.GetMetaTitle());
    this.sub = this.actions.events$.subscribe((event) => {
      if (event.type === 'updated' && event.invoice.id === id) {
        void this.LoadInvoice(id);
      }
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  private async LoadInvoice(id: string): Promise<void> {
    this.loading.set(true);
    try {
      this.invoice.set(
        await this.invoiceService.GetInvoice(id, [
          'customer',
          'subscription.items.data.price.product',
        ])
      );
    } finally {
      this.loading.set(false);
    }
  }

  private GetMetaTitle(): string {
    const invoice = this.invoice();
    if (!invoice) return 'Invoice';
    return FormatInvoiceNumber(invoice);
  }

  OnEditMetadata(): void {
    const invoice = this.invoice();
    if (invoice) this.actions.OpenEditMetadata(invoice);
  }

  OnPaymentClick(payment: InvoicePayment): void {
    const paymentIntent = payment.payment?.payment_intent;
    if (!paymentIntent) return;
    const paymentIntentId =
      typeof paymentIntent === 'string' ? paymentIntent : paymentIntent.id;
    void this.router.navigate(['/account/payments', paymentIntentId]);
  }

  HasPaymentIntent(payment: InvoicePayment): boolean {
    return !!payment.payment?.payment_intent;
  }

  FormatAmount(cents: number): number {
    return cents / 100;
  }
}
