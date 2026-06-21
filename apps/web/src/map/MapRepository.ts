// 命令层已下沉到 @mindline/map-core（前后端复用：web 写 Y.Doc、api 经 provider 服务端写入）。
// 此处 re-export 保持 web 内既有 import 路径不变（架构铁律②：命令层仍是唯一写入口）。
export { MapRepository, type EmitEvent } from '@mindline/map-core';
