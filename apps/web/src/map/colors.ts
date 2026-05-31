/** 由 id 稳定生成一个高辨识度颜色（用户着色）。 */
export function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `hsl(${h}, 68%, 52%)`;
}
