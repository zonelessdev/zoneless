import {
  ChangeDetectionStrategy,
  Component,
  ViewChild,
  WritableSignal,
  inject,
  signal,
} from '@angular/core';
import { ConfirmDialogComponent, LoaderComponent } from '../../../../../shared';
import { MetadataEditModalComponent } from '../../../components';
import { PaymentLinkActionsService } from '../../services/payment-link-actions.service';
import {
  PaymentLinkFormComponent,
  PaymentLinkFormPreviewState,
} from '../payment-link-form/payment-link-form.component';
import { PaymentLinkPreviewComponent } from '../payment-link-preview/payment-link-preview.component';
import { ProductActionsHostComponent } from '../../../products/components/product-actions-host/product-actions-host.component';

@Component({
  selector: 'app-payment-link-actions-host',
  standalone: true,
  imports: [
    LoaderComponent,
    PaymentLinkFormComponent,
    PaymentLinkPreviewComponent,
    ProductActionsHostComponent,
    ConfirmDialogComponent,
    MetadataEditModalComponent,
  ],
  templateUrl: './payment-link-actions-host.component.html',
  styleUrl: './payment-link-actions-host.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentLinkActionsHostComponent {
  readonly actions = inject(PaymentLinkActionsService);
  @ViewChild('paymentLinkForm') paymentLinkForm!: PaymentLinkFormComponent;

  previewState: WritableSignal<PaymentLinkFormPreviewState> = signal({
    tab: 'payment',
    linkType: 'products',
    lineItems: [],
    customTitle: '',
    customPreset: 0,
    collectCustomerNames: false,
    collectBusinessNames: false,
    collectBillingAddresses: false,
    collectShippingAddresses: false,
    collectPhone: false,
    collectTaxIds: false,
    customFields: [],
    allowPromotionCodes: false,
    requireTerms: false,
    savePaymentDetails: false,
    afterCompletionMode: 'hosted_confirmation',
    customConfirmationMessage: '',
    useCustomConfirmationMessage: false,
    submitType: 'pay',
    previewDevice: 'desktop',
  });

  isValid: WritableSignal<boolean> = signal(false);

  OnFormChange(state: PaymentLinkFormPreviewState): void {
    this.previewState.set(state);
  }

  OnValidationChange(isValid: boolean): void {
    this.isValid.set(isValid);
  }

  OnClose(): void {
    if (this.actions.loading()) return;
    this.actions.CloseFlow();
  }

  OnSurfaceClick(event: Event): void {
    event.stopPropagation();
  }

  SetPreviewDevice(device: 'desktop' | 'mobile'): void {
    this.previewState.update((state) => ({
      ...state,
      previewDevice: device,
    }));
    this.paymentLinkForm?.SetPreviewDevice(device);
  }

  async OnSubmit(): Promise<void> {
    if (!this.paymentLinkForm || this.actions.loading()) return;
    this.actions.showErrors.set(true);
    if (!this.paymentLinkForm.ValidateAll()) return;
    await this.actions.Save(this.paymentLinkForm.CreateFormPayload());
  }
}
