import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

/**
 * 配置密钥的对称加密（D4）。AES-256-GCM；主密钥取自 env AI_CONFIG_SECRET。
 * DB 仅存密文（v1:iv:tag:cipher，均 base64）。仅用于 ai_provider_configs.config.apiKeyEnc
 * 与 im_channels.config.secretEnc 等敏感字段。
 */
const ALG = 'aes-256-gcm';
let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.AI_CONFIG_SECRET;
  if (secret) {
    const b64 = Buffer.from(secret, 'base64');
    if (b64.length === 32) return (cachedKey = b64);
    const hex = Buffer.from(secret, 'hex');
    if (hex.length === 32) return (cachedKey = hex);
    // 任意口令 → scrypt 派生 32 字节
    return (cachedKey = scryptSync(secret, 'mindline-ai-config', 32));
  }
  // 未配置：派生开发密钥并告警（生产必须设置 AI_CONFIG_SECRET）
  console.warn('[crypto] AI_CONFIG_SECRET 未设置，使用不安全的开发派生密钥；生产环境务必配置！');
  return (cachedKey = scryptSync('mindline-dev-insecure', 'mindline-ai-config', 32));
}

/** 加密明文 → "v1:<ivB64>:<tagB64>:<cipherB64>"。 */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

/** 解密 "v1:iv:tag:cipher"；格式错误或校验失败抛错。 */
export function decryptSecret(payload: string): string {
  const [v, ivB64, tagB64, dataB64] = payload.split(':');
  if (v !== 'v1' || !ivB64 || !tagB64 || !dataB64) throw new Error('密文格式无效');
  const decipher = createDecipheriv(ALG, getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/** 脱敏展示密钥（仅保留尾 4 位），用于列表返回，绝不回传明文。 */
export function maskSecret(plain: string): string {
  if (!plain) return '';
  return `••••${plain.slice(-4)}`;
}
