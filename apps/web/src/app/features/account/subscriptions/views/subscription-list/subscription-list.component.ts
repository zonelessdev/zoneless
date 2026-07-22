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
import type { Subscription } from '@zoneless/shared-types';
import { Subscription as RxSubscription } from 'rxjs';
import { MetaService } from '../../../../../core';
import {
  FormatSubscriptionCollectionMethod,
  FormatSubscriptionCustomerEmail,
  FormatSubscriptionCustomerName,
  FormatSubscriptionProduct,
  GetSubscriptionListStatus,
} from '../../util/subscription-display';
import { SubscriptionActionsService } from '../../services/subscription-actions.service';
import { SubscriptionActionsHostComponent } from '../../components/subscription-actions-host/subscription-actions-host.component';

type SubscriptionsStatusTab = 'active' | 'paused' | 'canceled' | 'all';

@Component({
  selector: 'app-subscription-list',
  imports: [PaginatedListComponent, SubscriptionActionsHostComponent],
  templateUrl: './subscription-list.component.html',
  styleUrl: './subscription-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubscriptionListComponent implements OnInit, OnDestroy {
  private readonly metaService = inject(MetaService);
  private readonly router = inject(Router);
  private readonly actions = inject(SubscriptionActionsService);
  @ViewChild('subscriptionsList')
  subscriptionsList?: PaginatedListComponent<any>;

  private sub?: RxSubscription;

  subscriptionsStatusTab: WritableSignal<SubscriptionsStatusTab> =
    signal('active');

  subscriptionColumns: PaginatedListColumn[] = [
    {
      header: 'Customer',
      field: 'customer',
      type: 'text',
      bolded: true,
      formatter: (item: unknown) =>
        FormatSubscriptionCustomerEmail(item as Subscription),
    },
    {
      header: 'Status',
      field: 'status',
      type: 'status',
      formatter: (item: unknown) =>
        GetSubscriptionListStatus(item as Subscription),
    },
    {
      header: 'Customer name',
      field: 'customer.name',
      type: 'text',
      dimmed: true,
      formatter: (item: unknown) =>
        FormatSubscriptionCustomerName(item as Subscription),
    },
    {
      header: 'Collection method',
      field: 'collection_method',
      type: 'text',
      dimmed: true,
      formatter: (item: unknown) =>
        FormatSubscriptionCollectionMethod(item as Subscription),
    },
    {
      header: 'Product',
      field: 'items',
      type: 'text',
      dimmed: true,
      formatter: (item: unknown) =>
        FormatSubscriptionProduct(item as Subscription),
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
      actions: this.actions.GetMenuActions(),
    },
  ];

  subscriptionsQueryParams: WritableSignal<Record<string, string>> = signal({
    status: 'active',
  });
  subscriptionsExpand: WritableSignal<string[]> = signal([
    'customer',
    'items.data.price.product',
  ]);

  ngOnInit(): void {
    this.metaService.SetMetaTitle('Subscriptions');
    this.sub = this.actions.events$.subscribe(() => {
      void this.subscriptionsList?.Reload();
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  SetSubscriptionsStatusTab(tab: SubscriptionsStatusTab): void {
    this.subscriptionsStatusTab.set(tab);
    this.SyncSubscriptionsQueryParams();
  }

  OnSubscriptionClick(subscription: Subscription): void {
    this.router.navigate(['/account/subscriptions', subscription.id]);
  }

  private SyncSubscriptionsQueryParams(): void {
    const params: Record<string, string> = {};
    switch (this.subscriptionsStatusTab()) {
      case 'active':
        params['status'] = 'active';
        break;
      case 'paused':
        params['status'] = 'paused';
        break;
      case 'canceled':
        params['status'] = 'canceled';
        break;
      case 'all':
        params['status'] = 'all';
        break;
    }
    this.subscriptionsQueryParams.set(params);
  }
}
