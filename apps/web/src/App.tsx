import { ROLES } from '@mindline/shared';

export function App() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 48, lineHeight: 1.6 }}>
      <h1 style={{ marginBottom: 4 }}>思谱 Mindline</h1>
      <p style={{ color: '#555' }}>思维导图 × AI 拆解 × 时间轴</p>
      <p style={{ color: '#999', fontSize: 14 }}>
        脚手架就绪 · 共享契约角色枚举：{ROLES.join(' / ')}
      </p>
    </main>
  );
}
