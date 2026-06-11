import { MigrationPreviewDto } from './migration-preview.dto';

/**
 * 执行迁移请求 DTO。
 * 与预览请求字段完全相同，无额外字段（见 Schema迁移工具详设 §11）。
 */
export class MigrationExecuteDto extends MigrationPreviewDto {}
