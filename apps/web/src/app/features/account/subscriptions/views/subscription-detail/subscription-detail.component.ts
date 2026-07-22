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
import type { Invoice, Subscription } from '@zoneless/shared-types';
import { Subscription as RxSubscription } from 'rxjs';
import { SubscriptionService } from '../../../../../data';
import { MetaService } from '../../../../../core';
import {
  CopyTextComponent,
  PaginatedListComponent,
  PaginatedListColumn,
  PopupMenuAction,
  PopupMenuComponent,
  StatusChipComponent,
} from '../../../../../shared';
import { EventsListComponent } from '../../../components';
import { MetadataToArray } from '../../../util/metadata';
import {
  FormatInvoiceCustomerEmail,
  FormatInvoiceFrequency,
  FormatInvoiceNumber,
} from '../../../invoices/util/invoice-display';
import { SubscriptionActionsService } from '../../services/subscription-actions.service';
import { SubscriptionActionsHostComponent } from '../../components/subscription-actions-host/subscription-actions-host.component';
import {
  FormatShortDate,
  FormatShortDateTime,
  FormatSubscriptionAmount,
  FormatSubscriptionBillingMethod,
  FormatSubscriptionBillingMode,
  FormatSubscriptionCustomerTitle,
  FormatSubscriptionDateRange,
  FormatSubscriptionDiscounts,
  FormatSubscriptionItemPrice,
  FormatSubscriptionItemProduct,
  FormatSubscriptionItemTotal,
  FormatSubscriptionPeriodRange,
  FormatSubscriptionProduct,
  GetSubscriptionCurrentPeriod,
  GetSubscriptionCustomerId,
  GetSubscriptionItemProductId,
  GetSubscriptionItemsTotalCents,
  GetUpcomingInvoicePreview,
} from '../../util/subscription-display';

@Component({
  selector: 'app-subscription-detail',
  imports: [
    SubscriptionActionsHostComponent,
    PopupMenuComponent,
    DatePipe,
    DecimalPipe,
    RouterLink,
    PaginatedListComponent,
    EventsListComponent,
    CopyTextComponent,
    StatusChipComponent,
  ],
  templateUrl: './subscription-detail.component.html',
  styleUrl: './subscription-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubscriptionDetailComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly subscriptionService = inject(SubscriptionService);
  private readonly metaService = inject(MetaService);
  readonly actions = inject(SubscriptionActionsService);

  readonly MetadataToArray = MetadataToArray;
  readonly FormatSubscriptionItemProduct = FormatSubscriptionItemProduct;
  readonly FormatSubscriptionItemPrice = FormatSubscriptionItemPrice;
  readonly FormatSubscriptionItemTotal = FormatSubscriptionItemTotal;
  readonly FormatSubscriptionPeriodRange = FormatSubscriptionPeriodRange;
  readonly FormatSubscriptionDateRange = FormatSubscriptionDateRange;
  readonly FormatSubscriptionBillingMode = FormatSubscriptionBillingMode;
  readonly FormatSubscriptionBillingMethod = FormatSubscriptionBillingMethod;
  readonly FormatSubscriptionDiscounts = FormatSubscriptionDiscounts;
  readonly FormatSubscriptionAmount = FormatSubscriptionAmount;
  readonly FormatShortDate = FormatShortDate;
  readonly FormatShortDateTime = FormatShortDateTime;
  readonly GetSubscriptionItemProductId = GetSubscriptionItemProductId;

  subscription: WritableSignal<Subscription | null> = signal(null);
  loading: WritableSignal<boolean> = signal(false);

  invoiceColumns: PaginatedListColumn[] = [];
  invoiceQueryParams: WritableSignal<Record<string, string>> = signal({});
  invoiceExpand: WritableSignal<string[]> = signal([
    'customer',
    'subscription.items.data.price',
  ]);

  readonly customerTitle = computed(() => {
    const sub = this.subscription();
    return sub ? FormatSubscriptionCustomerTitle(sub) : '';
  });

  readonly customerId = computed(() => {
    const sub = this.subscription();
    return sub ? GetSubscriptionCustomerId(sub) : null;
  });

  readonly productName = computed(() => {
    const sub = this.subscription();
    return sub ? FormatSubscriptionProduct(sub) : '—';
  });

  readonly currentPeriod = computed(() => {
    const sub = this.subscription();
    return sub ? GetSubscriptionCurrentPeriod(sub) : { start: null, end: null };
  });

  readonly upcomingInvoice = computed(() => {
    const sub = this.subscription();
    return sub ? GetUpcomingInvoicePreview(sub) : null;
  });

  readonly nextInvoiceAmount = computed(() => {
    const upcoming = this.upcomingInvoice();
    if (upcoming) return upcoming.total;
    const sub = this.subscription();
    return sub ? GetSubscriptionItemsTotalCents(sub) : 0;
  });

  readonly nextInvoiceDate = computed(() => {
    return this.upcomingInvoice()?.periodStart ?? null;
  });

  readonly hasMetadata = computed(() => {
    const metadata = this.subscription()?.metadata;
    return !!metadata && Object.keys(metadata).length > 0;
  });

  readonly subscriptionItems = computed(() => {
    return this.subscription()?.items?.data ?? [];
  });

  private sub?: RxSubscription;

  subscriptionActions: PopupMenuAction[] = [
    {
      title: 'Copy subscription ID',
      action: () => {
        const subscription = this.subscription();
        if (subscription) this.actions.CopySubscriptionId(subscription);
      },
    },
  ];

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('subscriptionId');
    if (!id) return;
    await this.LoadSubscription(id);
    this.metaService.SetMetaTitle(this.GetMetaTitle());
    this.InitInvoiceList(id);
    this.sub = this.actions.events$.subscribe((event) => {
      if (event.type === 'updated' && event.subscription.id === id) {
        void this.LoadSubscription(id);
      }
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  private async LoadSubscription(id: string): Promise<void> {
    this.loading.set(true);
    try {
      this.subscription.set(
        await this.subscriptionService.GetSubscription(id, [
          'customer',
          'items.data.price.product',
        ])
      );
    } finally {
      this.loading.set(false);
    }
  }

  private GetMetaTitle(): string {
    const sub = this.subscription();
    if (!sub) return 'Subscription';
    return `${FormatSubscriptionCustomerTitle(
      sub
    )} on ${FormatSubscriptionProduct(sub)}`;
  }

  private InitInvoiceList(subscriptionId: string): void {
    this.invoiceColumns = [
      {
        header: 'Total',
        field: 'total',
        type: 'currency-with-code',
        currencyField: 'currency',
        bolded: true,
      },
      {
        header: '',
        field: 'status',
        type: 'status',
        formatter: (item: unknown) => (item as Invoice).status ?? '',
      },
      {
        header: 'Frequency',
        field: 'parent',
        type: 'text',
        dimmed: true,
        formatter: (item: unknown) => FormatInvoiceFrequency(item as Invoice),
      },
      {
        header: 'Invoice number',
        field: 'number',
        type: 'text',
        dimmed: true,
        formatter: (item: unknown) => FormatInvoiceNumber(item as Invoice),
      },
      {
        header: 'Customer email',
        field: 'customer_email',
        type: 'text',
        dimmed: true,
        formatter: (item: unknown) =>
          FormatInvoiceCustomerEmail(item as Invoice),
      },
      {
        header: 'Due',
        field: 'due_date',
        type: 'text',
        dimmed: true,
        formatter: (item: unknown) => {
          const dueDate = (item as Invoice).due_date;
          return dueDate ? FormatShortDate(dueDate) : '—';
        },
      },
      {
        header: 'Created',
        field: 'created',
        type: 'date',
        dimmed: true,
        dateFormat: 'd MMM, HH:mm',
      },
      {
        header: '',
        field: '',
        type: 'actions',
        actions: [
          {
            title: 'Copy invoice ID',
            action: (item: Invoice) => {
              void navigator.clipboard.writeText(item.id);
            },
          },
        ],
      },
    ];
    this.invoiceQueryParams.set({ subscription: subscriptionId });
  }

  OnInvoiceClick(invoice: Invoice): void {
    this.router.navigate(['/account/invoices', invoice.id]);
  }

  OnEditMetadata(): void {
    const subscription = this.subscription();
    if (subscription) this.actions.OpenEditMetadata(subscription);
  }

  FormatAmount(cents: number): number {
    return cents / 100;
  }
}
