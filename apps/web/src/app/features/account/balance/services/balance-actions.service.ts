import { inject, Injectable, signal, WritableSignal } from '@angular/core';
import { Subject } from 'rxjs';
import type { TopUp } from '@zoneless/shared-types';
import { BalanceService, TopupService } from '../../../../data';

export type BalanceActionEvent =
  | { type: 'deposit_completed'; deposit: TopUp }
  | { type: 'synced' };

@Injectable()
export class BalanceActionsService {
  private readonly balanceService = inject(BalanceService);
  private readonly topupService = inject(TopupService);

  addFundsOpen: WritableSignal<boolean> = signal(false);
  balanceDetailOpen: WritableSignal<boolean> = signal(false);

  readonly events$ = new Subject<BalanceActionEvent>();

  CreateEvent(event: BalanceActionEvent): void {
    this.events$.next(event);
  }

  OpenAddFunds(): void {
    this.addFundsOpen.set(true);
  }

  CloseAddFunds(): void {
    this.addFundsOpen.set(false);
    this.topupService.Reset();
  }

  OpenBalanceDetail(): void {
    this.balanceDetailOpen.set(true);
  }

  CloseBalanceDetail(): void {
    this.balanceDetailOpen.set(false);
  }

  async OnDepositCompleted(deposit: TopUp): Promise<void> {
    this.CreateEvent({ type: 'deposit_completed', deposit });
    setTimeout(async () => {
      await this.balanceService.GetBalance();
    }, 1000);
  }

  async OnSynced(): Promise<void> {
    await this.balanceService.GetBalance();
    this.CreateEvent({ type: 'synced' });
  }
}
