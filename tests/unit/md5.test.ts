import { describe, expect, it } from 'vitest';
import { md5 } from '../../src/core/provider/sign/md5';

describe('md5', () => {
  it('matches RFC 1321 vectors', () => {
    expect(md5('')).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(md5('abc')).toBe('900150983cd24fb0d6963f7d28e17f72');
    expect(md5('message digest')).toBe('f96b697d7cb7938d525a2f31aaf161d0');
    expect(md5('abcdefghijklmnopqrstuvwxyz')).toBe('c3fcd3d76192e4007dfb496cca67e13b');
  });

  it('hashes UTF-8 input', () => {
    expect(md5('你好')).toBe('7eca689f0d3389d9dea66ae112e5cfd7');
  });
});
