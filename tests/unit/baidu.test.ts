import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBaiduProvider } from '../../src/core/provider/adapters/baidu';
import { md5 } from '../../src/core/provider/sign/md5';

afterEach(() => vi.unstubAllGlobals());

describe('baidu adapter', () => {
  it('signs requests with MD5(appid + q + salt + secret)', async () => {
    let captured: URLSearchParams | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        captured = init.body as URLSearchParams;
        return new Response(JSON.stringify({ trans_result: [{ dst: '你好' }] }), { status: 200 });
      }),
    );

    const provider = createBaiduProvider({ appId: 'appid', apiKey: 'secret' });
    const results = await provider.translate({ segments: [{ id: '1', text: 'hello' }], from: 'en', to: 'zh' });
    expect(results[0]?.text).toBe('你好');

    const body = captured as unknown as URLSearchParams;
    const salt = body.get('salt') ?? '';
    expect(body.get('sign')).toBe(md5(`appidhello${salt}secret`));
    expect(body.get('from')).toBe('en');
    expect(body.get('to')).toBe('zh');
  });

  it('maps provider error codes to readable messages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error_code: '54001', error_msg: 'Invalid Sign' }), { status: 200 })),
    );
    const provider = createBaiduProvider({ appId: 'a', apiKey: 'b' });
    await expect(provider.translate({ segments: [{ id: '1', text: 'x' }], from: 'en', to: 'zh' })).rejects.toThrow(/签名错误/);
  });
});
