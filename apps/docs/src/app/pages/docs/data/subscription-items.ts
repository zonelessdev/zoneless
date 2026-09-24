import { DocSubSection, DocPage, Attribute } from './types';
import { NODE_INIT, EXPAND_TOOLTIP, BuildEndpointSummaries } from './shared';
import { GetResourceEventAttributes } from './event-types';

export const SUBSCRIPTION_ITEMS_SUBSECTION: DocSubSection = {
  id: 'subscriptionitems',
  title: 'Subscription Items',
  children: [
    { id: 'object', title: 'The Subscription Item object' },
    { id: 'create', title: 'Create a subscription item' },
    { id: 'update', title: 'Update a subscription item' },
    { id: 'retrieve', title: 'Retrieve a subscription item' },
    { id: 'list', title: 'List all subscription items' },
    { id: 'delete', title: 'Delete a subscription item' },
  ],
};

// ============================================
// Shared helpers
// ============================================

const DISCOUNT_PARAM_CHILDREN: Attribute[] = [
  {
    name: 'coupon',
    type: 'string',
    description: 'ID of the coupon to create a new discount for.',
  },
  {
    name: 'discount',
    type: 'string',
    description:
      'ID of an existing discount on the object (or one of its ancestors) to reuse.',
  },
  {
    name: 'promotion_code',
    type: 'string',
    description: 'ID of the promotion code to create a new discount for.',
  },
];

const BILLING_THRESHOLD_CHILDREN: Attribute[] = [
  {
    name: 'usage_gte',
    type: 'integer',
    description:
      'Usage threshold that triggers the subscription to create an invoice.',
  },
];

const PRICE_DATA_CHILDREN: Attribute[] = [
  {
    name: 'currency',
    type: 'enum',
    required: true,
    description:
      'Three-letter currency code, in lowercase. For Zoneless, use <code>usdc</code>.',
    enumNote:
      '<strong>Difference from Stripe:</strong> Use <code>usdc</code> instead of fiat currency codes like <code>usd</code>.',
  },
  {
    name: 'product',
    type: 'string',
    required: true,
    description: 'The ID of the product that this price will belong to.',
  },
  {
    name: 'recurring',
    type: 'object',
    required: true,
    description:
      'The recurring components of the price. A subscription item always bills on a recurring price, so this is required here.',
    children: [
      {
        name: 'interval',
        type: 'enum',
        required: true,
        description:
          'Specifies billing frequency. Either day, week, month or year.',
        enumValues: [
          { value: 'day', description: 'Billed daily.' },
          { value: 'week', description: 'Billed weekly.' },
          { value: 'month', description: 'Billed monthly.' },
          { value: 'year', description: 'Billed yearly.' },
        ],
      },
      {
        name: 'interval_count',
        type: 'integer',
        description:
          'The number of intervals between subscription billings. For example, <code>interval=month</code> with <code>interval_count=3</code> bills every 3 months.',
      },
    ],
  },
  {
    name: 'tax_behavior',
    type: 'enum',
    description:
      'Specifies whether the price is considered inclusive of taxes or exclusive of taxes. One of <code>inclusive</code>, <code>exclusive</code>, or <code>unspecified</code>. Once specified as either <code>inclusive</code> or <code>exclusive</code>, it cannot be changed.',
    enumValues: [
      { value: 'exclusive' },
      { value: 'inclusive' },
      { value: 'unspecified' },
    ],
  },
  {
    name: 'unit_amount',
    type: 'integer',
    description:
      'A positive integer in the smallest currency unit representing how much to charge. For USDC, this is cents (e.g., 100 = $1 USDC).',
  },
  {
    name: 'unit_amount_decimal',
    type: 'string',
    required: true,
    requiredText: 'Required unless unit_amount is provided',
    description:
      'Same as <code>unit_amount</code>, but accepts a decimal value in the smallest currency unit with at most 12 decimal places. Only one of <code>unit_amount</code> and <code>unit_amount_decimal</code> can be set.',
  },
];

// ============================================
// Shared Data
// ============================================

const SUBSCRIPTION_ITEM_OBJECT_JSON = `{
  "id": "si_z_9Km2pQxR4vL8nHw",
  "object": "subscription_item",
  "billed_until": null,
  "billing_thresholds": null,
  "created": 1784745601,
  "current_period_end": 1787424000,
  "current_period_start": 1784745600,
  "discounts": [],
  "metadata": {},
  "price": {
    "id": "price_z_ProMonthly25",
    "object": "price",
    "active": true,
    "billing_scheme": "per_unit",
    "created": 1784745600,
    "currency": "usdc",
    "custom_unit_amount": null,
    "livemode": false,
    "lookup_key": null,
    "metadata": {},
    "nickname": "Pro Plan Price",
    "product": "prod_z_oJaYlHpf6YmRzCMm",
    "recurring": {
      "aggregate_usage": null,
      "interval": "month",
      "interval_count": 1,
      "trial_period_days": null,
      "usage_type": "licensed"
    },
    "tax_behavior": "unspecified",
    "tiers_mode": null,
    "transform_quantity": null,
    "type": "recurring",
    "unit_amount": 1000,
    "unit_amount_decimal": "1000"
  },
  "quantity": 1,
  "subscription": "sub_z_1QvK9mR2eZvKYlo2CxH4pN8w",
  "tax_rates": [],
  "platform_account": "acct_z_Platform123abc"
}`;

const SUBSCRIPTION_ITEM_UPDATED_JSON = `{
  "id": "si_z_9Km2pQxR4vL8nHw",
  "object": "subscription_item",
  "billed_until": null,
  "billing_thresholds": null,
  "created": 1784745601,
  "current_period_end": 1787424000,
  "current_period_start": 1784745600,
  "discounts": [],
  "metadata": {
    "order_id": "9284"
  },
  "price": {
    "id": "price_z_ProMonthly25",
    "object": "price",
    "active": true,
    "billing_scheme": "per_unit",
    "created": 1784745600,
    "currency": "usdc",
    "custom_unit_amount": null,
    "livemode": false,
    "lookup_key": null,
    "metadata": {},
    "nickname": "Pro Plan Price",
    "product": "prod_z_oJaYlHpf6YmRzCMm",
    "recurring": {
      "aggregate_usage": null,
      "interval": "month",
      "interval_count": 1,
      "trial_period_days": null,
      "usage_type": "licensed"
    },
    "tax_behavior": "unspecified",
    "tiers_mode": null,
    "transform_quantity": null,
    "type": "recurring",
    "unit_amount": 1000,
    "unit_amount_decimal": "1000"
  },
  "quantity": 3,
  "subscription": "sub_z_1QvK9mR2eZvKYlo2CxH4pN8w",
  "tax_rates": [],
  "platform_account": "acct_z_Platform123abc"
}`;

const SUBSCRIPTION_ITEM_DELETED_JSON = `{
  "id": "si_z_9Km2pQxR4vL8nHw",
  "object": "subscription_item",
  "deleted": true
}`;

const LIST_SUBSCRIPTION_ITEMS_RESPONSE_JSON = `{
  "object": "list",
  "url": "/v1/subscription_items",
  "has_more": false,
  "data": [
    {
      "id": "si_z_9Km2pQxR4vL8nHw",
      "object": "subscription_item",
      "billed_until": null,
      "billing_thresholds": null,
      "created": 1784745601,
      "current_period_end": 1787424000,
      "current_period_start": 1784745600,
      "discounts": [],
      "metadata": {},
      "price": {
        "id": "price_z_ProMonthly25",
        "object": "price",
        "active": true,
        "billing_scheme": "per_unit",
        "created": 1784745600,
        "currency": "usdc",
        "custom_unit_amount": null,
        "livemode": false,
        "lookup_key": null,
        "metadata": {},
        "nickname": "Pro Plan Price",
        "product": "prod_z_oJaYlHpf6YmRzCMm",
        "recurring": {
          "aggregate_usage": null,
          "interval": "month",
          "interval_count": 1,
          "trial_period_days": null,
          "usage_type": "licensed"
        },
        "tax_behavior": "unspecified",
        "tiers_mode": null,
        "transform_quantity": null,
        "type": "recurring",
        "unit_amount": 1000,
        "unit_amount_decimal": "1000"
      },
      "quantity": 1,
      "subscription": "sub_z_1QvK9mR2eZvKYlo2CxH4pN8w",
      "tax_rates": [],
      "platform_account": "acct_z_Platform123abc"
    }
  ]
}`;

// ============================================
// Object Attributes
// ============================================

const SUBSCRIPTION_ITEM_ATTRIBUTES: Attribute[] = [
  {
    name: 'id',
    type: 'string',
    description:
      'Unique identifier for the object. Zoneless subscription item IDs are prefixed with <code>si_z_</code>.',
  },
  {
    name: 'metadata',
    type: 'object',
    description:
      'Set of key-value pairs that you can attach to an object. This can be useful for storing additional information about the object in a structured format.',
  },
  {
    name: 'price',
    type: 'string',
    tooltip: EXPAND_TOOLTIP,
    description:
      'The price the customer is subscribed to. Use <code>expand[]=price</code> to return the full price object.',
  },
  {
    name: 'quantity',
    type: 'integer',
    nullable: true,
    description:
      'The quantity of the plan to which the customer should be subscribed. Defaults to <code>1</code> when the item is created.',
  },
  {
    name: 'subscription',
    type: 'string',
    description:
      'The <code>subscription</code> this <code>subscription_item</code> belongs to.',
  },
];

const SUBSCRIPTION_ITEM_MORE_ATTRIBUTES: Attribute[] = [
  {
    name: 'object',
    type: 'string',
    description:
      "String representing the object's type. Objects of the same type share the same value.",
  },
  {
    name: 'billed_until',
    type: 'timestamp',
    nullable: true,
    description:
      'The time period the subscription item has been billed for. Zoneless bills through the parent subscription, so this stays <code>null</code>.',
  },
  {
    name: 'billing_thresholds',
    type: 'object',
    nullable: true,
    description:
      'Define thresholds at which an invoice will be sent for this subscription item.',
    children: BILLING_THRESHOLD_CHILDREN,
  },
  {
    name: 'created',
    type: 'timestamp',
    description:
      'Time at which the object was created. Measured in seconds since the Unix epoch.',
  },
  {
    name: 'current_period_end',
    type: 'timestamp',
    description:
      "The end time of this subscription item's current billing period. Follows the parent subscription's billing cycle and the interval on the item's price.",
  },
  {
    name: 'current_period_start',
    type: 'timestamp',
    description:
      "The start time of this subscription item's current billing period. Set from the parent subscription's billing cycle anchor.",
  },
  {
    name: 'discounts',
    type: 'array of strings',
    description:
      'The discounts applied to the subscription item, as discount IDs. Item discounts are applied before subscription discounts.',
  },
  {
    name: 'tax_rates',
    type: 'array of strings',
    nullable: true,
    description:
      'The tax rates which apply to this subscription item. When set, the <code>default_tax_rates</code> on the subscription do not apply to this item.',
  },
  {
    name: 'platform_account',
    type: 'string',
    description:
      "The platform account that owns this resource. For connected account resources, this is the platform's account ID. For the platform's own resources, this equals the account field (self-referential).",
    enumNote:
      "<strong>Zoneless extension:</strong> This field is not present in Stripe's API. It enables multi-tenant operation.",
  },
];

// ============================================
// Overview
// ============================================

export const SUBSCRIPTION_ITEMS_OVERVIEW_PAGE: DocPage = {
  id: 'object',
  title: 'The Subscription Item object',
  description:
    'Subscription items let a subscription hold more than one price. Each item pairs a price with a quantity, and the subscription bills for all of its items on the same cycle. Items are also added and changed through the items parameter on Subscription create and update.',
  stripeDocsUrl: 'https://docs.stripe.com/api/subscription_items',
  endpoints: BuildEndpointSummaries(SUBSCRIPTION_ITEMS_SUBSECTION, [
    { method: 'POST', path: '/v1/subscription_items', pageId: 'create' },
    { method: 'POST', path: '/v1/subscription_items/:id', pageId: 'update' },
    { method: 'GET', path: '/v1/subscription_items/:id', pageId: 'retrieve' },
    { method: 'GET', path: '/v1/subscription_items', pageId: 'list' },
    { method: 'DELETE', path: '/v1/subscription_items/:id', pageId: 'delete' },
  ]),
  events: GetResourceEventAttributes('subscription_item'),
  sections: [
    {
      left: [
        {
          type: 'callout',
          variant: 'info',
          title: 'Key concept: ',
          text: 'Adding, changing or removing an item emits <code>customer.subscription.updated</code> on the parent subscription. Zoneless does not emit <code>subscription_item.*</code> events.',
          html: true,
        },
        { type: 'heading', level: 2, text: 'Attributes' },
        {
          type: 'attributes',
          attributes: SUBSCRIPTION_ITEM_ATTRIBUTES,
          moreAttributes: SUBSCRIPTION_ITEM_MORE_ATTRIBUTES,
        },
      ],
      right: [
        {
          type: 'object',
          title: 'THE SUBSCRIPTION ITEM OBJECT',
          code: SUBSCRIPTION_ITEM_OBJECT_JSON,
        },
      ],
    },
  ],
};

// ============================================
// Create
// ============================================

const CREATE_SUBSCRIPTION_ITEM_PARAMETERS: Attribute[] = [
  {
    name: 'subscription',
    type: 'string',
    required: true,
    description: 'The identifier of the subscription to modify.',
  },
  {
    name: 'metadata',
    type: 'object',
    description:
      'Set of key-value pairs that you can attach to an object. This can be useful for storing additional information about the object in a structured format.',
  },
  {
    name: 'payment_behavior',
    type: 'enum',
    description:
      'Controls how to handle payment when a subscription update requires payment and <code>collection_method=charge_automatically</code>.',
    enumValues: [
      {
        value: 'allow_incomplete',
        description:
          'Transition the subscription to <code>past_due</code> if payment fails.',
      },
      {
        value: 'default_incomplete',
        description:
          'Transition the subscription to <code>past_due</code> without attempting payment.',
      },
      {
        value: 'error_if_incomplete',
        description:
          'Return an HTTP <code>402</code> error and do not update the subscription.',
      },
      {
        value: 'pending_if_incomplete',
        description:
          'Create a pending update that applies only if the payment succeeds.',
      },
    ],
    enumNote:
      '<strong>Difference from Stripe:</strong> Zoneless adds the item immediately and does not attempt a payment for it, so this parameter has no effect.',
  },
  {
    name: 'price',
    type: 'string',
    required: true,
    requiredText: 'Required unless price_data is provided',
    description: 'The ID of the price object.',
  },
  {
    name: 'proration_behavior',
    type: 'enum',
    description:
      'Determines how to handle prorations when the billing cycle changes or when an item quantity changes. Defaults to <code>create_prorations</code>.',
    enumValues: [
      { value: 'always_invoice' },
      { value: 'create_prorations' },
      { value: 'none' },
    ],
    enumNote:
      '<strong>Difference from Stripe:</strong> Zoneless does not create proration invoice items, so this value is accepted and ignored.',
  },
  {
    name: 'quantity',
    type: 'integer',
    description:
      "The quantity you'd like to apply to the subscription item you're creating. Defaults to <code>1</code>.",
  },
];

const CREATE_SUBSCRIPTION_ITEM_MORE_PARAMETERS: Attribute[] = [
  {
    name: 'billing_thresholds',
    type: 'object',
    description:
      'Define thresholds at which an invoice will be sent for this item. Pass an empty string to remove previously-defined thresholds.',
    expandable: true,
    children: BILLING_THRESHOLD_CHILDREN,
  },
  {
    name: 'discounts',
    type: 'array of objects',
    description:
      'The coupons and promotion codes to redeem into discounts for the subscription item. Exactly one of <code>coupon</code>, <code>discount</code>, or <code>promotion_code</code> must be specified per entry.',
    expandable: true,
    children: DISCOUNT_PARAM_CHILDREN,
  },
  {
    name: 'price_data',
    type: 'object',
    description:
      'Data used to generate a new Price object inline. Unlike invoice item <code>price_data</code>, <code>recurring</code> is required.',
    expandable: true,
    children: PRICE_DATA_CHILDREN,
  },
  {
    name: 'proration_date',
    type: 'timestamp',
    description:
      'Only used when <code>proration_behavior</code> creates prorations. Zoneless does not create prorations, so this value is accepted and ignored.',
  },
  {
    name: 'tax_rates',
    type: 'array of strings',
    description:
      'The tax rates which apply to the subscription item. When set, the <code>default_tax_rates</code> on the subscription do not apply to this item.',
  },
];

export const SUBSCRIPTION_ITEMS_CREATE_PAGE: DocPage = {
  id: 'create',
  title: 'Create a subscription item',
  description:
    'Adds a new item to an existing subscription. No existing items will be changed or replaced.',
  stripeDocsUrl: 'https://docs.stripe.com/api/subscription_items/create',
  endpoints: [{ method: 'POST', path: '/v1/subscription_items' }],
  sections: [
    {
      left: [
        { type: 'heading', level: 2, text: 'Parameters' },
        {
          type: 'attributes',
          attributes: CREATE_SUBSCRIPTION_ITEM_PARAMETERS,
          moreAttributes: CREATE_SUBSCRIPTION_ITEM_MORE_PARAMETERS,
        },
        { type: 'heading', level: 2, text: 'Returns' },
        {
          type: 'paragraph',
          text: 'The created subscription item object is returned if successful. Otherwise, this call raises an error.',
        },
      ],
      right: [
        {
          type: 'code',
          endpoint: { method: 'POST', path: '/v1/subscription_items' },
          tabs: [
            {
              id: 'curl',
              label: 'cURL',
              code: `curl https://api.yourdomain.com/v1/subscription_items \\
  -H "x-api-key: sk_live_z_YOUR_API_KEY" \\
  -d subscription=sub_z_1QvK9mR2eZvKYlo2CxH4pN8w \\
  -d price=price_z_ProMonthly25 \\
  -d quantity=3`,
            },
            {
              id: 'node',
              label: 'Node.js',
              code: `${NODE_INIT}

const subscriptionItem = await zoneless.subscriptionItems.create({
  subscription: 'sub_z_1QvK9mR2eZvKYlo2CxH4pN8w',
  price: 'price_z_ProMonthly25',
  quantity: 3,
});`,
            },
          ],
        },
        {
          type: 'object',
          title: 'RESPONSE',
          code: SUBSCRIPTION_ITEM_OBJECT_JSON,
        },
      ],
    },
  ],
};

// ============================================
// Update
// ============================================

const UPDATE_SUBSCRIPTION_ITEM_PARAMETERS: Attribute[] = [
  {
    name: 'metadata',
    type: 'object',
    description:
      'Set of key-value pairs that you can attach to an object. This can be useful for storing additional information about the object in a structured format. Individual keys can be unset by posting an empty value to them. All keys can be unset by posting an empty value to <code>metadata</code>.',
  },
  {
    name: 'payment_behavior',
    type: 'enum',
    description:
      'Controls how to handle payment when a subscription update requires payment and <code>collection_method=charge_automatically</code>.',
    enumValues: [
      {
        value: 'allow_incomplete',
        description:
          'Transition the subscription to <code>past_due</code> if payment fails.',
      },
      {
        value: 'default_incomplete',
        description:
          'Transition the subscription to <code>past_due</code> without attempting payment.',
      },
      {
        value: 'error_if_incomplete',
        description:
          'Return an HTTP <code>402</code> error and do not update the subscription.',
      },
      {
        value: 'pending_if_incomplete',
        description:
          'Create a pending update that applies only if the payment succeeds.',
      },
    ],
    enumNote:
      '<strong>Difference from Stripe:</strong> Zoneless applies the change immediately and does not attempt a payment for it, so this parameter has no effect.',
  },
  {
    name: 'price',
    type: 'string',
    description:
      'The ID of the price object. Changing the price resets <code>quantity</code> to <code>1</code> unless the same request sends a <code>quantity</code>.',
  },
  {
    name: 'proration_behavior',
    type: 'enum',
    description:
      'Determines how to handle prorations when the billing cycle changes or when an item quantity changes. Defaults to <code>create_prorations</code>.',
    enumValues: [
      { value: 'always_invoice' },
      { value: 'create_prorations' },
      { value: 'none' },
    ],
    enumNote:
      '<strong>Difference from Stripe:</strong> Zoneless does not create proration invoice items, so this value is accepted and ignored.',
  },
  {
    name: 'quantity',
    type: 'integer',
    description:
      'The quantity you would like to apply to the subscription item.',
  },
];

const UPDATE_SUBSCRIPTION_ITEM_MORE_PARAMETERS: Attribute[] = [
  {
    name: 'billing_thresholds',
    type: 'object',
    description:
      'Define thresholds at which an invoice will be sent for this item. Pass an empty string to remove previously-defined thresholds.',
    expandable: true,
    children: BILLING_THRESHOLD_CHILDREN,
  },
  {
    name: 'discounts',
    type: 'array of objects',
    description:
      'The coupons, promotion codes and existing discounts which apply to the subscription item. Item discounts are applied before subscription discounts. Pass an empty string to remove previously-defined discounts. Exactly one of <code>coupon</code>, <code>discount</code>, or <code>promotion_code</code> must be specified per entry.',
    expandable: true,
    children: DISCOUNT_PARAM_CHILDREN,
  },
  {
    name: 'off_session',
    type: 'boolean',
    description:
      'Indicates that you intend to make future payments with the payment method collected for this subscription. Zoneless does not charge the item change, so this value is accepted and ignored.',
  },
  {
    name: 'price_data',
    type: 'object',
    description:
      'Data used to generate a new Price object inline. Unlike invoice item <code>price_data</code>, <code>recurring</code> is required.',
    expandable: true,
    children: PRICE_DATA_CHILDREN,
  },
  {
    name: 'proration_date',
    type: 'timestamp',
    description:
      'Only used when <code>proration_behavior</code> creates prorations. Zoneless does not create prorations, so this value is accepted and ignored.',
  },
  {
    name: 'tax_rates',
    type: 'array of strings',
    description:
      'The tax rates which apply to the subscription item. When set, the <code>default_tax_rates</code> on the subscription do not apply to this item. Pass an empty string to remove previously-defined tax rates.',
  },
];

export const SUBSCRIPTION_ITEMS_UPDATE_PAGE: DocPage = {
  id: 'update',
  title: 'Update a subscription item',
  description:
    'Updates the price or quantity of an item on a current subscription. Metadata is merged into the values already on the item; every other field is replaced.',
  stripeDocsUrl: 'https://docs.stripe.com/api/subscription_items/update',
  endpoints: [{ method: 'POST', path: '/v1/subscription_items/:id' }],
  sections: [
    {
      left: [
        { type: 'heading', level: 2, text: 'Parameters' },
        {
          type: 'attributes',
          attributes: UPDATE_SUBSCRIPTION_ITEM_PARAMETERS,
          moreAttributes: UPDATE_SUBSCRIPTION_ITEM_MORE_PARAMETERS,
        },
        { type: 'heading', level: 2, text: 'Returns' },
        {
          type: 'paragraph',
          text: 'The updated subscription item object is returned upon success. Otherwise, this call raises an error.',
        },
      ],
      right: [
        {
          type: 'code',
          endpoint: { method: 'POST', path: '/v1/subscription_items/:id' },
          tabs: [
            {
              id: 'curl',
              label: 'cURL',
              code: `curl https://api.yourdomain.com/v1/subscription_items/si_z_9Km2pQxR4vL8nHw \\
  -H "x-api-key: sk_live_z_YOUR_API_KEY" \\
  -d quantity=3`,
            },
            {
              id: 'node',
              label: 'Node.js',
              code: `${NODE_INIT}

const subscriptionItem = await zoneless.subscriptionItems.update(
  'si_z_9Km2pQxR4vL8nHw',
  {
    quantity: 3,
  }
);`,
            },
          ],
        },
        {
          type: 'object',
          title: 'RESPONSE',
          code: SUBSCRIPTION_ITEM_UPDATED_JSON,
        },
      ],
    },
  ],
};

// ============================================
// Retrieve
// ============================================

export const SUBSCRIPTION_ITEMS_RETRIEVE_PAGE: DocPage = {
  id: 'retrieve',
  title: 'Retrieve a subscription item',
  description: 'Retrieves the subscription item with the given ID.',
  stripeDocsUrl: 'https://docs.stripe.com/api/subscription_items/retrieve',
  endpoints: [{ method: 'GET', path: '/v1/subscription_items/:id' }],
  sections: [
    {
      left: [
        { type: 'heading', level: 2, text: 'Parameters' },
        { type: 'paragraph', text: 'No parameters.' },
        { type: 'heading', level: 2, text: 'Returns' },
        {
          type: 'paragraph',
          text: 'Returns a subscription item if a valid subscription item ID was provided. Raises an error otherwise.',
        },
      ],
      right: [
        {
          type: 'code',
          endpoint: { method: 'GET', path: '/v1/subscription_items/:id' },
          tabs: [
            {
              id: 'curl',
              label: 'cURL',
              code: `curl https://api.yourdomain.com/v1/subscription_items/si_z_9Km2pQxR4vL8nHw \\
  -H "x-api-key: sk_live_z_YOUR_API_KEY"`,
            },
            {
              id: 'node',
              label: 'Node.js',
              code: `${NODE_INIT}

const subscriptionItem = await zoneless.subscriptionItems.retrieve(
  'si_z_9Km2pQxR4vL8nHw'
);`,
            },
          ],
        },
        {
          type: 'object',
          title: 'RESPONSE',
          code: SUBSCRIPTION_ITEM_OBJECT_JSON,
        },
      ],
    },
  ],
};

// ============================================
// List
// ============================================

const LIST_SUBSCRIPTION_ITEMS_PARAMETERS: Attribute[] = [
  {
    name: 'subscription',
    type: 'string',
    required: true,
    description:
      'The identifier of the subscription whose items to return. This parameter is required.',
  },
  {
    name: 'limit',
    type: 'integer',
    description:
      'A limit on the number of objects to be returned. Limit can range between 1 and 100, and the default is 10.',
  },
];

const LIST_SUBSCRIPTION_ITEMS_MORE_PARAMETERS: Attribute[] = [
  {
    name: 'ending_before',
    type: 'string',
    description:
      'A cursor for use in pagination. <code>ending_before</code> is an object ID that defines your place in the list. For instance, if you make a list request and receive 100 objects, starting with <code>si_z_bar</code>, your subsequent call can include <code>ending_before=si_z_bar</code> in order to fetch the previous page of the list.',
  },
  {
    name: 'starting_after',
    type: 'string',
    description:
      'A cursor for use in pagination. <code>starting_after</code> is an object ID that defines your place in the list. For instance, if you make a list request and receive 100 objects, ending with <code>si_z_foo</code>, your subsequent call can include <code>starting_after=si_z_foo</code> in order to fetch the next page of the list.',
  },
];

export const SUBSCRIPTION_ITEMS_LIST_PAGE: DocPage = {
  id: 'list',
  title: 'List all subscription items',
  description:
    'Returns the items on a subscription. Items are returned sorted by creation date, with the earliest created items appearing first.',
  stripeDocsUrl: 'https://docs.stripe.com/api/subscription_items/list',
  endpoints: [{ method: 'GET', path: '/v1/subscription_items' }],
  sections: [
    {
      left: [
        { type: 'heading', level: 2, text: 'Parameters' },
        {
          type: 'attributes',
          attributes: LIST_SUBSCRIPTION_ITEMS_PARAMETERS,
          moreAttributes: LIST_SUBSCRIPTION_ITEMS_MORE_PARAMETERS,
        },
        { type: 'heading', level: 2, text: 'Returns' },
        {
          type: 'paragraph',
          text: 'A dictionary with a <code>data</code> property that contains an array of up to <code>limit</code> subscription items, starting after subscription item <code>starting_after</code>. Each entry in the array is a separate subscription item object. If no more items are available, the resulting array will be empty.',
          html: true,
        },
      ],
      right: [
        {
          type: 'code',
          endpoint: { method: 'GET', path: '/v1/subscription_items' },
          tabs: [
            {
              id: 'curl',
              label: 'cURL',
              code: `curl -G https://api.yourdomain.com/v1/subscription_items \\
  -H "x-api-key: sk_live_z_YOUR_API_KEY" \\
  -d subscription=sub_z_1QvK9mR2eZvKYlo2CxH4pN8w \\
  -d limit=3`,
            },
            {
              id: 'node',
              label: 'Node.js',
              code: `${NODE_INIT}

const subscriptionItems = await zoneless.subscriptionItems.list({
  subscription: 'sub_z_1QvK9mR2eZvKYlo2CxH4pN8w',
  limit: 3,
});`,
            },
          ],
        },
        {
          type: 'object',
          title: 'RESPONSE',
          code: LIST_SUBSCRIPTION_ITEMS_RESPONSE_JSON,
        },
      ],
    },
  ],
};

// ============================================
// Delete
// ============================================

const DELETE_SUBSCRIPTION_ITEM_PARAMETERS: Attribute[] = [
  {
    name: 'clear_usage',
    type: 'boolean',
    description:
      'Delete all usage for the given subscription item. Zoneless removes the item immediately, so this value is accepted and ignored.',
  },
  {
    name: 'payment_behavior',
    type: 'enum',
    description:
      'Controls how to handle payment when a subscription update requires payment and <code>collection_method=charge_automatically</code>.',
    enumValues: [
      {
        value: 'allow_incomplete',
        description:
          'Transition the subscription to <code>past_due</code> if payment fails.',
      },
      {
        value: 'default_incomplete',
        description:
          'Transition the subscription to <code>past_due</code> without attempting payment.',
      },
      {
        value: 'error_if_incomplete',
        description:
          'Return an HTTP <code>402</code> error and do not update the subscription.',
      },
      {
        value: 'pending_if_incomplete',
        description:
          'Create a pending update that applies only if the payment succeeds.',
      },
    ],
    enumNote:
      '<strong>Difference from Stripe:</strong> Zoneless deletes the item immediately, so this parameter has no effect.',
  },
  {
    name: 'proration_behavior',
    type: 'enum',
    description:
      'Determines how to handle prorations when the billing cycle changes or when an item quantity changes. Defaults to <code>create_prorations</code>.',
    enumValues: [
      { value: 'always_invoice' },
      { value: 'create_prorations' },
      { value: 'none' },
    ],
    enumNote:
      '<strong>Difference from Stripe:</strong> Zoneless does not create proration invoice items, so this value is accepted and ignored.',
  },
  {
    name: 'proration_date',
    type: 'timestamp',
    description:
      'Only used when <code>proration_behavior</code> creates prorations. Zoneless does not create prorations, so this value is accepted and ignored.',
  },
];

export const SUBSCRIPTION_ITEMS_DELETE_PAGE: DocPage = {
  id: 'delete',
  title: 'Delete a subscription item',
  description:
    'Removes an item from the subscription. Removing an item does not cancel the subscription.',
  stripeDocsUrl: 'https://docs.stripe.com/api/subscription_items/delete',
  endpoints: [{ method: 'DELETE', path: '/v1/subscription_items/:id' }],
  sections: [
    {
      left: [
        { type: 'heading', level: 2, text: 'Parameters' },
        {
          type: 'attributes',
          attributes: DELETE_SUBSCRIPTION_ITEM_PARAMETERS,
        },
        { type: 'heading', level: 2, text: 'Returns' },
        {
          type: 'paragraph',
          text: "An object with the deleted subscription item's ID and a deleted flag upon success. Otherwise, this call raises an error, such as if the subscription item has already been deleted.",
        },
      ],
      right: [
        {
          type: 'code',
          endpoint: { method: 'DELETE', path: '/v1/subscription_items/:id' },
          tabs: [
            {
              id: 'curl',
              label: 'cURL',
              code: `curl -X DELETE https://api.yourdomain.com/v1/subscription_items/si_z_9Km2pQxR4vL8nHw \\
  -H "x-api-key: sk_live_z_YOUR_API_KEY"`,
            },
            {
              id: 'node',
              label: 'Node.js',
              code: `${NODE_INIT}

const deleted = await zoneless.subscriptionItems.del(
  'si_z_9Km2pQxR4vL8nHw'
);`,
            },
          ],
        },
        {
          type: 'object',
          title: 'RESPONSE',
          code: SUBSCRIPTION_ITEM_DELETED_JSON,
        },
      ],
    },
  ],
};

export const SUBSCRIPTION_ITEMS_PAGES: DocPage[] = [
  SUBSCRIPTION_ITEMS_OVERVIEW_PAGE,
  SUBSCRIPTION_ITEMS_CREATE_PAGE,
  SUBSCRIPTION_ITEMS_UPDATE_PAGE,
  SUBSCRIPTION_ITEMS_RETRIEVE_PAGE,
  SUBSCRIPTION_ITEMS_LIST_PAGE,
  SUBSCRIPTION_ITEMS_DELETE_PAGE,
];
