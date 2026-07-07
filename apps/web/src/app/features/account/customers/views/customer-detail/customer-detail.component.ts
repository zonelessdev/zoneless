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
import type { Customer } from '@zoneless/shared-types';
import { CustomerService } from '../../../../../data';
import { CustomerActionsService } from '../../services/customer-actions.service';
import { ActivatedRoute, Router } from '@angular/router';
import { CustomerActionsHostComponent } from '../../components/customer-actions-host/customer-actions-host.component';
import {
  PopupMenuAction,
  PopupMenuComponent,
  CopyTextComponent,
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
