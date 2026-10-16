'use strict';

/**
 * 英文版首页生成器：列出所有 lang: en 的页面（source/en/**），
 * 渲染用主题自带的 index layout，与中文首页同款卡片流。
 * URL: /en/ , /en/page/2/ ...
 */
const pagination = require('hexo-pagination');

hexo.extend.generator.register('en_index', function (locals) {
  const config = this.config;
  const pages = locals.pages.filter(
    (p) => p.lang === 'en' && p.path !== 'en/index.html'
  );
  pages.data.sort((a, b) => b.date - a.date);

  const perPage = (config.index_generator && config.index_generator.per_page) || config.per_page || 10;
  const paginationDir =
    (config.index_generator && config.index_generator.pagination_dir) ||
    config.pagination_dir || 'page';

  return pagination('en/', pages, {
    perPage,
    layout: ['index', 'archive'],
    format: paginationDir + '/%d/',
    data: { __index: true, lang: 'en' },
  });
});
