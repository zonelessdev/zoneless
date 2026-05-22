import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  WritableSignal,
} from '@angular/core';
import { DecimalPipe, UpperCasePipe } from '@angular/common';
import type { Price } from '@zoneless/shared-types';
import { PriceService } from '../../../../../data';
import { PriceActionsService } from '../../services/price-actions.service';
import { PriceActionsHostComponent } from '../../components/price-actions-host/price-actions-host.component';
import { ActivatedRoute, Router } from '@angular/router';
import { PopupMenuAction, PopupMenuComponent } from '../../../../../shared';
import { EventsListComponent } from '../../../components';

import { Subscription } from 'rxjs';

@Component({
  selector: 'app-price-detail',
  imports: [
    PriceActionsHostComponent,
    PopupMenuComponent,
    DecimalPipe,
    UpperCasePipe,
    EventsListComponent,
  ],
  templateUrl: './price-detail.component.html',
  styleUrl: './price-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PriceDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly priceService = inject(PriceService);
  readonly priceActions = inject(PriceActionsService);

  loading: WritableSignal<boolean> = signal(false);
  archivedBannedOpen: WritableSignal<boolean> = signal(true);

  price: WritableSignal<Price | null> = signal(null);
  private sub?: Subscription;

  popupMenuActions: PopupMenuAction[] = [
    {
      title: 'Archive Price',
      action: () => this.priceActions.OpenArchive(this.price() as Price),
      hidden: (item: Price) => !item.active,
    },
    {
      title: 'Unarchive Price',
      action: () => this.priceActions.OpenUnarchive(this.price() as Price),
      hidden: (item: Price) => item.active,
    },
  ];

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('priceId');
    if (!id) return;
    await this.LoadPrice(id);
    this.sub = this.priceActions.events$.subscribe((event) => {
      if (event.type === 'deleted' && event.priceId === id) {
        this.router.navigate(['/account/products']);
      } else if (
        (event.type === 'updated' ||
          event.type === 'archived' ||
          event.type === 'unarchived') &&
        event.price.id === id
      ) {
        this.price.set(event.price);
      }
    });
  }

  private async LoadPrice(id: string): Promise<void> {
    this.loading.set(true);
    try {
      this.price.set(await this.priceService.GetPrice(id));
      console.log(this.price());
    } finally {
      this.loading.set(false);
    }
  }

  CloseArchivedBanned(): void {
    this.archivedBannedOpen.set(false);
  }

  GoToProduct(): void {
    this.router.navigate(['/account/products', this.price()?.product]);
  }
}
