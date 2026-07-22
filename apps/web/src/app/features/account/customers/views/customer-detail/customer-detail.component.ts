import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  WritableSignal,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import type {
  Customer,
  Invoice,
  PaymentIntent,
  Subscription as SubscriptionType,
} from '@zoneless/shared-types';
import { GetPaymentIntentListStatus } from '@zoneless/shared-types';
import { CustomerService } from '../../../../../data';
import { CustomerActionsService } from '../../services/customer-actions.service';
import { ActivatedRoute, Router } from '@angular/router';
import { CustomerActionsHostComponent } from '../../components/customer-actions-host/customer-actions-host.component';
import {
  PopupMenuAction,
  PopupMenuComponent,
  CopyTextComponent,
  PaginatedListComponent,
  PaginatedListColumn,
} from '../../../../../shared';
import { EventsListComponent } from '../../../components';
import { MetadataToArray } from '../../../util/metadata';
import { MetaService } from '../../../../../core';
import { Subscription } from 'rxjs';
import {
  FormatInvoiceFrequency,
  FormatInvoiceNumber,
} from '../../../invoices/util/invoice-display';
import {
  FormatShortDate,
  FormatSubscriptionBillingFrequency,
  FormatSubscriptionNextInvoice,
  FormatSubscriptionProduct,
  GetSubscriptionListStatus,
  GetSubscriptionPeriodProgress,
} from '../../../subscriptions/util/subscription-display';

@Component({
  selector: 'app-customer-detail',
  imports: [
    CustomerActionsHostComponent,
    PopupMenuComponent,
    DatePipe,
    EventsListComponent,
    CopyTextComponent,
    PaginatedListComponent,
  ],
  templateUrl: './customer-detail.component.html',
  styleUrl: './customer-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerDetailComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly customerService = inject(CustomerService);
  private readonly metaService = inject(MetaService);
  readonly actions = inject(CustomerActionsService);
  readonly MetadataToArray = MetadataToArray;

  customer: WritableSignal<Customer | null> = signal(null);
  loading: WritableSignal<boolean> = signal(false);
  detailsExpanded: WritableSignal<boolean> = signal(false);

  subscriptionColumns: PaginatedListColumn[] = [];
  subscriptionQueryParams: WritableSignal<Record<string, string>> = signal({});
  subscriptionExpand: WritableSignal<string[]> = signal([
    'items.data.price.product',
  ]);

  paymentColumns: PaginatedListColumn[] = [];
  paymentQueryParams: WritableSignal<Record<string, string>> = signal({});

  invoiceColumns: PaginatedListColumn[] = [];
  invoiceQueryParams: WritableSignal<Record<string, string>> = signal({});
  invoiceExpand: WritableSignal<string[]> = signal([
    'subscription.items.data.price',
  ]);

  private sub?: Subscription;

  customerActions: PopupMenuAction[] = [
    {
      title: 'Edit Customer',
      action: () => this.OnEdit(),
    },
    {
      title: 'Delete Customer',
      action: () => this.OnDelete(),
    },
  ];

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('customerId');
    if (!id) return;
    await this.LoadCustomer(id);
    this.metaService.SetMetaTitle(this.customer()?.name ?? 'Customer');
    this.InitSubscriptionList(id);
    this.InitPaymentList(id);
    this.InitInvoiceList(id);
    this.sub = this.actions.events$.subscribe((event) => {
      if (event.type === 'deleted' && event.customerId === id) {
        this.router.navigate(['/account/customers']);
      } else if (event.type === 'updated' && event.customer.id === id) {
        this.customer.set(event.customer);
      }
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  private async LoadCustomer(id: string): Promise<void> {
    this.loading.set(true);
    try {
      this.customer.set(await this.customerService.GetCustomer(id));
    } finally {
      this.loading.set(false);
    }
  }

  private InitSubscriptionList(customerId: string): void {
    this.subscriptionColumns = [
      {
        header: 'Product',
        field: 'product',
        type: 'text',
        bolded: true,
        progressGetter: (item: unknown) =>
          GetSubscriptionPeriodProgress(item as SubscriptionType),
        formatter: (item: unknown) =>
          FormatSubscriptionProduct(item as SubscriptionType),
      },
      {
        header: '',
        field: 'status',
        type: 'status',
        formatter: (item: unknown) =>
          GetSubscriptionListStatus(item as SubscriptionType),
      },
      {
        header: 'Frequency',
        field: 'frequency',
        type: 'text',
        dimmed: true,
        formatter: (item: unknown) =>
          FormatSubscriptionBillingFrequency(item as SubscriptionType),
      },
      {
        header: 'Next invoice',
        field: 'next_invoice',
        type: 'text',
        dimmed: true,
        formatter: (item: unknown) =>
          FormatSubscriptionNextInvoice(item as SubscriptionType),
      },
      {
        header: '',
        field: 'actions',
        type: 'actions',
        actions: [
          {
            title: 'Copy subscription ID',
            action: (item: SubscriptionType) => {
              void navigator.clipboard.writeText(item.id);
            },
          },
        ],
      },
    ];
    this.subscriptionQueryParams.set({ customer: customerId });
  }

  private InitPaymentList(customerId: string): void {
    this.paymentColumns = [
      {
        header: 'Amount',
        field: 'amount',
        type: 'currency-with-code',
        bolded: true,
      },
      {
        header: 'Status',
        field: 'status',
        type: 'status',
        formatter: (item: unknown) =>
          GetPaymentIntentListStatus((item as PaymentIntent).status),
      },
      {
        header: 'Description',
        field: 'description',
        type: 'text',
        dimmed: true,
        formatter: (item: unknown) => {
          const paymentIntent = item as PaymentIntent;
          return paymentIntent.description ?? '—';
        },
      },
      {
        header: 'Date',
        field: 'created',
        type: 'date',
        dimmed: true,
      },
    ];
    this.paymentQueryParams.set({ customer: customerId });
  }

  private InitInvoiceList(customerId: string): void {
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
    this.invoiceQueryParams.set({ customer: customerId });
  }

  OnSubscriptionClick(subscription: SubscriptionType): void {
    void this.router.navigate(['/account/subscriptions', subscription.id]);
  }

  OnPaymentClick(paymentIntent: PaymentIntent): void {
    void this.router.navigate(['/account/payments', paymentIntent.id]);
  }

  OnInvoiceClick(invoice: Invoice): void {
    void this.router.navigate(['/account/invoices', invoice.id]);
  }

  OnEdit(): void {
    const p = this.customer();
    if (p) this.actions.OpenEdit(p);
  }

  OnDelete(): void {
    const p = this.customer();
    if (p) this.actions.OpenDelete(p);
  }

  OnEditMetadata(): void {
    const p = this.customer();
    if (p) this.actions.OpenEditMetadata(p);
  }

  ToggleDetailsExpanded(): void {
    this.detailsExpanded.update((expanded) => !expanded);
  }
}
