import { Charge } from '@zoneless/shared-types';
import { GetAppConfig } from './AppConfig';
import { SolanaExplorerUrl } from './chains/Solana';

type ReceiptRow = {
  label: string;
  value: string;
  href?: string;
};

type ReceiptStatusView = {
  label: string;
  className: string;
  message: string;
};

/**
 * Receipt numbers are derived from the already-stable Charge ID so idempotent
 * charge creation paths do not need a second generated identifier.
 */
export function BuildChargeReceiptNumber(chargeId: string): string {
  return `rcpt_${chargeId}`;
}

export function BuildChargeReceiptUrl(chargeId: string): string {
  return `${GetAppConfig().dashboardUrl}/v1/receipts/${encodeURIComponent(
    chargeId
  )}`;
}

export function RenderReceiptNotFoundHtml(): string {
  return PageHtml(
    'Receipt not found',
    `
      <main class="receipt-shell">
        <section class="receipt-card receipt-card--empty">
          <div class="brand-row">
            <img class="brand-mark" src="/assets/images/logos/logo-blue-200h.png" alt="" />
            <span>Zoneless</span>
          </div>
          <h1>Receipt not found</h1>
          <p class="muted">We could not find a receipt for this charge.</p>
        </section>
      </main>
    `
  );
}

export function RenderChargeReceiptHtml(charge: Charge): string {
  const status = ReceiptStatus(charge);
  const receiptRows: ReceiptRow[] = [
    { label: 'Status', value: status.label },
    { label: 'Charge ID', value: charge.id },
    {
      label: 'Receipt number',
      value: charge.receipt_number ?? BuildChargeReceiptNumber(charge.id),
    },
    { label: 'Created', value: FormatDate(charge.created) },
  ];

  if (charge.description) {
    receiptRows.unshift({ label: 'Description', value: charge.description });
  }

  const transactionRows = TransactionRows(charge);

  return PageHtml(
    `Receipt ${charge.receipt_number ?? charge.id}`,
    `
      <main class="receipt-shell">
        <section class="receipt-card">
          <header class="receipt-header">
            <div class="brand-row">
              <img class="brand-mark" src="/assets/images/logos/logo-blue-200h.png" alt="" />
              <span>Zoneless</span>
            </div>
            <span class="${EscapeAttribute(status.className)}">${EscapeHtml(
      status.label
    )}</span>
          </header>

          <section class="hero">
            <p class="eyebrow">Payment receipt</p>
            <div class="amount-line" aria-label="${EscapeAttribute(
              FormatAmount(charge.amount, charge.currency)
            )}">
              <span class="amount">${EscapeHtml(
                FormatAmountValue(charge.amount)
              )}</span>
              <span class="currency">${EscapeHtml(
                charge.currency.toUpperCase()
              )}</span>
            </div>
            <p class="muted">${EscapeHtml(status.message)}</p>
          </section>

          ${RenderSection('Receipt details', receiptRows)}
          ${
            transactionRows.length > 0
              ? RenderSection('Blockchain details', transactionRows)
              : ''
          }

          <footer>
            <span>Powered by <a href="https://zoneless.com" rel="noopener noreferrer">Zoneless</a></span>
            <span>${EscapeHtml(
              charge.livemode ? 'Live mode' : 'Test mode'
            )}</span>
          </footer>
        </section>
      </main>
    `
  );
}

function ReceiptStatus(charge: Charge): ReceiptStatusView {
  if (charge.refunded || charge.amount_refunded >= charge.amount) {
    return {
      label: 'Refunded',
      className: 'status-pill status-pill--refunded',
      message: 'This payment has been refunded.',
    };
  }

  if (charge.amount_refunded > 0) {
    return {
      label: 'Partially refunded',
      className: 'status-pill status-pill--refunded',
      message: 'Part of this payment has been refunded.',
    };
  }

  if (charge.status === 'failed') {
    return {
      label: 'Failed',
      className: 'status-pill status-pill--failed',
      message: 'This payment could not be completed.',
    };
  }

  if (charge.status === 'pending') {
    return {
      label: 'Pending',
      className: 'status-pill status-pill--pending',
      message: 'This payment is still processing.',
    };
  }

  return {
    label: 'Paid',
    className: 'status-pill status-pill--paid',
    message: 'Thanks, your payment was completed successfully.',
  };
}

function TransactionRows(charge: Charge): ReceiptRow[] {
  const crypto = charge.payment_method_details?.crypto;
  const metadata = charge.metadata ?? {};
  const transactionHash =
    crypto?.transaction_hash ?? metadata.blockchain_tx ?? null;
  const explorerUrl =
    metadata.explorer_url ??
    metadata.viewer_url ??
    (transactionHash && crypto?.network === 'solana'
      ? SolanaExplorerUrl('tx', transactionHash)
      : null);

  const rows: ReceiptRow[] = [];

  if (crypto?.network) {
    rows.push({ label: 'Network', value: crypto.network });
  }
  if (crypto?.token_currency) {
    rows.push({ label: 'Token', value: crypto.token_currency.toUpperCase() });
  }
  if (crypto?.buyer_address) {
    rows.push({ label: 'Buyer wallet', value: crypto.buyer_address });
  }
  if (transactionHash) {
    rows.push({ label: 'Transaction', value: transactionHash });
  }
  if (explorerUrl) {
    rows.push({
      label: 'Explorer',
      value: explorerUrl,
      href: explorerUrl,
    });
  }

  return rows;
}

function RenderRow(row: ReceiptRow): string {
  const value = row.href
    ? `<a href="${EscapeAttribute(
        row.href
      )}" rel="noopener noreferrer">${EscapeHtml(row.value)}</a>`
    : EscapeHtml(row.value);

  return `
    <div class="row">
      <dt>${EscapeHtml(row.label)}</dt>
      <dd>${value}</dd>
    </div>
  `;
}

function RenderSection(title: string, rows: ReceiptRow[]): string {
  return `
    <section class="details-section">
      <h2>${EscapeHtml(title)}</h2>
      <dl>
        ${rows.map(RenderRow).join('')}
      </dl>
    </section>
  `;
}

function PageHtml(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${EscapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: light;
        font-family: "Instrument Sans", Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #1e293b;
        background: #f8fafc;
      }
      body {
        margin: 0;
        min-height: 100vh;
        background:
          radial-gradient(circle at top left, rgba(0, 85, 255, 0.1), transparent 34rem),
          linear-gradient(180deg, #ffffff 0%, #f8fafc 52%, #f1f5f9 100%);
      }
      .receipt-shell {
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 48px 16px;
      }
      .receipt-card {
        width: min(100%, 560px);
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 24px;
        box-shadow: 0 24px 80px rgba(15, 23, 42, 0.12);
        overflow: hidden;
      }
      .receipt-card--empty {
        padding: 32px;
      }
      .receipt-header,
      .hero,
      .details-section,
      footer {
        padding-left: 32px;
        padding-right: 32px;
      }
      .receipt-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding-top: 28px;
        padding-bottom: 24px;
      }
      .brand-row {
        display: flex;
        align-items: center;
        gap: 10px;
        color: #1e293b;
        font-size: 14px;
        font-weight: 600;
      }
      .brand-mark {
        width: 30px;
        height: 30px;
        object-fit: contain;
      }
      .status-pill {
        border-radius: 999px;
        font-size: 12px;
        font-weight: 600;
        padding: 6px 10px;
      }
      .status-pill--paid {
        background: #ecfdf5;
        color: #059669;
      }
      .status-pill--pending {
        background: #fffbeb;
        color: #b45309;
      }
      .status-pill--refunded {
        background: #eff6ff;
        color: #1d4ed8;
      }
      .status-pill--failed {
        background: #fef2f2;
        color: #dc2626;
      }
      .hero {
        padding-top: 8px;
        padding-bottom: 32px;
        border-top: 1px solid #f1f5f9;
        border-bottom: 1px solid #f1f5f9;
      }
      .eyebrow {
        margin: 0 0 8px;
        color: #64748b;
        font-size: 13px;
        font-weight: 500;
      }
      h1 {
        margin: 20px 0 12px;
        font-size: 28px;
        line-height: 1.1;
        letter-spacing: -0.03em;
      }
      h2 {
        margin: 0 0 4px;
        color: #1e293b;
        font-size: 15px;
        letter-spacing: -0.01em;
      }
      .amount-line {
        display: flex;
        align-items: baseline;
        gap: 10px;
      }
      .amount {
        font-size: clamp(42px, 10vw, 56px);
        font-weight: 600;
        letter-spacing: -0.06em;
        line-height: 1;
      }
      .currency {
        color: #64748b;
        font-size: 18px;
        font-weight: 600;
      }
      dl {
        margin: 0;
      }
      .details-section {
        padding-top: 24px;
        padding-bottom: 8px;
      }
      .details-section + .details-section {
        border-top: 1px solid #f1f5f9;
      }
      .row {
        display: grid;
        grid-template-columns: minmax(120px, 180px) 1fr;
        gap: 16px;
        padding: 13px 0;
      }
      dt {
        color: #64748b;
        font-size: 14px;
        font-weight: 400;
      }
      dd {
        margin: 0;
        color: #1e293b;
        font-size: 14px;
        font-weight: 500;
        text-align: right;
        overflow-wrap: anywhere;
      }
      a {
        color: #0055ff;
        text-decoration: none;
      }
      .muted {
        color: #64748b;
        font-size: 14px;
        line-height: 1.5;
        margin: 12px 0 0;
      }
      footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        margin-top: 16px;
        padding-top: 20px;
        padding-bottom: 24px;
        border-top: 1px solid #f1f5f9;
        color: #94a3b8;
        font-size: 12px;
      }
      @media (max-width: 520px) {
        .receipt-shell {
          padding: 24px 12px;
        }
        .receipt-header,
        .hero,
        .details-section,
        footer {
          padding-left: 24px;
          padding-right: 24px;
        }
        .row {
          grid-template-columns: 1fr;
          gap: 4px;
        }
        dd {
          text-align: left;
        }
        footer {
          align-items: flex-start;
          flex-direction: column;
          gap: 4px;
        }
      }
    </style>
  </head>
  <body>
    ${body}
  </body>
</html>`;
}

function FormatAmount(amount: number, currency: string): string {
  return `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`;
}

function FormatAmountValue(amount: number): string {
  return (amount / 100).toFixed(2);
}

function FormatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString();
}

function EscapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return char;
    }
  });
}

function EscapeAttribute(value: string): string {
  return EscapeHtml(value);
}
