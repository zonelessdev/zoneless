import * as express from 'express';
import { AsyncHandler } from '../utils/AsyncHandler';
import { db } from '../modules/Database';
import { ChargeModule } from '../modules/Charge';
import {
  RenderChargeReceiptHtml,
  RenderReceiptNotFoundHtml,
} from '../modules/Receipt';

const router = express.Router();
const chargeModule = new ChargeModule(db);

/**
 * GET /v1/receipts/:id
 * Public hosted HTML receipt for a Charge. The receipt URL is returned on the
 * authenticated Charge object; no email delivery is performed by this route.
 */
router.get(
  '/:id',
  AsyncHandler(async (req: express.Request, res: express.Response) => {
    const charge = await chargeModule.GetCharge(req.params.id);

    res.set('Cache-Control', 'no-store');
    res.type('html');

    if (!charge) {
      res.status(404).send(RenderReceiptNotFoundHtml());
      return;
    }

    res.send(RenderChargeReceiptHtml(charge));
  })
);

export default router;
