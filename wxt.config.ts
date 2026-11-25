import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvNP3K5kje3ej2jKrjJ3ZKMfjG9oy53M1N9qrvh5exIdXo51d78095pIdURqFcMexQHKX3s79QS7LuxsJ7id13pNchTFF+aZU6hTs7+8N48OsNLbrmkKfWjNvX28U+dtEqKQOvR4dqvm6AGb0Y6gvptBj4BYBlYuZfUZc0r63nkI6Y11HjNqRA19YVYdyd7W0dL6rftaUDyjOM1Yw54re7Ujgoz7ILB6q5CFd0CMiExP7oiB6/VC2ho4NlLzvgGZZ5YtbULR892Rt75AXxk1kdLX2AOeo/0JfyLS8VDuqGmdk1Ifx0tD+ubgMcV1IHuXERHhuwAfb4Im27CGMjybFOQIDAQAB',
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
