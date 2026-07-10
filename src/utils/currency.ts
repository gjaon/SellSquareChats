/**
 * currency.ts (chatalog) — mirror of the backend `utils/currency.js`. Buyers
 * see each store in ITS OWN country's currency (no FX conversion). Keep the
 * symbol/country maps in sync with the backend, the web
 * (`SellSquare/client/src/utils/currency.js`) and the merchant RN app
 * (`sellsquare.app/src/utils/currency.ts`).
 */

export const CURRENCY_SYMBOLS: Record<string, string> = {
  NGN: '₦', USD: '$', EUR: '€', GBP: '£', GHS: '₵', KES: 'KSh', ZAR: 'R',
  TZS: 'TSh', UGX: 'USh', RWF: 'FRw', XOF: 'CFA', XAF: 'FCFA', EGP: 'E£',
  MAD: 'DH', ETB: 'Br', ZMW: 'ZK', CAD: 'CA$', AUD: 'A$', INR: '₹', JPY: '¥',
  CNY: '¥', AED: 'د.إ', SAR: '﷼', BRL: 'R$', MXN: 'MX$', CHF: 'CHF', SEK: 'kr',
  NOK: 'kr', DKK: 'kr', PLN: 'zł', TRY: '₺', RUB: '₽', SGD: 'S$', HKD: 'HK$',
  NZD: 'NZ$', PHP: '₱', IDR: 'Rp', MYR: 'RM', THB: '฿', VND: '₫', PKR: '₨',
  BDT: '৳', LKR: 'Rs', KRW: '₩',
};

const COUNTRY_CODE_TO_CURRENCY: Record<string, string> = {
  NG: 'NGN', GH: 'GHS', KE: 'KES', ZA: 'ZAR', TZ: 'TZS', UG: 'UGX', RW: 'RWF',
  EG: 'EGP', MA: 'MAD', ET: 'ETB', ZM: 'ZMW', CM: 'XAF', CI: 'XOF', SN: 'XOF',
  US: 'USD', GB: 'GBP', CA: 'CAD', AU: 'AUD', NZ: 'NZD', IN: 'INR', JP: 'JPY',
  CN: 'CNY', AE: 'AED', SA: 'SAR', BR: 'BRL', MX: 'MXN', CH: 'CHF', SE: 'SEK',
  NO: 'NOK', DK: 'DKK', PL: 'PLN', TR: 'TRY', RU: 'RUB', SG: 'SGD', HK: 'HKD',
  PH: 'PHP', ID: 'IDR', MY: 'MYR', TH: 'THB', VN: 'VND', PK: 'PKR', BD: 'BDT',
  LK: 'LKR', KR: 'KRW',
  DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR', PT: 'EUR', NL: 'EUR', BE: 'EUR',
  IE: 'EUR', AT: 'EUR', FI: 'EUR', GR: 'EUR',
};

const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  nigeria: 'NG', ghana: 'GH', kenya: 'KE', 'south africa': 'ZA', tanzania: 'TZ',
  uganda: 'UG', rwanda: 'RW', egypt: 'EG', morocco: 'MA', ethiopia: 'ET',
  zambia: 'ZM', cameroon: 'CM', "côte d'ivoire": 'CI', 'ivory coast': 'CI',
  senegal: 'SN', 'united states': 'US', 'united states of america': 'US',
  usa: 'US', 'united kingdom': 'GB', uk: 'GB', canada: 'CA', australia: 'AU',
  india: 'IN', germany: 'DE', france: 'FR',
};

export const DEFAULT_CURRENCY = 'NGN';

export function getCurrencyForCountry(countryCodeOrName?: string | null): string {
  if (!countryCodeOrName) return DEFAULT_CURRENCY;
  const raw = String(countryCodeOrName).trim();
  if (raw.length === 2 && COUNTRY_CODE_TO_CURRENCY[raw.toUpperCase()]) {
    return COUNTRY_CODE_TO_CURRENCY[raw.toUpperCase()];
  }
  const code = COUNTRY_NAME_TO_CODE[raw.toLowerCase()];
  if (code && COUNTRY_CODE_TO_CURRENCY[code]) return COUNTRY_CODE_TO_CURRENCY[code];
  return DEFAULT_CURRENCY;
}

export function getCurrencySymbol(currencyCode?: string | null): string {
  if (!currencyCode) return CURRENCY_SYMBOLS[DEFAULT_CURRENCY];
  const code = String(currencyCode).toUpperCase();
  return CURRENCY_SYMBOLS[code] || code;
}

type CurrencySource =
  | string
  | { currency?: string | null; countryCode?: string | null; country?: string | null }
  | null
  | undefined;

export function resolveCurrency(source: CurrencySource): string {
  if (!source) return DEFAULT_CURRENCY;
  if (typeof source === 'string') return source.toUpperCase();
  return source.currency || getCurrencyForCountry(source.countryCode || source.country);
}

/**
 * Format an amount in a store's currency, e.g. formatMoney(1500, 'NGN') →
 * "₦1,500". `currency` may be an ISO code or a store/business-like object.
 */
export function formatMoney(amount?: number | string, currency: CurrencySource = DEFAULT_CURRENCY): string {
  const code = typeof currency === 'string' ? currency : resolveCurrency(currency);
  const symbol = getCurrencySymbol(code);
  const n = Number(amount || 0);
  return `${symbol}${n.toLocaleString()}`;
}
