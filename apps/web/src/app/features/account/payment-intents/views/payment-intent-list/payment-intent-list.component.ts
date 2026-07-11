import {
  ChangeDetectionStrategy,
  Component,
  WritableSignal,
  signal,
  inject,
  OnInit,
} from '@angular/core';
import {
  PaginatedListComponent,
  PaginatedListColumn,
} from '../../../../../shared';
import { Router, ActivatedRoute } from '@angular/router';
import type { Customer, PaymentIntent } from '@zoneless/shared-types';
import { GetPaymentIntentListStatus } from '@zoneless/shared-types';
import { MetaService } from '../../../../../core';
import { PaymentIntentActionsHostComponent } from '../../components/payment-intent-actions-host/payment-intent-actions-host.component';
import { TransactionListComponent } from '../../../components';

type TransactionsTab = 'payments' | 'payouts' | 'topups' | 'transfers' | 'all';
type PaymentsStatusTab =
  | 'all'
  | 'succeeded'
  | 'incomplete'
  | 'canceled'
  | 'uncaptured';

@Component({
  selector: 'app-payment-intent-list',
  imports: [
    PaginatedListComponent,
    PaymentIntentActionsHostComponent,
    TransactionListComponent,
  ],
  templateUrl: './payment-intent-list.component.html',
  styleUrl: './payment-intent-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentIntentListComponent implements OnInit {
  readonly router = inject(Router);
  readonly route = inject(ActivatedRoute);
  private readonly metaService = inject(MetaService);

  transactionsTab: WritableSignal<TransactionsTab> = signal('payments');
  paymentsStatusTab: WritableSignal<PaymentsStatusTab> = signal('all');

  paymentIntentColumns: PaginatedListColumn[] = [
    {
      header: 'Amount',
      field: 'amount',
      type: 'currency-with-code',
      bolded: true,
    },
    {
      header: '',
      field: 'status',
      type: 'status',
      formatter: (item: unknown) =>
        GetPaymentIntentListStatus((item as PaymentIntent).status),
    },
    {
      header: 'Payment method',
      field: 'payment_method',
      type: 'text',
      formatter: (item: unknown) =>
        this.FormatPaymentMethod(item as PaymentIntent),
    },
    {
      header: 'Description',
      field: 'description',
      type: 'text',
      dimmed: true,
      formatter: (item: unknown) => {
        const paymentIntent = item as PaymentIntent;
        return paymentIntent.description ?? paymentIntent.id;
      },
    },
    {
      header: 'Customer',
      field: 'customer',
      type: 'text',
      dimmed: true,
      formatter: (item: unknown) => this.FormatCustomer(item as PaymentIntent),
    },
    {
      header: 'Date',
      field: 'created',
      type: 'date',
      dimmed: true,
    },
    {
      header: '',
      field: '',
      type: 'actions',
      actions: [
        {
          title: 'Copy payment ID',
          action: (item: PaymentIntent) => this.CopyPaymentId(item),
        },
      ],
    },
  ];

  activityColumns: PaginatedListColumn[] = [
    {
      header: 'Amount',
      field: 'amount',
      type: 'currency-with-code',
      currencyField: 'currency',
      bolded: true,
    },
    {
      header: '',
      field: 'status',
      type: 'status',
    },
    {
      header: 'Type',
      field: 'type',
      type: 'text',
      capitalize: true,
      dimmed: true,
    },
    {
      header: 'Description',
      field: 'description',
      type: 'text',
      dimmed: true,
      formatter: (item: unknown) => {
        const tx = item as { description?: string | null; id: string };
        return tx.description ?? tx.id;
      },
    },
    {
      header: 'Date',
      field: 'created',
      type: 'date',
      dimmed: true,
    },
    {
      header: 'Net',
      field: 'net',
      type: 'currency-with-code',
      currencyField: 'currency',
      dimmed: true,
    },
  ];

  paymentIntentsQueryParams: WritableSignal<Record<string, string>> = signal(
    {}
  );
  paymentIntentsExpand: WritableSignal<string[]> = signal(['customer']);

  payoutQueryParams = { type: 'payout' };
  topupQueryParams = { type: 'topup' };
  transferQueryParams = { type: 'transfer' };

  private customerFilter: string | null = null;

  ngOnInit(): void {
    this.metaService.SetMetaTitle('Transactions');
    this.customerFilter = this.route.snapshot.queryParamMap.get('customer');
    this.SyncPaymentIntentsQueryParams();
  }

  SetTransactionsTab(tab: TransactionsTab): void {
    this.transactionsTab.set(tab);
  }

  SetPaymentsStatusTab(tab: PaymentsStatusTab): void {
    this.paymentsStatusTab.set(tab);
    this.SyncPaymentIntentsQueryParams();
  }

  OnPaymentIntentClick(paymentIntent: PaymentIntent): void {
    this.router.navigate(['/account/payments', paymentIntent.id]);
  }

  private SyncPaymentIntentsQueryParams(): void {
    const params: Record<string, string> = {};
    if (this.customerFilter) {
      params['customer'] = this.customerFilter;
    }

    switch (this.paymentsStatusTab()) {
      case 'succeeded':
        params['status'] = 'succeeded';
        break;
      case 'incomplete':
        params['status'] = 'incomplete';
        break;
      case 'canceled':
        params['status'] = 'canceled';
        break;
      case 'uncaptured':
        params['status'] = 'requires_capture';
        break;
      case 'all':
      default:
        break;
    }

    this.paymentIntentsQueryParams.set(params);
  }

  private FormatPaymentMethod(paymentIntent: PaymentIntent): string {
    const types = paymentIntent.payment_method_types ?? [];
    if (types.includes('crypto')) {
      return 'USDC';
    }
    if (types.length > 0) {
      return types[0]
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
    }
    if (paymentIntent.payment_method) {
      return this.ShortenId(paymentIntent.payment_method);
    }
    return '—';
  }

  private FormatCustomer(paymentIntent: PaymentIntent): string {
    const customer = paymentIntent.customer;
    if (!customer) return '—';
    if (typeof customer === 'string') return customer;
    const expanded = customer as Customer;
    return expanded.email ?? expanded.name ?? expanded.id;
  }

  private ShortenId(id: string): string {
    if (id.length <= 12) return id;
    return `${id.slice(0, 6)}...${id.slice(-4)}`;
  }

  private CopyPaymentId(paymentIntent: PaymentIntent): void {
    void navigator.clipboard.writeText(paymentIntent.id);
  }
}
