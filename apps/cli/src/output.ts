/**
 * 输出层：默认人类可读，`--json` 输出结构化结果（供 AI / 脚本解析）。
 * 全局开关由 index.ts 在解析参数后调用 setJson() 设置。
 */
let jsonMode = false;

export function setJson(on: boolean): void {
  jsonMode = on;
}

export function isJson(): boolean {
  return jsonMode;
}

/** 成功输出：json 模式打印 {ok:true,data}，否则调用 human 渲染器。 */
export function output<T>(data: T, human: (d: T) => void): void {
  if (jsonMode) {
    process.stdout.write(JSON.stringify({ ok: true, data }, null, 2) + '\n');
  } else {
    human(data);
  }
}

/** 普通信息行（json 模式下抑制，避免污染结构化输出）。 */
export function info(line: string): void {
  if (!jsonMode) process.stdout.write(line + '\n');
}

/** 错误输出并以非零码退出；json 模式打印 {ok:false,error}。 */
export function fail(code: string, message: string): never {
  if (jsonMode) {
    process.stdout.write(JSON.stringify({ ok: false, error: { code, message } }, null, 2) + '\n');
  } else {
    process.stderr.write(`✗ ${message}${code ? `  (${code})` : ''}\n`);
  }
  process.exit(1);
}
