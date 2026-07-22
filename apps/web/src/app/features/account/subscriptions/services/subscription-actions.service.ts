import { inject, Injectable, signal, WritableSignal } from '@angular/core';
import type { Subscription } from '@zoneless/shared-types';
import { Subject } from 'rxjs';
import { SubscriptionService } from '../../../../data';

export type SubscriptionActionEvent = {
  type: 'updated';
  subscription: Subscription;
};

@Injectable()
export class SubscriptionActionsService {
  private readonly subscriptionService = inject(SubscriptionService);

  metadataDialogOpen: WritableSignal<boolean> = signal(false);
  metadataSaving: WritableSignal<boolean> = signal(false);
  metadataTarget: WritableSignal<Subscription | null> = signal(null);
  metadataDraft: WritableSignal<Record<string, string>> = signal({});

  readonly events$ = new Subject<SubscriptionActionEvent>();

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

  CopySubscriptionId(subscription: Subscription): void {
    void navigator.clipboard.writeText(subscription.id);
  }
}
