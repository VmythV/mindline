import { Command } from 'commander';
import { ApiError, configureClient } from './client';
import { setJson, fail } from './output';
import { registerAuthCommands } from './commands/auth';
import { registerProjectCommands } from './commands/project';
import { registerNodeCommands } from './commands/node';
import { registerAiCommands } from './commands/ai';
import { registerTimelineCommands } from './commands/timeline';
import { registerImCommands } from './commands/im';

const program = new Command();

program
  .name('mindline')
  .description('思谱 Mindline 命令行客户端：供 AI（SKILL）与脚本操作思维导图')
  .version('0.0.0')
  .option('--json', '以 JSON 结构化输出（供 AI / 脚本解析）', false)
  .option('--api <url>', 'API 基址（覆盖本地配置，默认 http://localhost:3001/api）')
  .option('--token <token>', '直接使用 access token（覆盖本地登录态）')
  .hook('preAction', () => {
    const o = program.opts<{ json?: boolean; api?: string; token?: string }>();
    setJson(!!o.json);
    configureClient({ apiBase: o.api, token: o.token });
  });

registerAuthCommands(program);
registerProjectCommands(program);
registerNodeCommands(program);
registerAiCommands(program);
registerTimelineCommands(program);
registerImCommands(program);

async function main(): Promise<void> {
  try {
    await program.parseAsync(process.argv);
  } catch (e) {
    if (e instanceof ApiError) fail(e.code, e.message);
    fail('INTERNAL', e instanceof Error ? e.message : '未知错误');
  }
}

void main();
