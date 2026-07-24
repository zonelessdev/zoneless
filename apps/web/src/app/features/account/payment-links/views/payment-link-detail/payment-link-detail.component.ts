import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  WritableSignal,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type {
  CheckoutSessionLineItem,
  PaymentLink,
} from '@zoneless/shared-types';
import { Subscription } from 'rxjs';
import { PaymentLinkService } from '../../../../../data';
import { MetaService } from '../../../../../core';
import {
  CopyTextComponent,
  PopupMenuAction,
  PopupMenuComponent,
} from '../../../../../shared';
import { EventsListComponent } from '../../../components';
import { MetadataToArray } from '../../../util/metadata';
import { PaymentLinkActionsService } from '../../services/payment-link-actions.service';
import { PaymentLinkActionsHostComponent } from '../../components/payment-link-actions-host/payment-link-actions-host.component';
import { PaymentLinkPreviewComponent } from '../../components/payment-link-preview/payment-link-preview.component';
import { PreviewDevice } from '../../components/payment-link-form/payment-link-form.component';
import {
  BuildPaymentLinkPreviewState,
  FormatCollectAddresses,
  FormatConfirmationPage,
  FormatDeactivatedLinkPage,
  FormatLimitedUse,
  FormatSubmitTypeLabel,
  FormatUsdcAmount,
  FormatYesNo,
  GetLineItemPrice,
  GetLineItemProductImage,
  GetPaymentLinkName,
  GetPaymentLinkUnitAmount,
  IsPaymentLinkActive,
} from '../../util/payment-link-display';

type DetailTab = 'overview' | 'payments';

@Component({
  selector: 'app-payment-link-detail',
  imports: [
    DatePipe,
    RouterLink,
    CopyTextComponent,
    PopupMenuComponent,
    EventsListComponent,
    PaymentLinkActionsHostComponent,
    PaymentLinkPreviewComponent,
  ],
  templateUrl: './payment-link-detail.component.html',
  styleUrl: './payment-link-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentLinkDetailComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly paymentLinkService = inject(PaymentLinkService);
  private readonly metaService = inject(MetaService);
  readonly actions = inject(PaymentLinkActionsService);
  readonly MetadataToArray = MetadataToArray;
  readonly FormatYesNo = FormatYesNo;
  readonly FormatCollectAddresses = FormatCollectAddresses;
  readonly FormatConfirmationPage = FormatConfirmationPage;
  readonly FormatDeactivatedLinkPage = FormatDeactivatedLinkPage;
  readonly FormatLimitedUse = FormatLimitedUse;
  readonly FormatSubmitTypeLabel = FormatSubmitTypeLabel;
  readonly GetLineItemProductImage = GetLineItemProductImage;

  paymentLink: WritableSignal<PaymentLink | null> = signal(null);
  loading: WritableSignal<boolean> = signal(false);
  activeTab: WritableSignal<DetailTab> = signal('overview');
  previewDevice: WritableSignal<PreviewDevice> = signal('desktop');

  readonly title = computed(() => {
    const link = this.paymentLink();
    return link ? GetPaymentLinkName(link) : 'Payment link';
  });

  readonly unitAmountLabel = computed(() => {
    const link = this.paymentLink();
    if (!link) return '';
    return FormatUsdcAmount(GetPaymentLinkUnitAmount(link));
  });

  readonly lineItems = computed(
    (): CheckoutSessionLineItem[] => this.paymentLink()?.line_items?.data ?? []
  );

  readonly previewState = computed(() => {
    const link = this.paymentLink();
    if (!link) return null;
    return BuildPaymentLinkPreviewState(link, this.previewDevice());
  });

  readonly hasMetadata = computed(() => {
    const metadata = this.paymentLink()?.metadata;
    return !!metadata && Object.keys(metadata).length > 0;
  });

  readonly isActive = computed(() => {
    const link = this.paymentLink();
    return link ? IsPaymentLinkActive(link) : false;
  });

  paymentLinkActions: PopupMenuAction[] = [
    {
      title: 'Copy payment link URL',
      action: (item: PaymentLink) => this.CopyUrl(item),
      hidden: (item: PaymentLink) => !IsPaymentLinkActive(item),
    },
    {
      title: 'Edit metadata',
      action: (item: PaymentLink) => this.actions.OpenEditMetadata(item),
    },
    {
      title: 'Deactivate payment link',
      action: (item: PaymentLink) => this.actions.OpenDeactivate(item),
      hidden: (item: PaymentLink) => !IsPaymentLinkActive(item),
    },
    {
      title: 'Activate payment link',
      action: (item: PaymentLink) => this.actions.OpenActivate(item),
      hidden: (item: PaymentLink) => IsPaymentLinkActive(item),
    },
  ];

  private sub?: Subscription;

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('paymentLinkId');
    if (!id) return;
    await this.LoadPaymentLink(id);
    this.metaService.SetMetaTitle(this.title());
    this.sub = this.actions.events$.subscribe((event) => {
      if (
        (event.type === 'updated' ||
          event.type === 'deactivated' ||
          event.type === 'activated') &&
        event.paymentLink.id === id
      ) {
        this.paymentLink.set(event.paymentLink);
        this.metaService.SetMetaTitle(GetPaymentLinkName(event.paymentLink));
      }
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  private async LoadPaymentLink(id: string): Promise<void> {
    this.loading.set(true);
    try {
      this.paymentLink.set(await this.paymentLinkService.GetPaymentLink(id));
    } finally {
      this.loading.set(false);
    }
  }

  SetTab(tab: DetailTab): void {
    this.activeTab.set(tab);
  }

  SetPreviewDevice(device: PreviewDevice): void {
    this.previewDevice.set(device);
  }

  CopyUrl(paymentLink?: PaymentLink | null): void {
    const link = paymentLink ?? this.paymentLink();
    if (!link?.url) return;
    void navigator.clipboard.writeText(link.url);
  }

  OnEditMetadata(): void {
    const link = this.paymentLink();
    if (link) this.actions.OpenEditMetadata(link);
  }

  LineItemAmount(item: CheckoutSessionLineItem): string {
    const price = GetLineItemPrice(item);
    const unitAmount = price?.unit_amount ?? item.amount_total ?? 0;
    return FormatUsdcAmount(unitAmount);
  }

  LineItemProductId(item: CheckoutSessionLineItem): string | null {
    const price = GetLineItemPrice(item);
    if (!price?.product) return null;
    return typeof price.product === 'string' ? price.product : price.product.id;
  }
}
