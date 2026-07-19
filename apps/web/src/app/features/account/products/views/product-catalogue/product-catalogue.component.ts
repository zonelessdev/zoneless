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
import type { Product, Price } from '@zoneless/shared-types';

import { ProductService } from '../../../../../data';
import { ProductActionsService } from '../../services/product-actions.service';
import { ProductActionsHostComponent } from '../../components/product-actions-host/product-actions-host.component';
import { Subscription } from 'rxjs';
import { MetaService } from '../../../../../core';
import { FormatPriceDisplay } from '../../util/price-display';

@Component({
  selector: 'app-product-catalogue',
  imports: [PaginatedListComponent, ProductActionsHostComponent],
  templateUrl: './product-catalogue.component.html',
  styleUrl: './product-catalogue.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductCatalogueComponent implements OnInit, OnDestroy {
  readonly productService = inject(ProductService);
  readonly router = inject(Router);
  readonly route = inject(ActivatedRoute);
  readonly actions = inject(ProductActionsService);
  private sub?: Subscription;
  private readonly metaService = inject(MetaService);
  @ViewChild('productsList') productsList?: PaginatedListComponent<any>;

  productsTab: WritableSignal<'all'> = signal('all');
  productsActiveTab: WritableSignal<'all' | 'active' | 'archived'> =
    signal('active');

  productColumns: PaginatedListColumn[] = [
    {
      header: 'Name',
      field: 'name',
      type: 'text',
      bolded: true,
      imageField: 'images[0]',
      placeholderIcon: 'package.svg',
    },
    {
      header: 'Pricing',
      field: 'default_price.unit_amount',
      type: 'text',
      formatter: (item: unknown) => {
        const product = item as Product;
        if (product.default_price === null) {
          return 'No prices';
        }
        return FormatPriceDisplay(product.default_price as Price);
      },
    },
    {
      header: 'Status',
      field: 'active',
      type: 'status',
      formatter: (item: unknown) => {
        const product = item as Product;
        return product.active ? 'active' : 'archived';
      },
    },
    {
      header: 'Created',
      field: 'created',
      type: 'date',
    },
    {
      header: 'Updated',
      field: 'updated',
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
  productsQueryParams: WritableSignal<Record<string, string>> = signal({
    active: 'true',
  });
  productsExpand: WritableSignal<string[]> = signal(['default_price']);

  ngOnInit(): void {
    this.metaService.SetMetaTitle('Product Catalogue');
    this.sub = this.actions.events$.subscribe(() => {
      // Any successful action invalidates the list
      this.productsList?.Reload();
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  OnProductListClick(product: Product): void {
    this.router.navigate(['/account/products', product.id]);
  }

  SetProductsTab(tab: 'all'): void {
    this.productsTab.set(tab);
  }

  SetProductsActiveTab(tab: 'all' | 'active' | 'archived'): void {
    switch (tab) {
      case 'all':
        this.productsQueryParams.set({});
        break;
      case 'active':
        this.productsQueryParams.set({ active: 'true' });
        break;
      case 'archived':
        this.productsQueryParams.set({ active: 'false' });
        break;
    }
    this.productsActiveTab.set(tab);
  }
}
