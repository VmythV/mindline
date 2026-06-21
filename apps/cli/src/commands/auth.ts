import { createInterface } from 'node:readline';
import type { Command } from 'commander';
import { request } from '../client';
import { loadConfig, saveConfig, clearAuth, configPath } from '../config';
import { output, info, fail } from '../output';

interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; tenantId: string; email: string; displayName: string };
}

/** 交互式输入；hidden=true 时抑制密码回显。 */
function question(query: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      const masked = rl as unknown as { _writeToOutput?: (s: string) => void };
      masked._writeToOutput = (s: string) => {
        if (s.includes('\n')) process.stdout.write('\n');
      };
    }
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export function registerAuthCommands(program: Command): void {
  program
    .command('login')
    .description('登录并保存凭证到本地（~/.mindline/config.json）')
    .option('-e, --email <email>', '邮箱（缺省读 MINDLINE_EMAIL 或交互输入）')
    .option('-p, --password <password>', '密码（缺省读 MINDLINE_PASSWORD 或交互输入）')
    .action(async (opts: { email?: string; password?: string }) => {
      const email = opts.email ?? process.env.MINDLINE_EMAIL ?? (await question('邮箱: '));
      const password =
        opts.password ?? process.env.MINDLINE_PASSWORD ?? (await question('密码: ', true));
      if (!email || !password) fail('INVALID_INPUT', '邮箱与密码均不能为空');

      const res = await request<LoginResult>('POST', '/auth/login', { email, password });
      const cfg = loadConfig();
      saveConfig({
        ...cfg,
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
        user: res.user,
      });
      output(res.user, (u) =>
        info(`✓ 已登录为 ${u.displayName} <${u.email}>（租户 ${u.tenantId}）`),
      );
    });

  program
    .command('logout')
    .description('清除本地登录态')
    .action(() => {
      clearAuth();
      output({ loggedOut: true }, () => info('✓ 已登出'));
    });

  program
    .command('whoami')
    .description('显示当前登录用户（GET /me）')
    .action(async () => {
      const cfg = loadConfig();
      if (!cfg.accessToken) fail('UNAUTHENTICATED', `未登录。配置文件：${configPath}`);
      const me = await request<{ id: string; email: string; displayName: string }>('GET', '/me');
      output(me, (m) => info(`${m.displayName} <${m.email}>  (${m.id})`));
    });
}
