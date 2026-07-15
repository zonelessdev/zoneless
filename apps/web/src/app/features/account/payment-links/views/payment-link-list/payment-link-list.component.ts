import {
  ChangeDetectionStrategy,
  Component,
  WritableSignal,
  signal,
  inject,
  OnInit,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import {
  PaginatedListComponent,
  PaginatedListColumn,
} from '../../../../../shared';
import type { PaymentLink, Price } from '@zoneless/shared-types';
import { MetaService } from '../../../../../core';
import { Subscription } from 'rxjs';
import { PaymentLinkActionsService } from '../../services/payment-link-actions.service';
import { PaymentLinkActionsHostComponent } from '../../components/payment-link-actions-host/payment-link-actions-host.component';

@Component({
  selector: 'app-payment-link-list',
  imports: [PaginatedListComponent, PaymentLinkActionsHostComponent],
  templateUrl: './payment-link-list.component.html',
  styleUrl: './payment-link-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentLinkListComponent implements OnInit, OnDestroy {
  private readonly metaService = inject(MetaService);
  readonly actions = inject(PaymentLinkActionsService);
  private sub?: Subscription;
  @ViewChild('paymentLinksList')
  paymentLinksList?: PaginatedListComponent<any>;

  paymentLinkColumns: PaginatedListColumn[] = [
    {
      header: 'Name',
      field: 'line_items.data[0].description',
      type: 'text',
      bolded: true,
      formatter: (item: unknown) => this.FormatName(item as PaymentLink),
    },
    {
      header: '',
      field: 'active',
      type: 'status',
      formatter: (item: unknown) => {
        const paymentLink = item as PaymentLink;
        return paymentLink.active ? 'active' : 'inactive';
      },
    },
    {
      header: 'Price',
      field: 'line_items.data[0].amount_total',
      type: 'text',
      formatter: (item: unknown) => this.FormatPrice(item as PaymentLink),
    },
    {
      header: 'Collected Fees',
      field: 'collected_fees',
      type: 'text',
      formatter: () => '—',
    },
    {
      header: 'Created',
      field: 'created',
      type: 'date',
      dateFormat: 'd MMM, HH:mm',
    },
    {
      header: '',
      field: '',
      type: 'actions',
      actions: [
        {
          title: 'Copy payment link URL',
          action: (item: PaymentLink) => this.CopyPaymentLinkUrl(item),
        },
      ],
    },
  ];
  paymentLinksQueryParams: WritableSignal<Record<string, string>> = signal({});

  ngOnInit(): void {
    this.metaService.SetMetaTitle('Payment Links');
    this.sub = this.actions.events$.subscribe(() => {
      this.paymentLinksList?.Reload();
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  private FormatName(paymentLink: PaymentLink): string {
    const firstItem = paymentLink.line_items?.data?.[0];
    if (firstItem?.description) {
      return firstItem.description;
    }
    return paymentLink.id;
  }

  private FormatPrice(paymentLink: PaymentLink): string {
    const firstItem = paymentLink.line_items?.data?.[0];
    if (!firstItem) {
      return '—';
    }

    const price =
      typeof firstItem.price === 'string' ? null : (firstItem.price as Price);
    const unitAmount = price?.unit_amount ?? firstItem.amount_total ?? 0;
    const formatted = `US$${(unitAmount / 100).toFixed(2)}`;

    if (price?.recurring) {
      return `${formatted} / ${price.recurring.interval}`;
    }

    return formatted;
  }

  private CopyPaymentLinkUrl(paymentLink: PaymentLink): void {
    void navigator.clipboard.writeText(paymentLink.url);
  }
}
