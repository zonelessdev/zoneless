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
import { Router } from '@angular/router';
import {
  PaginatedListComponent,
  PaginatedListColumn,
} from '../../../../../shared';
import type { PaymentLink } from '@zoneless/shared-types';
import { MetaService } from '../../../../../core';
import { Subscription } from 'rxjs';
import { PaymentLinkActionsService } from '../../services/payment-link-actions.service';
import { PaymentLinkActionsHostComponent } from '../../components/payment-link-actions-host/payment-link-actions-host.component';
import {
  FormatPaymentLinkPrice,
  GetPaymentLinkName,
  IsPaymentLinkActive,
} from '../../util/payment-link-display';

@Component({
  selector: 'app-payment-link-list',
  imports: [PaginatedListComponent, PaymentLinkActionsHostComponent],
  templateUrl: './payment-link-list.component.html',
  styleUrl: './payment-link-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentLinkListComponent implements OnInit, OnDestroy {
  private readonly metaService = inject(MetaService);
  private readonly router = inject(Router);
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
      formatter: (item: unknown) => GetPaymentLinkName(item as PaymentLink),
    },
    {
      header: '',
      field: 'active',
      type: 'status',
      formatter: (item: unknown) => {
        return IsPaymentLinkActive(item as PaymentLink) ? 'active' : 'inactive';
      },
    },
    {
      header: 'Price',
      field: 'line_items.data[0].amount_total',
      type: 'text',
      formatter: (item: unknown) => FormatPaymentLinkPrice(item as PaymentLink),
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
    this.sub = this.actions.events$.subscribe((event) => {
      if (event.type === 'created') {
        void this.router.navigate([
          '/account/payment-links',
          event.paymentLink.id,
        ]);
        return;
      }
      this.paymentLinksList?.Reload();
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  OnRowClick(paymentLink: PaymentLink): void {
    void this.router.navigate(['/account/payment-links', paymentLink.id]);
  }

  private CopyPaymentLinkUrl(paymentLink: PaymentLink): void {
    void navigator.clipboard.writeText(paymentLink.url);
  }
}
