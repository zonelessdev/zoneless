/**
 * @fileOverview Methods for Subscriptions
 *
 *
 * @module Subscription
 */

import { Solana } from './chains/Solana';

export class SubscriptionModule {
  constructor() {}

  async CreateSubscription(
    subscriberPublicKey: string,
    amount: number,
    periodSeconds: number
  ): Promise<any> {
    const solana = new Solana();
    const result = await solana.CreateSubscription(
      subscriberPublicKey,
      amount,
      periodSeconds
    );
    return result;
  }

  async GetSubscription(subscriberPublicKey: string): Promise<any> {
    const solana = new Solana();
    const result = await solana.GetSubscription(subscriberPublicKey);
    return result;
  }

  async CancelSubscription(subscriberPublicKey: string): Promise<any> {
    const solana = new Solana();
    const result = await solana.CancelSubscription(subscriberPublicKey);
    return result;
  }

  async ChargeSubscription(
    subscriberPublicKey: string,
    feePayerPublicKey: string
  ): Promise<any> {
    const solana = new Solana();
    const result = await solana.ChargeSubscription(
      subscriberPublicKey,
      feePayerPublicKey
    );
    return result;
  }

  async GetSubscriptionDebugInfo(subscriberPublicKey: string): Promise<any> {
    const solana = new Solana();
    const result = await solana.GetSubscriptionDebugInfo(subscriberPublicKey);
    return result;
  }
}
