import {
  ChangeDetectionStrategy,
  Component,
  WritableSignal,
  signal,
  ViewChild,
  inject,
  OnInit,
  OnDestroy,
} from '@angular/core';
import {
  PaginatedListComponent,
  PaginatedListColumn,
} from '../../../../../shared';
import { Router, ActivatedRoute } from '@angular/router';
import type { Customer } from '@zoneless/shared-types';

import { Subscription } from 'rxjs';
import { CustomerActionsService } from '../../services/customer-actions.service';
import { CustomerActionsHostComponent } from '../../components/customer-actions-host/customer-actions-host.component';
import { MetaService } from '../../../../../core';

@Component({
  selector: 'app-customer-list',
  imports: [PaginatedListComponent, CustomerActionsHostComponent],
  templateUrl: './customer-list.component.html',
  styleUrl: './customer-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerListComponent implements OnInit, OnDestroy {
  readonly router = inject(Router);
  readonly route = inject(ActivatedRoute);
  private sub?: Subscription;
  private readonly metaService = inject(MetaService);
  readonly actions = inject(CustomerActionsService);
  @ViewChild('customersList') customersList?: PaginatedListComponent<any>;

  customerColumns: PaginatedListColumn[] = [
    {
      header: 'Customer',
      field: 'name',
      type: 'text',
      bolded: true,
    },
    {
      header: 'Email',
      field: 'email',
      type: 'text',
    },
    {
      header: 'Description',
      field: 'description',
      type: 'text',
      formatter: (item: unknown) => {
        const customer = item as Customer;
        if (customer.description === null) {
          return '—';
        }
        return customer.description;
      },
    },
    {
      header: 'Country',
      field: 'country',
      type: 'text',
      formatter: (item: unknown) => {
        const customer = item as Customer;
        if (!customer.address?.country) {
          return '—';
        }
        return customer.address?.country as string;
      },
    },
    {
      header: 'Created',
      field: 'created',
      type: 'date',
    },
    {
      header: '',
      field: '',
      type: 'actions',
      actions: [
        {
          title: 'Delete customer',
          action: (item: Customer) => this.actions.OpenDelete(item),
        },
      ],
    },
  ];
  customersQueryParams: WritableSignal<Record<string, string>> = signal({});

  ngOnInit(): void {
    this.metaService.SetMetaTitle('Customers');
    this.sub = this.actions.events$.subscribe(() => {
      // Any successful action invalidates the list
      this.customersList?.Reload();
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  OnCustomerListClick(customer: Customer): void {
    this.router.navigate(['/account/customers', customer.id]);
  }
}
