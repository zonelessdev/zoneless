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
import type { Customer, PaymentIntent } from '@zoneless/shared-types';
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

  paymentColumns: PaginatedListColumn[] = [];
  paymentQueryParams: WritableSignal<Record<string, string>> = signal({});

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
    this.InitPaymentList(id);
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

  OnPaymentClick(paymentIntent: PaymentIntent): void {
    this.router.navigate(['/account/payments', paymentIntent.id]);
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
