import { signVolcRequest } from '../src/core/provider/sign/volc';

const AK = process.env.VOLC_AK ?? '';
const SK = process.env.VOLC_SK ?? '';
const query: Record<string, string> = {
  Action: 'ListBillOverviewByProd',
  Version: '2022-01-01',
};
const body = JSON.stringify({
  BillPeriod: new Date().toISOString().slice(0, 7),
  Limit: 10,
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
  credentials: { accessKey: AK, secretKey: SK },
  region: 'cn-north-1',
  service: 'billing',
});
const url = 'https://billing.volcengineapi.com/?' + new URLSearchParams(query).toString();
const res = await fetch(url, { method: 'POST', headers: signed.headers, body });
const text = await res.text();
console.log('status', res.status);
console.log(text.slice(0, 3000));
