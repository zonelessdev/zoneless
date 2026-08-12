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
import type { Invoice } from '@zoneless/shared-types';
import { MetaService } from '../../../../../core';
import {
  FormatInvoiceCustomerEmail,
  FormatInvoiceCustomerName,
  FormatInvoiceFrequency,
  FormatInvoiceNumber,
} from '../../util/invoice-display';

type InvoicesStatusTab = 'all' | 'draft' | 'open' | 'paid';

@Component({
  selector: 'app-invoice-list',
  imports: [PaginatedListComponent],
  templateUrl: './invoice-list.component.html',
  styleUrl: './invoice-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvoiceListComponent implements OnInit {
  private readonly metaService = inject(MetaService);

  invoicesStatusTab: WritableSignal<InvoicesStatusTab> = signal('all');

  invoiceColumns: PaginatedListColumn[] = [
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
      header: 'Customer name',
      field: 'customer_name',
      type: 'text',
      dimmed: true,
      formatter: (item: unknown) => FormatInvoiceCustomerName(item as Invoice),
    },
    {
      header: 'Customer email',
      field: 'customer_email',
      type: 'text',
      dimmed: true,
      formatter: (item: unknown) => FormatInvoiceCustomerEmail(item as Invoice),
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
          action: (item: Invoice) => this.CopyInvoiceId(item),
        },
      ],
    },
  ];

  invoicesQueryParams: WritableSignal<Record<string, string>> = signal({});
  invoicesExpand: WritableSignal<string[]> = signal([
    'customer',
    'subscription.items.data.price',
  ]);

  ngOnInit(): void {
    this.metaService.SetMetaTitle('Invoices');
  }

  SetInvoicesStatusTab(tab: InvoicesStatusTab): void {
    this.invoicesStatusTab.set(tab);
    this.SyncInvoicesQueryParams();
  }

  private SyncInvoicesQueryParams(): void {
    const params: Record<string, string> = {};
    switch (this.invoicesStatusTab()) {
      case 'draft':
        params['status'] = 'draft';
        break;
      case 'open':
        params['status'] = 'open';
        break;
      case 'paid':
        params['status'] = 'paid';
        break;
      case 'all':
      default:
        break;
    }
    this.invoicesQueryParams.set(params);
  }

  private CopyInvoiceId(invoice: Invoice): void {
    void navigator.clipboard.writeText(invoice.id);
  }
}
