import type { ProviderId } from '../types';

export interface ProviderMetaLike {
  label: string;
  homepage: string;
  freeNote: string;
  /** Where to get a key, shown in settings. */
  keyUrl?: string;
}

export const PROVIDER_META: Record<string, ProviderMetaLike> = {
  mock: {
    label: '本地模拟',
    homepage: '',
    freeNote: '无需密钥，仅用于开发与离线演示',
  },
  volc: {
    label: '火山引擎',
    homepage: 'https://www.volcengine.com/product/machine-translation',
    freeNote: '每月前 200 万字符免费，超出 49 元/百万字符',
    keyUrl: 'https://console.volcengine.com/iam/user',
  },
  baidu: {
    label: '百度翻译',
    homepage: 'https://fanyi-api.baidu.com/',
    freeNote: '高级版每月 100 万字符免费，超出 49 元/百万字符',
    keyUrl: 'https://fanyi-api.baidu.com/access/0/1',
  },
  openai: {
    label: 'OpenAI 兼容',
    homepage: 'https://platform.openai.com/docs/api-reference',
    freeNote: '按 token 计费，支持 DeepSeek / GLM / Qwen 等兼容接口',
  },
  libre: {
    label: 'LibreTranslate',
    homepage: 'https://libretranslate.com/',
    freeNote: '自建或使用公共实例；兼容旧配置',
  },
};

export function metaFor(id: ProviderId): ProviderMetaLike {
  return PROVIDER_META[id] ?? { label: id, homepage: '', freeNote: '' };
}
