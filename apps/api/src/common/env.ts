/**
 * 启动时环境变量健全性检查（不强制退出，保持「无 .env 也能本地跑」）。
 * 对敏感项缺失或仍为开发默认值发出告警——生产部署应配置真实值。
 */
export function validateEnv(): void {
  const warnings: string[] = [];
  const driver = process.env.DB_DRIVER ?? 'sqlite';

  if (driver === 'postgres' && !process.env.DATABASE_URL) {
    warnings.push('DB_DRIVER=postgres 但未设 DATABASE_URL（将回退默认连接串）');
  }
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'dev-only-change-me') {
    warnings.push('JWT_SECRET 未设或为开发默认值——生产必须设强随机值（否则 token 可被伪造）');
  }
  if (!process.env.AI_CONFIG_SECRET) {
    warnings.push('AI_CONFIG_SECRET 未设——AI 凭证加密用默认/弱密钥，生产必须设置');
  }
  if (process.env.NODE_ENV === 'production' && !process.env.AI_GATEWAY_URL) {
    warnings.push('生产环境未设 AI_GATEWAY_URL——AI 能力将走 stub 降级（仅占位结果）');
  }

  if (warnings.length) {
    console.warn('[api] 环境变量告警（不阻断启动，生产请处理）：');
    for (const w of warnings) console.warn(`  ⚠️ ${w}`);
  }
}
