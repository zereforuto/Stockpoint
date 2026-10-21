/**
 * Self-contained thermal-receipt HTML (80 mm by default). The same builder is
 * used for the on-screen preview (rendered inside an <iframe srcdoc>), for
 * printing and for PDF export, so what the shop owner sees is exactly what
 * comes out of the printer.
 */

import { formatCents, formatMoney } from './money'
import { paymentMethodLabel } from './format'
import { escapeHtml } from './html'
import { formatDisplayDateTime } from './times'
import type { SaleDetail, Settings } from './types'

export type ReceiptShopInfo = Pick<
  Settings,
  'shopName' | 'address' | 'currencySymbol' | 'taxRatePercent' | 'taxMode' | 'receiptFooter'
>

export interface ReceiptOptions {
  /** Print width in CSS pixels. 80 mm thermal paper ~= 302 px at 96 dpi. */
  widthPx?: number
}

const DEFAULT_WIDTH_PX = 302

export function buildReceiptHtml(
  shop: ReceiptShopInfo,
  sale: SaleDetail,
  options: ReceiptOptions = {}
): string {
  const width = options.widthPx ?? DEFAULT_WIDTH_PX
  const currency = shop.currencySymbol
  const voided = sale.status === 'voided'

  const itemRows = sale.items
    .map((item) => {
      return `
      <div class="item">
        <div class="item-name">${escapeHtml(item.productName)}</div>
        <div class="item-line">
          <span>${item.quantity} x ${escapeHtml(formatMoney(item.unitPriceCent, ''))}</span>
          <span>${escapeHtml(formatMoney(item.lineTotalCent, ''))}</span>
        </div>
      </div>`
    })
    .join('')

  const discountRow =
    sale.discountCent > 0
      ? `<div class="row"><span>Discount</span><span>-${escapeHtml(
          formatMoney(sale.discountCent, '')
        )}</span></div>`
      : ''

  const taxLabel =
    shop.taxMode === 'inclusive'
      ? `VAT Inclusive ${shop.taxRatePercent}%`
      : `VAT ${shop.taxRatePercent}%`

  const voidStamp = voided
    ? `<div class="void-stamp">VOIDED</div>
       <div class="row"><span>Reason</span><span>${escapeHtml(sale.voidReason ?? '')}</span></div>
       <div class="row"><span>Voided by</span><span>${escapeHtml(sale.voidedByName ?? '')}</span></div>
       <div class="row"><span>Voided at</span><span>${escapeHtml(
         formatDisplayDateTime(sale.voidedAt ?? '')
       )}</span></div>`
    : ''

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;" />
<title>Receipt ${escapeHtml(sale.receiptNo)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 8px 6px;
    background: #fff;
    color: #000;
    font-family: "Courier New", Courier, monospace;
    font-size: 12px;
    line-height: 1.35;
  }
  .receipt { width: ${width}px; margin: 0 auto; }
  .center { text-align: center; }
  .shop { font-size: 16px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
  .address { font-size: 11px; }
  .title { margin-top: 6px; font-weight: 700; text-transform: uppercase; }
  .rule { border-top: 1px dashed #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; gap: 8px; }
  .row .val { white-space: nowrap; }
  .meta { font-size: 11px; }
  .item { margin: 4px 0; }
  .item-name { text-transform: uppercase; }
  .item-line { display: flex; justify-content: space-between; padding-left: 10px; font-size: 11px; }
  .total { font-size: 15px; font-weight: 700; }
  .footer { margin-top: 8px; text-align: center; font-size: 11px; white-space: pre-wrap; }
  .void-stamp {
    margin: 8px 0 4px;
    text-align: center;
    font-size: 26px;
    font-weight: 700;
    letter-spacing: 4px;
    border: 3px solid #000;
    padding: 2px 0;
    transform: rotate(-4deg);
  }
  @media print {
    body { padding: 0; }
    @page { margin: 0; }
  }
</style>
</head>
<body>
  <div class="receipt">
    <div class="center shop">${escapeHtml(shop.shopName || 'StockPoint Store')}</div>
    <div class="center address">${escapeHtml(shop.address)}</div>
    <div class="center title">${voided ? 'Voided receipt' : 'Sale receipt'}</div>
    <div class="rule"></div>
    <div class="meta">
      <div class="row"><span>Receipt</span><span class="val">${escapeHtml(sale.receiptNo)}</span></div>
      <div class="row"><span>Date</span><span class="val">${escapeHtml(
        formatDisplayDateTime(sale.createdAt)
      )}</span></div>
      <div class="row"><span>Cashier</span><span class="val">${escapeHtml(sale.cashierName)}</span></div>
    </div>
    <div class="rule"></div>
    ${itemRows || '<div class="center">(no items)</div>'}
    <div class="rule"></div>
    <div class="row"><span>Subtotal</span><span class="val">${escapeHtml(
      formatMoney(sale.subtotalCent, '')
    )}</span></div>
    ${discountRow}
    <div class="row"><span>${escapeHtml(taxLabel)}</span><span class="val">${escapeHtml(
      formatMoney(sale.taxCent, '')
    )}</span></div>
    <div class="row total"><span>TOTAL</span><span class="val">${escapeHtml(
      formatMoney(sale.totalCent, currency)
    )}</span></div>
    <div class="rule"></div>
    <div class="row"><span>Payment</span><span class="val">${escapeHtml(
      paymentMethodLabel(sale.paymentMethod).toUpperCase()
    )}</span></div>
    <div class="row"><span>Tendered</span><span class="val">${escapeHtml(
      formatMoney(sale.amountTenderedCent, currency)
    )}</span></div>
    <div class="row"><span>Change</span><span class="val">${escapeHtml(
      formatMoney(sale.changeCent, currency)
    )}</span></div>
    ${voidStamp ? '<div class="rule"></div>' : ''}
    ${voidStamp}
    <div class="rule"></div>
    <div class="footer">${escapeHtml(shop.receiptFooter)}</div>
    <div class="center" style="margin-top:4px;font-size:10px;">${escapeHtml(
      formatCents(sale.totalCent)
    )} ${escapeHtml(currency)} &middot; ${escapeHtml(sale.receiptNo)}</div>
  </div>
</body>
</html>`
}
