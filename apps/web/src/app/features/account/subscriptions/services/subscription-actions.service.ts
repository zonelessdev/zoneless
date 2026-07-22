import { inject, Injectable, signal, WritableSignal } from '@angular/core';
import type { Subscription } from '@zoneless/shared-types';
import { Subject } from 'rxjs';
import { SubscriptionService } from '../../../../data';
import type { PopupMenuAction } from '../../../../shared';
import type { SubscriptionCancelMode } from '../components/subscription-cancel-modal/subscription-cancel-modal.component';
import { IsSubscriptionCancelingAtPeriodEnd } from '../util/subscription-display';

export type SubscriptionActionEvent =
  | { type: 'updated'; subscription: Subscription }
  | { type: 'canceled'; subscription: Subscription };

@Injectable()
export class SubscriptionActionsService {
  private readonly subscriptionService = inject(SubscriptionService);

  metadataDialogOpen: WritableSignal<boolean> = signal(false);
  metadataSaving: WritableSignal<boolean> = signal(false);
  metadataTarget: WritableSignal<Subscription | null> = signal(null);
  metadataDraft: WritableSignal<Record<string, string>> = signal({});

  cancelDialogOpen: WritableSignal<boolean> = signal(false);
  cancelSaving: WritableSignal<boolean> = signal(false);
  cancelTarget: WritableSignal<Subscription | null> = signal(null);

  readonly events$ = new Subject<SubscriptionActionEvent>();

  GetMenuActions(): PopupMenuAction[] {
    return [
      {
        title: 'Copy subscription ID',
        action: (item: Subscription) => this.CopySubscriptionId(item),
      },
      {
        title: 'Cancel subscription',
        destructive: true,
        action: (item: Subscription) => this.OpenCancel(item),
        hidden: (item: Subscription) =>
          item.status === 'canceled' ||
          IsSubscriptionCancelingAtPeriodEnd(item),
      },
      {
        title: "Don't cancel",
        action: (item: Subscription) => {
          void this.UnscheduleCancel(item);
        },
        hidden: (item: Subscription) =>
          !IsSubscriptionCancelingAtPeriodEnd(item),
      },
      {
        title: 'Cancel now',
        destructive: true,
        action: (item: Subscription) => this.OpenCancel(item),
        hidden: (item: Subscription) =>
          !IsSubscriptionCancelingAtPeriodEnd(item),
      },
    ];
  }

  OpenEditMetadata(subscription: Subscription): void {
    this.metadataTarget.set(subscription);
    this.metadataDraft.set({ ...(subscription.metadata ?? {}) });
    this.metadataDialogOpen.set(true);
  }

  OnMetadataChange(metadata: Record<string, string>): void {
    this.metadataDraft.set(metadata);
  }

  async ConfirmEditMetadata(): Promise<void> {
    const subscription = this.metadataTarget();
    if (!subscription) return;
    this.metadataSaving.set(true);
    try {
      const updated = await this.subscriptionService.UpdateSubscription(
        subscription.id,
        { metadata: this.metadataDraft() }
      );
      this.events$.next({ type: 'updated', subscription: updated });
      this.metadataDialogOpen.set(false);
    } finally {
      this.metadataSaving.set(false);
    }
  }

  OpenCancel(subscription: Subscription): void {
    this.cancelTarget.set(subscription);
    this.cancelDialogOpen.set(true);
  }

  CloseCancel(): void {
    if (this.cancelSaving()) return;
    this.cancelDialogOpen.set(false);
    this.cancelTarget.set(null);
  }

  async UnscheduleCancel(subscription: Subscription): Promise<void> {
    const updated = await this.subscriptionService.UpdateSubscription(
      subscription.id,
      { cancel_at_period_end: false }
    );
    this.events$.next({ type: 'updated', subscription: updated });
  }

  async ConfirmCancel(mode: SubscriptionCancelMode): Promise<void> {
    const subscription = this.cancelTarget();
    if (!subscription) return;
    this.cancelSaving.set(true);
    try {
      const updated =
        mode === 'immediately'
          ? await this.subscriptionService.CancelSubscription(subscription.id)
          : await this.subscriptionService.UpdateSubscription(subscription.id, {
              cancel_at_period_end: true,
            });
      this.events$.next({
        type: mode === 'immediately' ? 'canceled' : 'updated',
        subscription: updated,
      });
      this.cancelDialogOpen.set(false);
      this.cancelTarget.set(null);
    } finally {
      this.cancelSaving.set(false);
    }
  }

  CopySubscriptionId(subscription: Subscription): void {
    void navigator.clipboard.writeText(subscription.id);
  }
}
