import { randomUUID } from 'node:crypto';
import { ApiError, PartialFailureError } from './Errors';
import type {
  PartialResources,
  PaymentLinkResponse,
  PriceResponse,
  ProductResponse,
  PublicConfig,
  StoreInitCommand,
} from './Types';

export interface StoreClient {
  CreatePaymentLink(
    body: Record<string, unknown>,
    idempotencyKey: string
  ): Promise<PaymentLinkResponse>;
  CreatePrice(
    body: Record<string, unknown>,
    idempotencyKey: string
  ): Promise<PriceResponse>;
  CreateProduct(
    body: Record<string, unknown>,
    idempotencyKey: string
  ): Promise<ProductResponse>;
  GetApiUrl(): string;
  GetConfig(): Promise<PublicConfig>;
  VerifyAuthentication(): Promise<void>;
}

export interface DoctorResult {
  api_url: string;
  authenticated: true;
  livemode: boolean;
  object: 'doctor';
  ok: true;
}

export interface StoreInitResult {
  amount: number;
  checkout_url: string;
  currency: 'usdc';
  object: 'store_init';
  ok: true;
  payment_link_id: string;
  price_id: string;
  product_id: string;
}

export interface StoreInitPlan {
  amount: number;
  currency: 'usdc';
  dry_run: true;
  object: 'store_init_plan';
  ok: true;
  product: {
    description?: string;
    name: string;
  };
}

export async function RunDoctor(client: StoreClient): Promise<DoctorResult> {
  await client.VerifyAuthentication();
  const config = await client.GetConfig();
  if (typeof config.livemode !== 'boolean') {
    throw new ApiError(
      'Zoneless returned a config response without a livemode flag.',
      0
    );
  }
  return {
    api_url: client.GetApiUrl(),
    authenticated: true,
    livemode: config.livemode,
    object: 'doctor',
    ok: true,
  };
}

export async function RunStoreInit(
  client: StoreClient,
  command: StoreInitCommand
): Promise<StoreInitResult | StoreInitPlan> {
  await RunDoctor(client);

  if (command.dryRun) {
    return {
      amount: command.amount,
      currency: 'usdc',
      dry_run: true,
      object: 'store_init_plan',
      ok: true,
      product: {
        name: command.productName,
        ...(command.description
          ? { description: command.description }
          : {}),
      },
    };
  }

  const partialResources: PartialResources = {
    payment_link_id: null,
    price_id: null,
    product_id: null,
  };
  const idempotencyPrefix = command.idempotencyKey ?? randomUUID();

  try {
    const product = await client.CreateProduct(
      {
        name: command.productName,
        ...(command.description
          ? { description: command.description }
          : {}),
      },
      `${idempotencyPrefix}:product`
    );
    partialResources.product_id = RequireValue(product.id, 'product id');

    const price = await client.CreatePrice(
      {
        currency: 'usdc',
        product: partialResources.product_id,
        unit_amount: command.amount,
      },
      `${idempotencyPrefix}:price`
    );
    partialResources.price_id = RequireValue(price.id, 'price id');

    const paymentLink = await client.CreatePaymentLink(
      {
        currency: 'usdc',
        line_items: [{ price: partialResources.price_id, quantity: 1 }],
      },
      `${idempotencyPrefix}:payment-link`
    );
    partialResources.payment_link_id = RequireValue(
      paymentLink.id,
      'payment link id'
    );
    const checkoutUrl = RequireValue(paymentLink.url, 'checkout URL');

    return {
      amount: command.amount,
      checkout_url: checkoutUrl,
      currency: 'usdc',
      object: 'store_init',
      ok: true,
      payment_link_id: partialResources.payment_link_id,
      price_id: partialResources.price_id,
      product_id: partialResources.product_id,
    };
  } catch (error) {
    if (Object.values(partialResources).some((value) => value !== null)) {
      throw new PartialFailureError(error, partialResources);
    }
    throw error;
  }
}

function RequireValue(value: string | undefined, label: string): string {
  if (!value) {
    throw new ApiError(`Zoneless returned a response without a ${label}.`, 0);
  }
  return value;
}
