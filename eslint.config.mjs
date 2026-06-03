// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/build/**', '**/.next/**', '**/.turbo/**', '**/coverage/**', '**/scripts/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  // 架构硬约束（约定②）：禁止业务层（apps/web 除协同内核 map/ 目录外）直接 import 'yjs'，
  // 强制所有 Y.Doc 写入走命令层 MapRepository。map/ 内含命令层本体与连接、派生基建，予以豁免。
  // 见 docs/detail/Yjs协同详设.md §11 与 docs/TODOLIST.md 0.1 / M0.6。
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    ignores: ['apps/web/src/map/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'yjs', message: '请通过命令层 (MapRepository) 写入 Y.Doc，禁止业务层直接操作 yjs。' },
          ],
          patterns: [
            { group: ['yjs/*'], message: '请通过命令层 (MapRepository) 写入 Y.Doc，禁止业务层直接操作 yjs。' },
          ],
        },
      ],
    },
  },
);
