// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/build/**', '**/.next/**', '**/.turbo/**', '**/coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  // 架构硬约束（占位，待 packages/shared 的命令层 MapRepository 落地后启用）：
  // 禁止业务层（apps/web 除命令层目录外）直接 import 'yjs' 写类型，强制所有 Y.Doc 写入走命令层。
  // 见 docs/detail/Yjs协同详设.md §11 与 docs/TODOLIST.md 0.1 / M0.6。
  // {
  //   files: ['apps/web/src/**/*.{ts,tsx}'],
  //   ignores: ['apps/web/src/map/**'],
  //   rules: {
  //     'no-restricted-imports': ['error', { paths: [{ name: 'yjs', message: '请通过命令层 (MapRepository) 写入 Y.Doc，禁止直接操作 yjs。' }] }],
  //   },
  // },
);
