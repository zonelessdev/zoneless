import { DocSubSection, DocPage, Attribute } from './types';
import { GetResourceEventAttributes } from './event-types';
import { NODE_INIT, BuildEndpointSummaries } from './shared';

export const PAYOUTS_SUBSECTION: DocSubSection = {
  id: 'payouts',
  title: 'Payouts',
  children: [
    { id: 'object', title: 'The Payout object' },
    { id: 'create', title: 'Create a payout' },
    { id: 'update', title: 'Update a payout' },
    { id: 'retrieve', title: 'Retrieve a payout' },
    { id: 'list', title: 'List all payouts' },
    { id: 'cancel', title: 'Cancel a payout' },
    { id: 'build', title: 'Build a payout batch' },
    { id: 'broadcast', title: 'Broadcast a payout batch' },
  ],
};

// ============================================
// Shared Data
// ============================================
const PAYOUT_OBJECT_JSON = `{
  "id": "po_z_1Nv0FGQ9RKHgCVdK",
  "object": "payout",
  "account": "acct_z_1Nv0FGQ9RKHgCVdK",
  "amount": 110000,
  "arrival_date": 1704067200,
  "automatic": false,
  "balance_transaction": "txn_z_1Nv0FGQ9RKHgCVdK",
  "created": 1704067200,
  "currency": "usdc",
  "description": "Weekly seller payout",
  "destination": "wa_z_1Nv0FGQ9RKHgCVdK",
  "failure_code": null,
  "failure_message": null,
  "livemode": true,
  "metadata": {},
  "method": "instant",
  "platform_account": "acct_z_Platform123abc",
  "source_type": "wallet",
  "statement_descriptor": null,
  "status": "paid",
  "type": "wallet"
}`;

const PAYOUT_PAID_OBJECT_JSON = `{
  "id": "po_z_1Nv0FGQ9RKHgCVdK",
  "object": "payout",
  "account": "acct_z_1Nv0FGQ9RKHgCVdK",
  "amount": 110000,
  "arrival_date": 1704067200,
  "automatic": false,
  "balance_transaction": "txn_z_1Nv0FGQ9RKHgCVdK",
  "created": 1704067200,
  "currency": "usdc",
  "description": "Weekly seller payout",
  "destination": "wa_z_1Nv0FGQ9RKHgCVdK",
  "failure_code": null,
  "failure_message": null,
  "livemode": true,
  "metadata": {
    "network": "solana-mainnet",
    "blockchain_tx": "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
    "viewer_url": "https://solscan.io/tx/5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
    "gas_fee": 5000,
    "gas_fee_currency": "SOL"
  },
  "method": "instant",
  "platform_account": "acct_z_Platform123abc",
  "source_type": "wallet",
  "statement_descriptor": null,
  "status": "paid",
  "type": "wallet"
}`;

const PAYOUT_PENDING_OBJECT_JSON = `{
  "id": "po_z_1Nv0FGQ9RKHgCVdK",
  "object": "payout",
  "account": "acct_z_1Nv0FGQ9RKHgCVdK",
  "amount": 110000,
  "arrival_date": 1704067200,
  "automatic": false,
  "balance_transaction": "txn_z_1Nv0FGQ9RKHgCVdK",
  "created": 1704067200,
  "currency": "usdc",
  "description": null,
  "destination": "wa_z_1Nv0FGQ9RKHgCVdK",
  "failure_code": null,
  "failure_message": null,
  "livemode": true,
  "metadata": {},
  "method": "instant",
  "platform_account": "acct_z_Platform123abc",
  "source_type": "wallet",
  "statement_descriptor": null,
  "status": "pending",
  "type": "wallet"
}`;

const PAYOUT_ATTRIBUTES: Attribute[] = [
  {
    name: 'id',
    type: 'string',
    description:
      'Unique identifier for the object. Zoneless payout IDs are prefixed with <code>po_z_</code>.',
  },
  {
    name: 'object',
    type: 'string',
    description:
      "String representing the object's type. Objects of the same type share the same value.",
  },
  {
    name: 'account',
    type: 'string',
    description: 'The connected account ID this payout belongs to.',
    enumNote:
      "<strong>Zoneless extension:</strong> This field is not present in Stripe's payout object. It identifies which connected account's balance is being debited.",
  },
  {
    name: 'amount',
    type: 'integer',
    description:
      "The amount (in cents) that transfers to the connected account's wallet.",
  },
  {
    name: 'arrival_date',
    type: 'timestamp',
    description:
      "Date when the payout arrived at the destination wallet. Due to Solana's speed, this is typically seconds after creation.",
    enumNote:
      '<strong>Difference from Stripe:</strong> Stripe payouts can take days to arrive at a bank account. Zoneless payouts on Solana typically complete within seconds.',
  },
  {
    name: 'automatic',
    type: 'boolean',
    description:
      "Returns <code>true</code> if the payout is created by an automated payout schedule and <code>false</code> if it's requested manually via the API.",
  },
  {
    name: 'balance_transaction',
    type: 'string',
    nullable: true,
    description:
      "ID of the balance transaction that describes the impact of this payout on the connected account's balance.",
  },
  {
    name: 'created',
    type: 'timestamp',
    description:
      'Time at which the object was created. Measured in seconds since the Unix epoch.',
  },
  {
    name: 'currency',
    type: 'string',
    description:
      'Three-letter currency code, in lowercase. For Zoneless, this is typically <code>usdc</code>.',
    enumNote:
      '<strong>Difference from Stripe:</strong> Stripe uses ISO currency codes like <code>usd</code>. Zoneless uses <code>usdc</code> for USDC stablecoin payouts.',
  },
  {
    name: 'description',
    type: 'string',
    nullable: true,
    description:
      'An arbitrary string attached to the object. Often useful for displaying to users.',
  },
  {
    name: 'destination',
    type: 'string',
    description: 'ID of the external wallet the payout is sent to.',
    enumNote:
      "<strong>Difference from Stripe:</strong> Stripe's destination is a bank account or card ID. Zoneless uses an external wallet ID (<code>wa_z_</code> prefix) representing a Solana wallet address.",
  },
  {
    name: 'failure_code',
    type: 'enum',
    nullable: true,
    description:
      'Error code that provides a reason for a payout failure, if available.',
    enumValues: [
      {
        value: 'insufficient_funds',
        description:
          'The connected account has insufficient funds in their balance.',
      },
      {
        value: 'wallet_not_found',
        description: 'The destination wallet could not be found or is invalid.',
      },
      {
        value: 'sanctioned_address',
        description: 'The destination wallet is on a sanctions list.',
      },
      {
        value: 'blockchain_error',
        description: 'The Solana blockchain returned an error during transfer.',
      },
      {
        value: 'could_not_process',
        description: 'The payout could not be processed.',
      },
      { value: 'declined', description: 'The payout was declined.' },
      {
        value: 'invalid_currency',
        description: 'The currency is not supported.',
      },
    ],
  },
  {
    name: 'failure_message',
    type: 'string',
    nullable: true,
    description:
      'Message that provides the reason for a payout failure, if available.',
  },
  {
    name: 'livemode',
    type: 'boolean',
    description:
      'Has the value <code>true</code> if the object exists in live mode or the value <code>false</code> if the object exists in test mode.',
  },
  {
    name: 'metadata',
    type: 'object',
    description:
      'Set of key-value pairs that you can attach to an object. This can be useful for storing additional information about the object in a structured format.',
    enumNote:
      '<strong>Zoneless extension:</strong> After a successful payout, this object is populated with blockchain transaction details: <code>network</code>, <code>blockchain_tx</code>, <code>viewer_url</code>, <code>gas_fee</code>, and <code>gas_fee_currency</code>.',
  },
  {
    name: 'method',
    type: 'enum',
    description: 'The method used to send this payout.',
    enumValues: [
      {
        value: 'instant',
        description:
          'Immediate transfer to the destination wallet. Default for Zoneless.',
      },
      { value: 'standard', description: 'Standard transfer timing.' },
    ],
    enumNote:
      '<strong>Difference from Stripe:</strong> Zoneless defaults to <code>instant</code> since Solana transactions settle in seconds. Stripe defaults to <code>standard</code> for bank transfers.',
  },
  {
    name: 'source_type',
    type: 'string',
    description:
      'The source balance this payout came from. Always <code>wallet</code> for Zoneless.',
    enumNote:
      '<strong>Difference from Stripe:</strong> Stripe uses <code>card</code>, <code>bank_account</code>, or <code>fpx</code>. Zoneless uses <code>wallet</code> representing the USDC balance.',
  },
  {
    name: 'statement_descriptor',
    type: 'string',
    nullable: true,
    description:
      'Extra information about the payout for internal reference. This is stored for record-keeping but does not appear on blockchain transactions.',
    enumNote:
      "<strong>Difference from Stripe:</strong> Bank statement descriptors don't apply to blockchain transactions. This field is retained for API compatibility.",
  },
  {
    name: 'status',
    type: 'enum',
    description: 'Current status of the payout.',
    enumValues: [
      {
        value: 'pending',
        description: 'The payout has been created and is waiting to be sent.',
      },
      {
        value: 'processing',
        description: 'The payout is being prepared for blockchain submission.',
      },
      {
        value: 'in_transit',
        description:
          'The payout has been submitted to the Solana blockchain and is awaiting confirmation.',
      },
      {
        value: 'paid',
        description: 'The payout has been confirmed on the blockchain.',
      },
      {
        value: 'failed',
        description:
          'The payout failed. Check <code>failure_code</code> and <code>failure_message</code> for details.',
      },
      {
        value: 'canceled',
        description: 'The payout was canceled before it was sent.',
      },
    ],
  },
  {
    name: 'type',
    type: 'string',
    description:
      'The destination type. Always <code>wallet</code> for Zoneless USDC payouts.',
    enumNote:
      '<strong>Difference from Stripe:</strong> Stripe uses <code>bank_account</code> or <code>card</code>. Zoneless uses <code>wallet</code> for Solana wallets.',
  },
];

const PAYOUT_MORE_ATTRIBUTES: Attribute[] = [
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
// Pages
// ============================================
export const PAYOUTS_OVERVIEW_PAGE: DocPage = {
  id: 'object',
  title: 'The Payout object',
  description:
    "A Payout object is created when you send funds from a connected account's Zoneless balance to their external Solana wallet. Payouts transfer USDC when you process them with .processAll() or .processBatch(), and typically complete within seconds due to Solana's fast finality.",
  stripeDocsUrl: 'https://docs.stripe.com/api/payouts',
  endpoints: BuildEndpointSummaries(PAYOUTS_SUBSECTION, [
    { method: 'POST', path: '/v1/payouts', pageId: 'create' },
    { method: 'POST', path: '/v1/payouts/:id', pageId: 'update' },
    { method: 'GET', path: '/v1/payouts/:id', pageId: 'retrieve' },
    { method: 'GET', path: '/v1/payouts', pageId: 'list' },
    { method: 'POST', path: '/v1/payouts/:id/cancel', pageId: 'cancel' },
    { method: 'POST', path: '/v1/payouts/build', pageId: 'build' },
    { method: 'POST', path: '/v1/payouts/broadcast', pageId: 'broadcast' },
  ]),
  events: GetResourceEventAttributes('payout'),
  sections: [
    {
      left: [
        {
          type: 'callout',
          variant: 'info',
          title: 'Key concept: ',
          text: "Payouts track sending USDC from a connected account's balance to their Solana wallet. Create a payout first; it stays <code>pending</code> until you process it. In live mode, processing signs and broadcasts a Solana transaction from the platform wallet, which needs enough USDC and SOL for network fees. In simulated test mode, use the same build and broadcast (or <code>processAll</code>) steps; settlement is fake and does not need a wallet signature.",
          html: true,
        },
        {
          type: 'callout',
          variant: 'warning',
          title: 'Processing payouts: ',
          text: 'Unlike Stripe where bank transfers happen automatically, Zoneless payouts stay <code>pending</code> until you process them. After creating payouts, call <code>payouts.processAll()</code> or <code>payouts.processBatch()</code>, or the lower-level <code>build</code> and <code>broadcast</code> endpoints. Live mode requires your platform wallet secret key to sign. Simulated test mode uses the same endpoints without a real signature: pass the unsigned transaction through to broadcast.',
          html: true,
        },
        {
          type: 'callout',
          variant: 'warning',
          title: 'Important: ',
          text: 'Unlike bank transfers, blockchain transactions cannot be reversed. There is no <code>/reverse</code> endpoint. Ensure payouts are correct before creating them.',
          html: true,
        },
        { type: 'heading', level: 2, text: 'Attributes' },
        {
          type: 'attributes',
          attributes: PAYOUT_ATTRIBUTES,
          moreAttributes: PAYOUT_MORE_ATTRIBUTES,
        },
      ],
      right: [
        {
          type: 'object',
          title: 'THE PAYOUT OBJECT',
          code: PAYOUT_OBJECT_JSON,
        },
      ],
    },
  ],
};

// ============================================
// Create Payout Parameters
// ============================================
const CREATE_PAYOUT_PARAMETERS: Attribute[] = [
  {
    name: 'amount',
    type: 'integer',
    required: true,
    description: 'A positive integer in cents representing how much to payout.',
  },
  {
    name: 'currency',
    type: 'string',
    description:
      'Three-letter currency code, in lowercase. Defaults to <code>usdc</code>.',
    enumNote:
      '<strong>Difference from Stripe:</strong> Zoneless uses <code>usdc</code> for USDC stablecoin payouts.',
  },
  {
    name: 'description',
    type: 'string',
    description:
      'An arbitrary string attached to the object. Often useful for displaying to users.',
  },
  {
    name: 'destination',
    type: 'string',
    description:
      "The ID of an external wallet to send the payout to. If not provided, uses the account's default external wallet.",
    enumNote:
      '<strong>Difference from Stripe:</strong> Stripe uses bank account or card IDs. Zoneless uses external wallet IDs (<code>wa_z_</code> prefix).',
  },
  {
    name: 'metadata',
    type: 'object',
    description:
      'Set of key-value pairs that you can attach to an object. This can be useful for storing additional information about the object in a structured format. Individual keys can be unset by posting an empty value to them. All keys can be unset by posting an empty value to <code>metadata</code>.',
  },
  {
    name: 'method',
    type: 'enum',
    description:
      'The method used to send this payout. Defaults to <code>instant</code>.',
    enumValues: [
      { value: 'instant', description: 'Immediate transfer (default).' },
      { value: 'standard', description: 'Standard transfer timing.' },
    ],
  },
  {
    name: 'statement_descriptor',
    type: 'string',
    description:
      'A string for internal reference (up to 22 characters). This is stored for record-keeping but does not appear on blockchain transactions.',
  },
];

export const PAYOUTS_CREATE_PAGE: DocPage = {
  id: 'create',
  title: 'Create a payout',
  description:
    "To send funds from a connected account's balance to their Solana wallet, create a new payout object. The connected account's balance must cover the payout amount. If it doesn't, you receive an \"Insufficient Funds\" error.",
  endpoints: [{ method: 'POST', path: '/v1/payouts' }],
  sections: [
    {
      left: [
        {
          type: 'callout',
          variant: 'info',
          title: 'Platform requirements: ',
          text: "Your platform's wallet must have sufficient USDC to cover the payout amount, plus SOL for transaction gas fees. Zoneless transfers USDC from the platform wallet to the connected account's wallet.",
        },
        { type: 'heading', level: 2, text: 'Parameters' },
        {
          type: 'attributes',
          attributes: CREATE_PAYOUT_PARAMETERS,
        },
        { type: 'heading', level: 2, text: 'Returns' },
        {
          type: 'paragraph',
          text: 'Returns a <code>Payout</code> object if the call succeeds. The payout is created in <code>pending</code> status in both test and live. Process it with <code>payouts.processAll()</code>, <code>payouts.processBatch()</code>, or the <a href="#payouts-build">build</a>/<a href="#payouts-broadcast">broadcast</a> endpoints. Simulated test mode still requires this step; broadcast a dummy transaction (the unsigned payload) instead of a wallet signature.',
          html: true,
        },
      ],
      right: [
        {
          type: 'code',
          endpoint: { method: 'POST', path: '/v1/payouts' },
          tabs: [
            {
              id: 'curl',
              label: 'cURL',
              code: `curl https://api.yourdomain.com/v1/payouts \\
  -H "x-api-key: sk_live_z_YOUR_API_KEY" \\
  -H "Zoneless-Account: acct_z_1Nv0FGQ9RKHgCVdK" \\
  -d amount=110000 \\
  -d currency=usdc`,
            },
            {
              id: 'node',
              label: 'Node.js',
              code: `${NODE_INIT}

const payout = await zoneless.payouts.create({
  amount: 110000,
  currency: 'usdc',
}, {
  zonelessAccount: 'acct_z_1Nv0FGQ9RKHgCVdK',
});`,
            },
          ],
        },
        { type: 'object', title: 'RESPONSE', code: PAYOUT_PENDING_OBJECT_JSON },
      ],
    },
  ],
};

// ============================================
// Update Payout Parameters
// ============================================
const UPDATE_PAYOUT_PARAMETERS: Attribute[] = [
  {
    name: 'metadata',
    type: 'object',
    description:
      'Set of key-value pairs that you can attach to an object. This can be useful for storing additional information about the object in a structured format. Individual keys can be unset by posting an empty value to them. All keys can be unset by posting an empty value to <code>metadata</code>.',
  },
];

const PAYOUT_UPDATE_RESPONSE_JSON = `{
  "id": "po_z_1Nv0FGQ9RKHgCVdK",
  "object": "payout",
  "account": "acct_z_1Nv0FGQ9RKHgCVdK",
  "amount": 110000,
  "arrival_date": 1704067200,
  "automatic": false,
  "balance_transaction": "txn_z_1Nv0FGQ9RKHgCVdK",
  "created": 1704067200,
  "currency": "usdc",
  "description": null,
  "destination": "wa_z_1Nv0FGQ9RKHgCVdK",
  "failure_code": null,
  "failure_message": null,
  "livemode": true,
  "metadata": {
    "order_id": "6735"
  },
  "method": "instant",
  "platform_account": "acct_z_Platform123abc",
  "source_type": "wallet",
  "statement_descriptor": null,
  "status": "paid",
  "type": "wallet"
}`;

export const PAYOUTS_UPDATE_PAGE: DocPage = {
  id: 'update',
  title: 'Update a payout',
  description:
    'Updates the specified payout by setting the values of the parameters you pass. Parameters not provided are left unchanged. This request only accepts the metadata as arguments.',
  endpoints: [{ method: 'POST', path: '/v1/payouts/:id' }],
  sections: [
    {
      left: [
        { type: 'heading', level: 2, text: 'Parameters' },
        {
          type: 'attributes',
          attributes: UPDATE_PAYOUT_PARAMETERS,
        },
        { type: 'heading', level: 2, text: 'Returns' },
        {
          type: 'paragraph',
          text: 'Returns the <code>Payout</code> object if the update succeeds. This call raises an error if update parameters are invalid.',
          html: true,
        },
      ],
      right: [
        {
          type: 'code',
          endpoint: { method: 'POST', path: '/v1/payouts/:id' },
          tabs: [
            {
              id: 'curl',
              label: 'cURL',
              code: `curl https://api.yourdomain.com/v1/payouts/po_z_1Nv0FGQ9RKHgCVdK \\
  -H "x-api-key: sk_live_z_YOUR_API_KEY" \\
  -d "metadata[order_id]"=6735`,
            },
            {
              id: 'node',
              label: 'Node.js',
              code: `${NODE_INIT}

const payout = await zoneless.payouts.update(
  'po_z_1Nv0FGQ9RKHgCVdK',
  {
    metadata: {
      order_id: '6735',
    },
  }
);`,
            },
          ],
        },
        {
          type: 'object',
          title: 'RESPONSE',
          code: PAYOUT_UPDATE_RESPONSE_JSON,
        },
      ],
    },
  ],
};

// ============================================
// Retrieve Payout
// ============================================
export const PAYOUTS_RETRIEVE_PAGE: DocPage = {
  id: 'retrieve',
  title: 'Retrieve a payout',
  description:
    'Retrieves the details of an existing payout. Supply the unique payout ID from either a payout creation request or the payout list. Zoneless returns the corresponding payout information.',
  endpoints: [{ method: 'GET', path: '/v1/payouts/:id' }],
  sections: [
    {
      left: [
        { type: 'heading', level: 2, text: 'Parameters' },
        { type: 'paragraph', text: 'No parameters.' },
        { type: 'heading', level: 2, text: 'Returns' },
        {
          type: 'paragraph',
          text: 'Returns a <code>Payout</code> object if you provide a valid identifier. Raises an error otherwise.',
          html: true,
        },
      ],
      right: [
        {
          type: 'code',
          endpoint: { method: 'GET', path: '/v1/payouts/:id' },
          tabs: [
            {
              id: 'curl',
              label: 'cURL',
              code: `curl https://api.yourdomain.com/v1/payouts/po_z_1Nv0FGQ9RKHgCVdK \\
  -H "x-api-key: sk_live_z_YOUR_API_KEY"`,
            },
            {
              id: 'node',
              label: 'Node.js',
              code: `${NODE_INIT}

const payout = await zoneless.payouts.retrieve('po_z_1Nv0FGQ9RKHgCVdK');`,
            },
          ],
        },
        { type: 'object', title: 'RESPONSE', code: PAYOUT_PAID_OBJECT_JSON },
      ],
    },
  ],
};

// ============================================
// List Payouts Parameters
// ============================================
const LIST_PAYOUTS_PARAMETERS: Attribute[] = [
  {
    name: 'arrival_date',
    type: 'object',
    description:
      'Only return payouts that arrived during the given date interval.',
    expandable: true,
    children: [
      {
        name: 'gt',
        type: 'integer',
        description: 'Minimum value to filter by (exclusive).',
      },
      {
        name: 'gte',
        type: 'integer',
        description: 'Minimum value to filter by (inclusive).',
      },
      {
        name: 'lt',
        type: 'integer',
        description: 'Maximum value to filter by (exclusive).',
      },
      {
        name: 'lte',
        type: 'integer',
        description: 'Maximum value to filter by (inclusive).',
      },
    ],
  },
  {
    name: 'created',
    type: 'object',
    description:
      'Only return payouts that were created during the given date interval.',
    expandable: true,
    children: [
      {
        name: 'gt',
        type: 'integer',
        description: 'Minimum value to filter by (exclusive).',
      },
      {
        name: 'gte',
        type: 'integer',
        description: 'Minimum value to filter by (inclusive).',
      },
      {
        name: 'lt',
        type: 'integer',
        description: 'Maximum value to filter by (exclusive).',
      },
      {
        name: 'lte',
        type: 'integer',
        description: 'Maximum value to filter by (inclusive).',
      },
    ],
  },
  {
    name: 'destination',
    type: 'string',
    description:
      'The ID of an external wallet—only return payouts sent to this wallet.',
  },
  {
    name: 'ending_before',
    type: 'string',
    description:
      'A cursor for use in pagination. <code>ending_before</code> is an object ID that defines your place in the list. For instance, if you make a list request and receive 100 objects, starting with <code>po_z_bar</code>, your subsequent call can include <code>ending_before=po_z_bar</code> in order to fetch the previous page of the list.',
  },
  {
    name: 'limit',
    type: 'integer',
    description:
      'A limit on the number of objects to be returned. Limit can range between 1 and 100, and the default is 10.',
  },
  {
    name: 'starting_after',
    type: 'string',
    description:
      'A cursor for use in pagination. <code>starting_after</code> is an object ID that defines your place in the list. For instance, if you make a list request and receive 100 objects, ending with <code>po_z_foo</code>, your subsequent call can include <code>starting_after=po_z_foo</code> in order to fetch the next page of the list.',
  },
  {
    name: 'status',
    type: 'enum',
    description: 'Only return payouts that have the given status.',
    enumValues: [
      'pending',
      'processing',
      'in_transit',
      'paid',
      'failed',
      'canceled',
    ],
  },
];

const LIST_PAYOUTS_RESPONSE_JSON = `{
  "object": "list",
  "url": "/v1/payouts",
  "has_more": false,
  "data": [
    {
      "id": "po_z_1Nv0FGQ9RKHgCVdK",
      "object": "payout",
      "account": "acct_z_1Nv0FGQ9RKHgCVdK",
      "amount": 110000,
      "arrival_date": 1704067200,
      "automatic": false,
      "balance_transaction": "txn_z_1Nv0FGQ9RKHgCVdK",
      "created": 1704067200,
      "currency": "usdc",
      "description": null,
      "destination": "wa_z_1Nv0FGQ9RKHgCVdK",
      "failure_code": null,
      "failure_message": null,
      "livemode": true,
      "metadata": {},
      "method": "instant",
      "platform_account": "acct_z_Platform123abc",
      "source_type": "wallet",
      "statement_descriptor": null,
      "status": "paid",
      "type": "wallet"
    }
  ]
}`;

export const PAYOUTS_LIST_PAGE: DocPage = {
  id: 'list',
  title: 'List all payouts',
  description:
    'Returns a list of existing payouts sent to connected account wallets. The payouts return in sorted order, with the most recently created payouts appearing first.',
  endpoints: [{ method: 'GET', path: '/v1/payouts' }],
  sections: [
    {
      left: [
        { type: 'heading', level: 2, text: 'Parameters' },
        {
          type: 'attributes',
          attributes: LIST_PAYOUTS_PARAMETERS,
        },
        { type: 'heading', level: 2, text: 'Returns' },
        {
          type: 'paragraph',
          text: 'A dictionary with a <code>data</code> property that contains an array of up to <code>limit</code> payouts, starting after payout <code>starting_after</code>. Each entry in the array is a separate <code>Payout</code> object. If no other payouts are available, the resulting array is empty.',
          html: true,
        },
      ],
      right: [
        {
          type: 'code',
          endpoint: { method: 'GET', path: '/v1/payouts' },
          tabs: [
            {
              id: 'curl',
              label: 'cURL',
              code: `curl -G https://api.yourdomain.com/v1/payouts \\
  -H "x-api-key: sk_live_z_YOUR_API_KEY" \\
  -d limit=3`,
            },
            {
              id: 'node',
              label: 'Node.js',
              code: `${NODE_INIT}

const payouts = await zoneless.payouts.list({
  limit: 3,
});`,
            },
          ],
        },
        { type: 'object', title: 'RESPONSE', code: LIST_PAYOUTS_RESPONSE_JSON },
      ],
    },
  ],
};

// ============================================
// Cancel Payout
// ============================================
const PAYOUT_CANCELED_RESPONSE_JSON = `{
  "id": "po_z_1Nv0FGQ9RKHgCVdK",
  "object": "payout",
  "account": "acct_z_1Nv0FGQ9RKHgCVdK",
  "amount": 110000,
  "arrival_date": 1704067200,
  "automatic": false,
  "balance_transaction": "txn_z_1Nv0FGQ9RKHgCVdK",
  "created": 1704067200,
  "currency": "usdc",
  "description": null,
  "destination": "wa_z_1Nv0FGQ9RKHgCVdK",
  "failure_code": null,
  "failure_message": null,
  "livemode": true,
  "metadata": {},
  "method": "instant",
  "platform_account": "acct_z_Platform123abc",
  "source_type": "wallet",
  "statement_descriptor": null,
  "status": "canceled",
  "type": "wallet"
}`;

export const PAYOUTS_CANCEL_PAGE: DocPage = {
  id: 'cancel',
  title: 'Cancel a payout',
  description:
    "You can cancel a previously created payout if its status is pending. Zoneless refunds the funds to the connected account's available balance. You cannot cancel payouts that have already been sent to the blockchain.",
  endpoints: [{ method: 'POST', path: '/v1/payouts/:id/cancel' }],
  sections: [
    {
      left: [
        {
          type: 'callout',
          variant: 'warning',
          title: 'Important: ',
          text: 'Payouts can only be canceled while in <code>pending</code> status. Once a payout transitions to <code>in_transit</code> or <code>paid</code>, it cannot be canceled or reversed—blockchain transactions are final.',
          html: true,
        },
        { type: 'heading', level: 2, text: 'Parameters' },
        { type: 'paragraph', text: 'No parameters.' },
        { type: 'heading', level: 2, text: 'Returns' },
        {
          type: 'paragraph',
          text: 'Returns the <code>Payout</code> object with <code>status</code> set to <code>canceled</code> if the cancellation succeeds. Returns an error if the payout has already been sent or is not in <code>pending</code> status.',
          html: true,
        },
      ],
      right: [
        {
          type: 'code',
          endpoint: { method: 'POST', path: '/v1/payouts/:id/cancel' },
          tabs: [
            {
              id: 'curl',
              label: 'cURL',
              code: `curl -X POST https://api.yourdomain.com/v1/payouts/po_z_1Nv0FGQ9RKHgCVdK/cancel \\
  -H "x-api-key: sk_live_z_YOUR_API_KEY"`,
            },
            {
              id: 'node',
              label: 'Node.js',
              code: `${NODE_INIT}

const payout = await zoneless.payouts.cancel('po_z_1Nv0FGQ9RKHgCVdK');`,
            },
          ],
        },
        {
          type: 'object',
          title: 'RESPONSE',
          code: PAYOUT_CANCELED_RESPONSE_JSON,
        },
      ],
    },
  ],
};

// ============================================
// Build Payouts Batch Parameters
// ============================================
const BUILD_PAYOUTS_BATCH_PARAMETERS: Attribute[] = [
  {
    name: 'payouts',
    type: 'array',
    required: true,
    description:
      'Array of payout IDs to include in the batch transaction. Maximum 10 payouts per batch.',
    enumNote:
      '<strong>Zoneless-specific:</strong> This endpoint is unique to Zoneless and enables self-custodial payout processing where your platform signs transactions locally.',
  },
];

const BUILD_PAYOUTS_BATCH_RESPONSE_JSON = `{
  "object": "payout_batch_build",
  "unsigned_transaction": "AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAQAHDw...",
  "estimated_fee_lamports": 5000,
  "blockhash": "GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi",
  "last_valid_block_height": 158436852,
  "payouts": [
    {
      "id": "po_z_1Nv0FGQ9RKHgCVdK",
      "object": "payout",
      "account": "acct_z_1Nv0FGQ9RKHgCVdK",
      "amount": 110000,
      "status": "pending"
    },
    {
      "id": "po_z_2Xw1GHR0SKIiDWeL",
      "object": "payout",
      "account": "acct_z_2Xw1GHR0SKIiDWeL",
      "amount": 50000,
      "status": "pending"
    }
  ],
  "total_amount": 160000,
  "recipients_count": 2
}`;

export const PAYOUTS_BUILD_PAGE: DocPage = {
  id: 'build',
  title: 'Build a payout batch',
  description:
    'Build an unsigned batch payout transaction for multiple pending payouts. This enables self-custodial payouts where your platform signs transactions locally using your Solana wallet.',
  endpoints: [{ method: 'POST', path: '/v1/payouts/build' }],
  sections: [
    {
      left: [
        {
          type: 'callout',
          variant: 'info',
          title: 'Self-custodial signing: ',
          text: 'This endpoint returns an unsigned Solana transaction. Sign it locally with your platform\'s secret key, then use the <a href="#payouts-broadcast">broadcast endpoint</a> to submit it to the blockchain.',
          html: true,
        },
        {
          type: 'callout',
          variant: 'info',
          title: 'Tip: ',
          text: 'For most use cases, the SDK helper functions <code>payouts.processAll()</code> or <code>payouts.processBatch()</code> are simpler—they handle building, signing, and broadcasting in one call.',
          html: true,
        },
        { type: 'heading', level: 2, text: 'Parameters' },
        {
          type: 'attributes',
          attributes: BUILD_PAYOUTS_BATCH_PARAMETERS,
        },
        { type: 'heading', level: 2, text: 'Returns' },
        {
          type: 'paragraph',
          text: 'Returns a <code>payout_batch_build</code> object containing the unsigned transaction (base64-encoded), the blockhash, estimated fees, and the payout objects included in the batch. In live mode, this call raises an error and leaves the payouts <code>pending</code> if the platform wallet lacks the USDC for the batch or the SOL for network fees, or if a destination is the platform wallet itself.',
          html: true,
        },
      ],
      right: [
        {
          type: 'code',
          endpoint: { method: 'POST', path: '/v1/payouts/build' },
          tabs: [
            {
              id: 'curl',
              label: 'cURL',
              code: `curl https://api.yourdomain.com/v1/payouts/build \\
  -H "x-api-key: sk_live_z_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "payouts": [
      "po_z_1Nv0FGQ9RKHgCVdK",
      "po_z_2Xw1GHR0SKIiDWeL"
    ]
  }'`,
            },
            {
              id: 'node',
              label: 'Node.js',
              code: `${NODE_INIT}

// Build an unsigned transaction for multiple payouts
const buildResult = await zoneless.payouts.build({
  payouts: [
    'po_z_1Nv0FGQ9RKHgCVdK',
    'po_z_2Xw1GHR0SKIiDWeL'
  ]
});

console.log(buildResult.unsigned_transaction);
console.log(buildResult.total_amount); // 160000 cents`,
            },
          ],
        },
        {
          type: 'object',
          title: 'RESPONSE',
          code: BUILD_PAYOUTS_BATCH_RESPONSE_JSON,
        },
      ],
    },
  ],
};

// ============================================
// Broadcast Payouts Batch Parameters
// ============================================
const BROADCAST_PAYOUTS_BATCH_PARAMETERS: Attribute[] = [
  {
    name: 'signed_transaction',
    type: 'string',
    required: true,
    description:
      "The signed Solana transaction as a base64-encoded string. Sign the unsigned transaction from the build endpoint using your platform's Solana wallet.",
  },
  {
    name: 'payouts',
    type: 'array',
    required: true,
    description:
      'Array of payout IDs included in the transaction. Must match the payouts used in the build request.',
    enumNote:
      'This is used to verify the transaction contents and update payout statuses after broadcasting.',
  },
  {
    name: 'blockhash',
    type: 'string',
    required: true,
    description:
      'The blockhash used when building the transaction. Pass the <code>blockhash</code> value returned by the <a href="#payouts-build">build endpoint</a>.',
  },
  {
    name: 'last_valid_block_height',
    type: 'integer',
    required: true,
    description:
      'The last valid block height for the transaction. Pass the <code>last_valid_block_height</code> value returned by the <a href="#payouts-build">build endpoint</a>.',
  },
];

const BROADCAST_PAYOUTS_BATCH_RESPONSE_JSON = `{
  "object": "payout_batch_broadcast",
  "signature": "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
  "status": "paid",
  "viewer_url": "https://solscan.io/tx/5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
  "payouts": [
    {
      "id": "po_z_1Nv0FGQ9RKHgCVdK",
      "object": "payout",
      "account": "acct_z_1Nv0FGQ9RKHgCVdK",
      "amount": 110000,
      "status": "paid",
      "metadata": {
        "network": "solana-mainnet",
        "blockchain_tx": "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
        "viewer_url": "https://solscan.io/tx/5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"
      }
    },
    {
      "id": "po_z_2Xw1GHR0SKIiDWeL",
      "object": "payout",
      "account": "acct_z_2Xw1GHR0SKIiDWeL",
      "amount": 50000,
      "status": "paid",
      "metadata": {
        "network": "solana-mainnet",
        "blockchain_tx": "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
        "viewer_url": "https://solscan.io/tx/5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"
      }
    }
  ]
}`;

export const PAYOUTS_BROADCAST_PAGE: DocPage = {
  id: 'broadcast',
  title: 'Broadcast a payout batch',
  description:
    'Broadcast a signed batch payout transaction to the Solana network. This endpoint submits your signed transaction and updates all included payouts to paid or failed status.',
  endpoints: [{ method: 'POST', path: '/v1/payouts/broadcast' }],
  sections: [
    {
      left: [
        {
          type: 'callout',
          variant: 'warning',
          title: 'Important: ',
          text: 'The transaction must be signed before calling this endpoint. Use your Solana wallet to sign the <code>unsigned_transaction</code> returned by the <a href="#payouts-build">build endpoint</a>.',
          html: true,
        },
        { type: 'heading', level: 2, text: 'Parameters' },
        {
          type: 'attributes',
          attributes: BROADCAST_PAYOUTS_BATCH_PARAMETERS,
        },
        { type: 'heading', level: 2, text: 'Returns' },
        {
          type: 'paragraph',
          text: 'Returns a <code>payout_batch_broadcast</code> object containing the transaction signature, status, viewer URL, and the updated payout objects. All payouts will have their status set to <code>paid</code> on success or <code>failed</code> if the transaction failed.',
          html: true,
        },
        { type: 'heading', level: 2, text: 'Webhooks' },
        {
          type: 'paragraph',
          text: 'After broadcasting, Zoneless sends <code>payout.paid</code> or <code>payout.failed</code> webhook events for each payout in the batch.',
          html: true,
        },
      ],
      right: [
        {
          type: 'code',
          endpoint: { method: 'POST', path: '/v1/payouts/broadcast' },
          tabs: [
            {
              id: 'curl',
              label: 'cURL',
              code: `curl https://api.yourdomain.com/v1/payouts/broadcast \\
  -H "x-api-key: sk_live_z_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "signed_transaction": "AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAQAHDw...",
    "payouts": [
      "po_z_1Nv0FGQ9RKHgCVdK",
      "po_z_2Xw1GHR0SKIiDWeL"
    ],
    "blockhash": "GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi",
    "last_valid_block_height": 158436852
  }'`,
            },
            {
              id: 'node',
              label: 'Node.js',
              code: `${NODE_INIT}

// After signing the transaction from build()
const result = await zoneless.payouts.broadcast({
  signed_transaction: signedTxBase64,
  payouts: [
    'po_z_1Nv0FGQ9RKHgCVdK',
    'po_z_2Xw1GHR0SKIiDWeL'
  ],
  blockhash: buildResult.blockhash,
  last_valid_block_height: buildResult.last_valid_block_height,
});

console.log(result.signature); // Solana tx signature
console.log(result.viewer_url); // Link to Solscan`,
            },
          ],
        },
        {
          type: 'object',
          title: 'RESPONSE',
          code: BROADCAST_PAYOUTS_BATCH_RESPONSE_JSON,
        },
      ],
    },
    {
      left: [
        { type: 'heading', level: 2, text: 'Using SDK helper functions' },
        {
          type: 'paragraph',
          text: 'For most use cases, the SDK provides helper functions that handle the entire build-sign-broadcast flow in a single call. These are the recommended way to process payouts.',
          html: true,
        },
        { type: 'heading', level: 3, text: 'processBatch()' },
        {
          type: 'paragraph',
          text: 'Process up to 10 pending payouts in a single batch. Returns a <code>has_more</code> flag indicating if more payouts remain.',
          html: true,
        },
        { type: 'heading', level: 3, text: 'processAll()' },
        {
          type: 'paragraph',
          text: 'Process all pending payouts automatically, handling multiple batches until none remain. Returns an array of results, one per batch.',
          html: true,
        },
      ],
      right: [
        {
          type: 'code',
          title: 'SDK HELPER FUNCTIONS',
          tabs: [
            {
              id: 'processBatch',
              label: 'processBatch()',
              code: `${NODE_INIT}

// Process up to 10 pending payouts
const result = await zoneless.payouts.processBatch(
  process.env.SOLANA_SECRET_KEY
);

console.log(\`Processed \${result.payouts.length} payouts\`);
console.log(\`Transaction: \${result.signature}\`);

if (result.has_more) {
  console.log('More payouts pending...');
}`,
            },
            {
              id: 'processAll',
              label: 'processAll()',
              code: `${NODE_INIT}

// Process ALL pending payouts (multiple batches)
const results = await zoneless.payouts.processAll(
  process.env.SOLANA_SECRET_KEY
);

const totalProcessed = results.reduce(
  (sum, r) => sum + r.payouts.length, 0
);

console.log(
  \`Processed \${totalProcessed} payouts in \${results.length} batches\`
);`,
            },
          ],
        },
      ],
    },
  ],
};

export const PAYOUTS_PAGES: DocPage[] = [
  PAYOUTS_OVERVIEW_PAGE,
  PAYOUTS_CREATE_PAGE,
  PAYOUTS_UPDATE_PAGE,
  PAYOUTS_RETRIEVE_PAGE,
  PAYOUTS_LIST_PAGE,
  PAYOUTS_CANCEL_PAGE,
  PAYOUTS_BUILD_PAGE,
  PAYOUTS_BROADCAST_PAGE,
];
