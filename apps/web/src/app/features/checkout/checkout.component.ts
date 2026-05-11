import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SolanaWalletService } from '../../core';
import { SubscriptionsService } from '../../data/services';
import bs58 from 'bs58';
import { FormsModule } from '@angular/forms';

import {
  Connection,
} from '@solana/web3.js';


@Component({
  selector: 'app-checkout',
  imports: [FormsModule],
  templateUrl: './checkout.component.html',
  styleUrl: './checkout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutComponent {
  private readonly solanaWalletService = inject(SolanaWalletService);
	private readonly subscriptionsService = inject(SubscriptionsService);

	amountInCents : number = 1;
	periodSeconds : number = 30;

  async ConnectWallet() {
    await this.solanaWalletService.Connect();
  }

	GetAddress() {
		console.log(this.solanaWalletService.GetAddress());
	}

	async Subscribe() {
		const subscriberPublicKey = this.solanaWalletService.GetAddress();
		const prepared = await this.subscriptionsService.CreateSubscription(subscriberPublicKey, this.amountInCents, this.periodSeconds);
		const signature = await this.solanaWalletService.SignAndSendUnsignedTransaction(
			prepared.unsigned_transaction
		);
		console.log('signature bytes:', signature);
	}

	async GetSubscription() {
		const subscriberPublicKey = this.solanaWalletService.GetAddress();
		const result = await this.subscriptionsService.GetSubscription(subscriberPublicKey);
		console.log(result);
	}

	async CancelSubscription() {
		const subscriberPublicKey = this.solanaWalletService.GetAddress();
		const result = await this.subscriptionsService.CancelSubscription(subscriberPublicKey);
		console.log(result);
		const signature = await this.solanaWalletService.SignAndSendUnsignedTransaction(
			result.unsigned_transaction
		);
		console.log('signature bytes:', signature);
	}


	async ChargeSubscription() {
		const subscriberPublicKey = this.solanaWalletService.GetAddress();
		const prepared = await this.subscriptionsService.ChargeSubscription(
			subscriberPublicKey,
			subscriberPublicKey
		);
		const signatureBytes = await this.solanaWalletService.SignAndSendUnsignedTransaction(
			prepared.unsigned_transaction
		);
		const signature = bs58.encode(signatureBytes);
		console.log('signature:', signature);
		const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
		const confirmation = await connection.confirmTransaction(
			{
				signature,
				blockhash: prepared.blockhash,
				lastValidBlockHeight: prepared.last_valid_block_height,
			},
			'confirmed'
		);
		console.log('confirmation:', confirmation);
		const state = await this.subscriptionsService.GetSubscription(subscriberPublicKey);
		console.log('updated subscription:', state);
	}

	async GetSubscriptionDebugInfo() {
		const subscriberPublicKey = this.solanaWalletService.GetAddress();
		const result = await this.subscriptionsService.GetSubscriptionDebugInfo(subscriberPublicKey);
		console.log(result);
	}
	
}
