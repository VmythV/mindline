import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  clean: true,
  sourcemap: true,
  // CLI 可执行入口：注入 shebang，让 dist/index.js 直接可运行
  banner: { js: '#!/usr/bin/env node' },
  // 仅把 workspace 包 shared 打进产物（全局安装时无法解析 workspace:*）；
  // commander 保持 external——它是 CJS 且自带 ESM wrapper，内联会触发 dynamic require 报错
  noExternal: ['@mindline/shared'],
});
