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
import { MetaService } from '../../../../../core';
import { PaymentIntentActionsHostComponent } from '../../components/payment-intent-actions-host/payment-intent-actions-host.component';

@Component({
  selector: 'app-payment-intent-list',
  imports: [PaginatedListComponent, PaymentIntentActionsHostComponent],
  templateUrl: './payment-intent-list.component.html',
  styleUrl: './payment-intent-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentIntentListComponent implements OnInit {
  readonly router = inject(Router);
  readonly route = inject(ActivatedRoute);
  private readonly metaService = inject(MetaService);

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
      formatter: (item: unknown) => {
        const paymentIntent = item as PaymentIntent;
        return paymentIntent.description ?? paymentIntent.id;
      },
    },
    {
      header: 'Customer',
      field: 'customer',
      type: 'text',
      formatter: (item: unknown) => this.FormatCustomer(item as PaymentIntent),
    },
    {
      header: 'Date',
      field: 'created',
      type: 'date',
    },
    {
      header: 'Refunded date',
      field: 'refunded_date',
      type: 'text',
      formatter: () => '—',
    },
    {
      header: 'Decline reason',
      field: 'last_payment_error',
      type: 'text',
      formatter: (item: unknown) => {
        const paymentIntent = item as PaymentIntent;
        return paymentIntent.last_payment_error?.message ?? '—';
      },
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

  paymentIntentsQueryParams: WritableSignal<Record<string, string>> = signal(
    {}
  );
  paymentIntentsExpand: WritableSignal<string[]> = signal(['customer']);

  ngOnInit(): void {
    this.metaService.SetMetaTitle('Transactions');
    const customerId = this.route.snapshot.queryParamMap.get('customer');
    if (customerId) {
      this.paymentIntentsQueryParams.set({ customer: customerId });
    }
  }

  OnPaymentIntentClick(paymentIntent: PaymentIntent): void {
    this.router.navigate(['/account/payments', paymentIntent.id]);
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
