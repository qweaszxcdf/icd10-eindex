# ICD-10 外因索引查询（eindex）

基于 `icd10-drug-index` 的单文件 SPA 架构，数据来自已完成 WHO 对照和索引行重建的外因索引 CSV。

## 功能

- 中文、英文、V/W/X/Y 编码检索
- 多关键词 AND 检索
- 命中词高亮
- 完整父级路径
- 直接子项
- 移动端和深色模式
- `Ctrl+K` / `Command+K` 聚焦
- 词条反馈提交（Cloudflare D1）

## 构建

```bash
npm run build
```

构建产物为 `dist/index.html`，无需运行时依赖。

## 修改数据

替换 `data/eindex.csv`，字段必须为：

```text
image_page,level,chinese,english,code,confidence
```

然后重新执行 `npm run build`。

## Cloudflare Pages

- Build command: `npm run build`

反馈首次启用前执行：

```bash
npx wrangler d1 execute feedback --remote --file=schema.sql
```
- Output directory: `dist`
- Node.js: 20+
