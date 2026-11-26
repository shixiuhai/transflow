import { signVolcRequest } from '../provider/sign/volc';
import type { ProviderConfig } from '../provider/types';

export interface BillingLine {
  product: string;
  productZh: string;
  amount: number;
  currency: string;
}

export interface BillingResult {
  month: string;
  currency: string;
  total: number;
  translationTotal: number;
  hasTranslationLine: boolean;
  lines: BillingLine[];
  fetchedAt: number;
}

export class BillingError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'BillingError';
  }
}

interface VolcBill {
  Product?: string;
  ProductZh?: string;
  PayableAmount?: string;
  Currency?: string;
}

interface VolcBillingResponse {
  Result?: { List?: VolcBill[] };
  ResponseMetadata?: { Error?: { Code?: string; Message?: string } | null };
}

export function parseVolcBilling(json: VolcBillingResponse, month: string): BillingResult {
  const list = json.Result?.List ?? [];
  const lines: BillingLine[] = list.map((row) => ({
    product: row.Product ?? '',
    productZh: row.ProductZh ?? '',
    amount: Number(row.PayableAmount ?? 0) || 0,
    currency: row.Currency ?? 'CNY',
  }));
  const translation = lines.filter((line) => /翻译|translate|machine translation/i.test(`${line.product} ${line.productZh}`));
  return {
    month,
    currency: lines[0]?.currency ?? 'CNY',
    total: lines.reduce((sum, line) => sum + line.amount, 0),
    translationTotal: translation.reduce((sum, line) => sum + line.amount, 0),
    hasTranslationLine: translation.length > 0,
    lines,
    fetchedAt: Date.now(),
  };
}

export async function fetchVolcBilling(config: ProviderConfig): Promise<BillingResult> {
  const accessKey = config.accessKey?.trim() ?? '';
  const secretKey = config.secretKey?.trim() ?? '';
  if (!accessKey || !secretKey) {
    throw new BillingError('missing_credentials', '请先配置火山引擎 Access Key / Secret Key');
  }

  const month = new Date().toISOString().slice(0, 7);
  const query = { Action: 'ListBillOverviewByProd', Version: '2022-01-01' };
  const body = JSON.stringify({
    BillPeriod: month,
    Limit: 300,
    Offset: 0,
    NeedRecordNum: 1,
    IgnoreZero: 0,
  });
  const signed = await signVolcRequest({
    method: 'POST',
    host: 'billing.volcengineapi.com',
    path: '/',
    query,
    body,
    credentials: { accessKey, secretKey },
    region: 'cn-north-1',
    service: 'billing',
  });

  let response: Response;
  try {
    response = await fetch(
      'https://billing.volcengineapi.com/?' + new URLSearchParams(query).toString(),
      { method: 'POST', headers: signed.headers, body, signal: AbortSignal.timeout(15000) },
    );
  } catch (error) {
    throw new BillingError('network', `账单接口请求失败：${(error as Error).message}`);
  }

  const json = (await response.json().catch(() => null)) as VolcBillingResponse | null;
  const error = json?.ResponseMetadata?.Error;
  if (!response.ok || error) {
    const code = error?.Code ?? String(response.status);
    if (/access|auth|permission|forbidden|denied/i.test(`${code} ${error?.Message ?? ''}`)) {
      throw new BillingError(
        'permission',
        '当前 AK 没有费用中心只读权限。请在火山 IAM 给子用户添加 BillingCenterReadOnlyAccess（费用中心全部只读）后重试。',
      );
    }
    throw new BillingError(code, error?.Message ?? `账单接口失败（${response.status}）`);
  }
  if (!json) throw new BillingError('bad_response', '账单接口没有返回 JSON');
  return parseVolcBilling(json, month);
}
