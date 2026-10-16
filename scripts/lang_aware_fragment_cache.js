'use strict';

/**
 * 覆盖 Hexo 的 fragment_cache helper：缓存键按页面语言隔离。
 * Butterfly 把 sidebar / footer / nav menu 等 chrome 片段用 {cache: true} 缓存，
 * 键只有 view 路径 —— 第一个渲染的页面（中文）会把片段"污染"给英文页。
 * 这里给每个键追加 `::<page.lang>`，中英文各自渲染各自的。
 * 站点脚本晚于 hexo 核心插件注册，同名 helper 后注册者胜。
 */
const { Cache } = require('hexo-util');
const cache = new Cache();

hexo.on('generateBefore', () => cache.flush());

hexo.extend.helper.register('fragment_cache', function (id, fn) {
  const lang = (this.page && this.page.lang) || 'default';
  return cache.apply(id + '::' + lang, fn);
});
