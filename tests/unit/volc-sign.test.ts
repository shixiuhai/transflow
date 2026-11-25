import { describe, expect, it } from 'vitest';
import { canonicalQuery, formatXDate, sha256Hex, signVolcRequest, uriEncode } from '../../src/core/provider/sign/volc';

const credentials = { accessKey: 'AKLTtest', secretKey: 'secret-test-key' };
const body = JSON.stringify({ TargetLanguage: 'zh', TextList: ['Hello world'] });
const fixedDate = new Date('2026-11-25T06:00:00.000Z');

describe('volc signing', () => {
  it('formats x-date exactly', () => {
    expect(formatXDate(fixedDate)).toBe('20261125T060000Z');
  });

  it('encodes per RFC 3986', () => {
    expect(uriEncode("a b!'()*~")).toBe('a%20b%21%27%28%29%2A~');
  });

  it('sorts and encodes query parameters', () => {
    expect(canonicalQuery({ Version: '2020-06-01', Action: 'TranslateText' })).toBe(
      'Action=TranslateText&Version=2020-06-01',
    );
  });

  it('produces a deterministic V4 authorization header', async () => {
    const signed = await signVolcRequest({
      host: 'translate.volcengineapi.com',
      query: { Action: 'TranslateText', Version: '2020-06-01' },
      body,
      credentials,
      region: 'cn-north-1',
      service: 'translate',
      date: fixedDate,
    });

    expect(signed.xDate).toBe('20261125T060000Z');
    expect(signed.payloadHash).toBe(await sha256Hex(body));
    // Vector generated with the official @volcengine/openapi 1.36.2 signer.
    expect(signed.authorization).toBe(
      'HMAC-SHA256 Credential=AKLTtest/20261125/cn-north-1/translate/request, ' +
        'SignedHeaders=x-content-sha256;x-date, ' +
        'Signature=de0fdac43ebaba8971c75586231982c30ec5012ccfa6caf05a13fdf9c790c4fa',
    );
    expect(signed.canonicalRequest.split('\n')[0]).toBe('POST');
    expect(signed.canonicalRequest.split('\n')[2]).toBe('Action=TranslateText&Version=2020-06-01');
  });

  it('changes signature when the body changes', async () => {
    const opts = {
      host: 'translate.volcengineapi.com',
      query: { Action: 'TranslateText', Version: '2020-06-01' },
      credentials,
      region: 'cn-north-1',
      service: 'translate',
      date: fixedDate,
    };
    const a = await signVolcRequest({ ...opts, body });
    const b = await signVolcRequest({ ...opts, body: body + ' ' });
    expect(a.authorization).not.toBe(b.authorization);
  });
});
