import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  WritableSignal,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import type { Product, Price } from '@zoneless/shared-types';
import { ProductService } from '../../../../../data';
import { ProductActionsService } from '../../services/product-actions.service';
import { ActivatedRoute, Router } from '@angular/router';
import { ProductActionsHostComponent } from '../../components/product-actions-host/product-actions-host.component';
import {
  PopupMenuAction,
  PopupMenuComponent,
  PaginatedListComponent,
  PaginatedListColumn,
} from '../../../../../shared';
import { EventsListComponent } from '../../../components';

import { Subscription } from 'rxjs';

@Component({
  selector: 'app-product-detail',
  imports: [
    ProductActionsHostComponent,
    PopupMenuComponent,
    DecimalPipe,
    DatePipe,
    PaginatedListComponent,
    EventsListComponent,
  ],
  templateUrl: './product-detail.component.html',
  styleUrl: './product-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductDetailComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly productService = inject(ProductService);
  readonly actions = inject(ProductActionsService);

  product: WritableSignal<Product | null> = signal(null);
  loading: WritableSignal<boolean> = signal(false);
  detailsExpanded: WritableSignal<boolean> = signal(false);

  priceColumns: PaginatedListColumn[] = [];
  priceQueryParams: WritableSignal<Record<string, string>> = signal({});

  private sub?: Subscription;

  productActions: PopupMenuAction[] = [
    {
      title: 'Edit Product',
      action: () => this.OnEdit(),
    },
    {
      title: 'Archive Product',
      action: () => this.OnArchive(),
      hidden: (item: Product) => !item.active,
    },
    {
      title: 'Unarchive Product',
      action: () => this.OnUnarchive(),
      hidden: (item: Product) => item.active,
    },
    {
      title: 'Delete Product',
      action: () => this.OnDelete(),
    },
  ];

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('productId');
    if (!id) return;
    await this.LoadProduct(id);
    this.InitPriceList(id);
    this.sub = this.actions.events$.subscribe((event) => {
      if (event.type === 'deleted' && event.productId === id) {
        this.router.navigate(['/account/products']);
      } else if (
        (event.type === 'updated' ||
          event.type === 'archived' ||
          event.type === 'unarchived') &&
        event.product.id === id
      ) {
        this.product.set(event.product);
      }
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  private async LoadProduct(id: string): Promise<void> {
    this.loading.set(true);
    try {
      this.product.set(await this.productService.GetProduct(id));
    } finally {
      this.loading.set(false);
    }
  }

  OnEdit(): void {
    const p = this.product();
    if (p) this.actions.OpenEdit(p);
  }

  OnArchive(): void {
    const p = this.product();
    if (p) this.actions.OpenArchive(p);
  }

  OnUnarchive(): void {
    const p = this.product();
    if (p) this.actions.OpenUnarchive(p);
  }

  OnDelete(): void {
    const p = this.product();
    if (p) this.actions.OpenDelete(p);
  }

  ToggleDetailsExpanded(): void {
    this.detailsExpanded.update((expanded) => !expanded);
  }

  DefaultPrice(defaultPrice: Product['default_price']): Price | null {
    return typeof defaultPrice === 'object' && defaultPrice !== null
      ? defaultPrice
      : null;
  }

  MetadataEntries(
    metadata: Record<string, string> | null | undefined
  ): { key: string; value: string }[] {
    if (!metadata || Object.keys(metadata).length === 0) {
      return [];
    }
    return Object.entries(metadata).map(([key, value]) => ({
      key,
      value: String(value),
    }));
  }

  InitPriceList(productId: string): void {
    this.priceColumns = [
      {
        header: 'Price',
        field: 'unit_amount',
        type: 'text',
        bolded: true,
        formatter: (item: unknown) => {
          const price = item as Price;
          if (price === null) {
            return 'No prices';
          }
          const unitAmount = price.unit_amount ?? 0;
          if (price.recurring) {
            const recurringData = price.recurring;
            if (recurringData?.interval === 'day') {
              return `$${(unitAmount / 100).toFixed(2)} / day`;
            }
            if (recurringData?.interval === 'week') {
              return `$${(unitAmount / 100).toFixed(2)} / week`;
            }
            if (recurringData?.interval === 'month') {
              return `$${(unitAmount / 100).toFixed(2)} / month`;
            }
            if (recurringData?.interval === 'year') {
              return `$${(unitAmount / 100).toFixed(2)} / year`;
            }
          }
          return `$${(unitAmount / 100).toFixed(2)}`;
        },
      },
      {
        header: '',
        field: 'active',
        type: 'status',
        formatter: (item: unknown) => {
          const price = item as Price;
          if (price.product === productId) {
            return 'default';
          }
          return '';
        },
      },
      {
        header: 'Description',
        field: 'nickname',
        type: 'text',
        formatter: (item: unknown) => {
          const price = item as Price;
          if (price.nickname === null) {
            return '—';
          }
          return price.nickname;
        },
      },
      {
        header: 'Subscriptions',
        field: 'subscriptions',
        type: 'text',
        formatter: () => {
          return '—';
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
            title: 'Edit product',
            action: (item: Product) => this.actions.OpenEdit(item),
            disabled: (item: Product) => !item.active,
          },
          {
            title: 'Archive product',
            action: (item: Product) => this.actions.OpenArchive(item),
            hidden: (item: Product) => !item.active,
          },
          {
            title: 'Unarchive product',
            action: (item: Product) => this.actions.OpenUnarchive(item),
            hidden: (item: Product) => item.active,
          },
          {
            title: 'Delete product',
            action: (item: Product) => this.actions.OpenDelete(item),
          },
        ],
      },
    ];
    this.priceQueryParams = signal({
      product: productId,
    });
  }
}
