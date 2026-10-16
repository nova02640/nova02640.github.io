'use strict';

/**
 * 英文版页面（source/en/**，即 lang: en 的 page）元数据补齐：
 * 1. Hexo 不给 page 建 tags/categories 的 warehouse 对象，而 Butterfly 的
 *    post-info/indexPostUI 模板无条件访问 `page.categories.data` → 必崩（输出 0 字节）。
 *    这里给英文页补上空的 `{ data: [] }`，主题相应区块自然跳过。
 * 2. page.path 形如 `en/xxx/index.html`，给卡片链接补 `link` 让 URL 更干净（/en/xxx/）。
 * 在渲染前执行（generator 阶段），渲染 pass 拿到的就是改过的对象。
 */
hexo.extend.generator.register('en_pages_meta_shim', function (locals) {
  const pages = locals.pages;
  const list = pages && pages.data ? pages.data : [];
  for (const p of list) {
    if (p.lang !== 'en') continue;
    if (!p.categories || !p.categories.data) p.categories = { data: [] };
    if (!p.tags || !p.tags.data) p.tags = { data: [] };
    if (!p.link && typeof p.path === 'string' && p.path.endsWith('index.html')) {
      p.link = p.path.replace(/index\.html$/, '');
    }
  }
  return [];
});
