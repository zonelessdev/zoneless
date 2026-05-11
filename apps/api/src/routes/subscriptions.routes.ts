import * as express from 'express';
import { AsyncHandler } from '../utils/AsyncHandler';
import { Logger } from '../utils/Logger';
import { SubscriptionModule } from '../modules/Subscription';

const router = express.Router();

router.get(
  '/:subscriberPublicKey',
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const subscriberPublicKey = req.params.subscriberPublicKey;

    const subscriptionModule = new SubscriptionModule();
    const result = await subscriptionModule.GetSubscription(
      subscriberPublicKey
    );

    Logger.info('Fetched subscription state', {
      subscriberPublicKey,
      exists: result?.exists,
      subscriptionPda: result?.subscription_pda,
    });

    res.json(result);
  })
);

router.post(
  '/',
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const accountId = req.user.account;
    const subscriberPublicKey = req.body.subscriberPublicKey;
    const amount = req.body.amount;
    const periodSeconds = req.body.periodSeconds;
    Logger.info('Subscription account', { accountId });

    const subscriptionModule = new SubscriptionModule();
    const result = await subscriptionModule.CreateSubscription(
      subscriberPublicKey,
      amount,
      periodSeconds
    );

    Logger.info('Subscription called');

    res.json(result);
  })
);

router.post(
  '/cancel',
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const subscriberPublicKey = req.body.subscriberPublicKey;

    const subscriptionModule = new SubscriptionModule();
    const result = await subscriptionModule.CancelSubscription(
      subscriberPublicKey
    );

    Logger.info('Built cancel subscription transaction', {
      subscriberPublicKey,
      subscriptionPda: result?.subscription_pda,
    });

    res.json(result);
  })
);

router.post(
  '/charge',
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const subscriberPublicKey = req.body.subscriberPublicKey;
    const feePayerPublicKey = req.body.feePayerPublicKey;

    const subscriptionModule = new SubscriptionModule();
    const result = await subscriptionModule.ChargeSubscription(
      subscriberPublicKey,
      feePayerPublicKey
    );

    Logger.info('Built charge subscription transaction', {
      subscriberPublicKey,
      feePayerPublicKey,
      subscriptionPda: result?.subscription_pda,
    });

    res.json(result);
  })
);

router.get(
  '/:subscriberPublicKey/debug',
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const subscriberPublicKey = req.params.subscriberPublicKey;

    const subscriptionModule = new SubscriptionModule();
    const result = await subscriptionModule.GetSubscriptionDebugInfo(
      subscriberPublicKey
    );

    Logger.info('Fetched subscription debug info', {
      subscriberPublicKey,
      subscriberTokenAccount: result?.subscriber?.token_account,
      merchantTokenAccount: result?.merchant?.token_account,
      delegate: result?.subscriber?.delegate,
    });

    res.json(result);
  })
);

export default router;
