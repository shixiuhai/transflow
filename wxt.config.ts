import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    options_ui: { open_in_tab: true },
    name: '译流 TransFlow',
    description: '快速、开源的双语网页翻译扩展：整页双语、划词、输入框翻译。',
    permissions: ['storage', 'activeTab', 'scripting', 'contextMenus'],
    host_permissions: ['<all_urls>'],
    commands: {
      'translate-selection': {
        suggested_key: { default: 'Alt+S' },
        description: '翻译选中文本',
      },
      'translate-page': {
        suggested_key: { default: 'Alt+A' },
        description: '翻译整页 / 还原',
      },
      'translate-input': {
        suggested_key: { default: 'Alt+D' },
        description: '翻译输入框',
      },
    },
  },
});
