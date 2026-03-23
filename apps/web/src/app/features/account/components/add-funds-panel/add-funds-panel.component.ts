import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  inject,
  OnChanges,
  SimpleChanges,
  signal,
  WritableSignal,
  OnDestroy,
  ElementRef,
} from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';

import { TopupService } from '../../../../data';
import { LoaderComponent, StatusChipComponent } from '../../../../shared';
import { DepositInfo, TopUp } from '@zoneless/shared-types';

type PanelState = 'loading' | 'info' | 'waiting' | 'success';

@Component({
  selector: 'app-add-funds-panel',
  standalone: true,
  imports: [DecimalPipe, DatePipe, LoaderComponent, StatusChipComponent],
  templateUrl: './add-funds-panel.component.html',
  styleUrls: ['./add-funds-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddFundsPanelComponent implements OnChanges, OnDestroy {
  private readonly topupService = inject(TopupService);
  private readonly elementRef = inject(ElementRef);
  private checkInterval: ReturnType<typeof setInterval> | null = null;

  @Input() isOpen = false;
  @Output() depositCompleted = new EventEmitter<TopUp>();

  depositInfo: WritableSignal<DepositInfo | null> = signal(null);
  state: WritableSignal<PanelState> = signal('loading');
  copiedField: WritableSignal<string | null> = signal(null);
  newDeposit: WritableSignal<TopUp | null> = signal(null);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen']) {
      if (this.isOpen) {
        this.OnOpen();
      } else {
        this.OnClose();
      }
    }
  }

  ngOnDestroy(): void {
    this.ClearCheckInterval();
    this.topupService.StopPolling();
  }

  private ClearCheckInterval(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  private ScrollToTop(): void {
    // Find the slide panel content container (parent with overflow-y: auto)
    const panelContent = this.elementRef.nativeElement.closest(
      '.slide-panel-content'
    );
    if (panelContent) {
      panelContent.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  private async OnOpen(): Promise<void> {
    this.state.set('loading');
    this.newDeposit.set(null);

    // Capture the current most recent topup ID - any new topup is a deposit
    await this.topupService.CaptureLastTopUpId();

    try {
      const info = await this.topupService.GetDepositInfo();
      this.depositInfo.set(info);
      this.state.set('info');
    } catch (error) {
      console.error('Failed to load deposit info:', error);
      this.state.set('info'); // Show info state anyway with empty data
    }
  }

  private OnClose(): void {
    this.ClearCheckInterval();
    this.topupService.StopPolling();
    this.state.set('loading');
    this.copiedField.set(null);
  }

  GetWalletAddress(): string {
    return this.depositInfo()?.wallet_address || '';
  }

  GetWalletAddressShort(): string {
    const address = this.GetWalletAddress();
    if (!address || address.length <= 16) return address;
    return `${address.slice(0, 8)}...${address.slice(-8)}`;
  }

  IsTestMode(): boolean {
    const url = this.depositInfo()?.explorer_url || '';
    return url.includes('cluster=devnet');
  }

  GetExplorerUrl(): string {
    return this.depositInfo()?.explorer_url || '';
  }

  async CopyToClipboard(text: string, field: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.copiedField.set(field);
      setTimeout(() => this.copiedField.set(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }

  OnViewOnExplorer(): void {
    const url = this.GetExplorerUrl();
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  OnStartWaiting(): void {
    this.state.set('waiting');
    this.ScrollToTop();
    this.topupService.newDepositDetected.set(null);
    this.newDeposit.set(null);

    // Clear any existing interval first
    this.ClearCheckInterval();

    // Start polling for new topups (every 15 seconds - blockchain checks are expensive)
    this.topupService.StartPolling(15000);

    // Watch for new deposits
    this.checkInterval = setInterval(() => {
      const deposit = this.topupService.newDepositDetected();
      if (deposit) {
        this.ClearCheckInterval();
        this.newDeposit.set(deposit);
        this.state.set('success');
        this.ScrollToTop();
        this.depositCompleted.emit(deposit);
      }
    }, 500);
  }

  OnCancelWaiting(): void {
    this.ClearCheckInterval();
    this.topupService.StopPolling();
    this.state.set('info');
  }

  GetDepositAmount(): number {
    const deposit = this.newDeposit();
    if (!deposit) return 0;
    return deposit.amount / 100;
  }

  GetDepositCurrency(): string {
    const deposit = this.newDeposit();
    if (!deposit) return 'USDC';
    return deposit.currency.toUpperCase();
  }

  GetDepositDate(): number | null {
    const deposit = this.newDeposit();
    if (!deposit) return null;
    return deposit.created * 1000;
  }

  GetSenderAddress(): string {
    const deposit = this.newDeposit();
    if (!deposit || !deposit.metadata?.['sender_address']) return '';
    const address = deposit.metadata['sender_address'];
    if (address.length <= 16) return address;
    return `${address.slice(0, 8)}...${address.slice(-8)}`;
  }

  OnOpenSolFaucet(): void {
    window.open('https://faucet.solana.com/', '_blank', 'noopener,noreferrer');
  }

  OnOpenUsdcFaucet(): void {
    window.open('https://faucet.circle.com/', '_blank', 'noopener,noreferrer');
  }
}
