import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const csvPath = path.join(root, "data", "eindex.csv");
const templatePath = path.join(root, "template", "index.template.html");
const outputDir = path.join(root, "dist");
const outputPath = path.join(outputDir, "index.html");
const referenceImage = path.join(root, "target_page_1541.jpg");
const PLACEHOLDER = "__EINDEX_DATA__";
const REQUIRED_HEADERS = ["image_page", "level", "chinese", "english", "code", "confidence"];

function parseCsv(text) {
  const rows = [], errors = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ""; }
    else if (ch === '\n') { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += ch;
  }
  if (quoted) errors.push("CSV 存在未闭合引号");
  if (field || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  if (!rows.length) throw new Error("CSV 为空");
  const headers = rows.shift().map((v, i) => i === 0 ? v.replace(/^\uFEFF/, "") : v);
  const missing = REQUIRED_HEADERS.filter(h => !headers.includes(h));
  if (missing.length) throw new Error(`CSV 缺少字段：${missing.join(", ")}`);
  const data = rows.filter(r => r.some(Boolean)).map((r, i) => {
    if (r.length !== headers.length) errors.push(`第 ${i + 2} 行列数为 ${r.length}，应为 ${headers.length}`);
    return Object.fromEntries(headers.map((h, j) => [h, (r[j] ?? "").trim()]));
  });
  if (errors.length) throw new Error(errors.slice(0, 10).join("；"));
  return data;
}

function number(value, field, rowNumber, { integer = false, required = false, min = -Infinity, max = Infinity } = {}) {
  if (value === "" && !required) return null;
  const result = Number(value);
  if (!Number.isFinite(result) || (integer && !Number.isInteger(result)) || result < min || result > max) {
    throw new Error(`第 ${rowNumber} 行 ${field} 无效：${value}`);
  }
  return result;
}

function normalize(rows) {
  return rows.map((r, i) => ({
    index: i,
    page: number(r.image_page, "image_page", i + 2, { integer: true, required: true, min: 1 }),
    level: number(r.level, "level", i + 2, { integer: true, required: true, min: 0, max: 10 }),
    name_zh: r.chinese, name_en: r.english, code: r.code,
    confidence: number(r.confidence, "confidence", i + 2, { min: 0, max: 1 }),
    parent: null, children: [],
  }));
}

function hierarchy(records) {
  const last = new Map();
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (record.level > 0 && !last.has(record.level - 1)) {
      throw new Error(`第 ${i + 2} 行 level=${record.level} 缺少直接父级 level=${record.level - 1}`);
    }
    if (record.level > 0) {
      record.parent = last.get(record.level - 1);
      records[record.parent].children.push(i);
    }
    last.set(record.level, i);
    for (const level of last.keys()) if (level > record.level) last.delete(level);
  }
  return records;
}

function inline(value) { return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029"); }
const [csvText, template] = await Promise.all([fs.readFile(csvPath, "utf8"), fs.readFile(templatePath, "utf8")]);
if (!template.includes(PLACEHOLDER)) throw new Error(`模板缺少 ${PLACEHOLDER}`);
const data = hierarchy(normalize(parseCsv(csvText)));
const output = template.replace(PLACEHOLDER, inline(data));
if (!output.includes("/api/feedback") || !output.includes("referenceAliases") || !output.includes("data-feedback-position")) {
  throw new Error("模板缺少反馈或交叉索引功能");
}
await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(outputPath, output, "utf8");
await fs.copyFile(referenceImage, path.join(outputDir, "target_page_1541.jpg"));
const stat = await fs.stat(outputPath);
console.log(`Built ${data.length} records -> ${outputPath}`);
console.log(`Output size: ${(stat.size / 1024 / 1024).toFixed(2)} MiB`);
