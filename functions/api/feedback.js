const ALLOWED_TYPES = new Set(["中文名称错误", "英文名称错误", "编码错误", "层级错误", "缺少词条", "其他"]);
const PROJECT_KEY = "icd10-eindex";
function json(data, status = 200) { return Response.json(data, { status, headers: { "cache-control": "no-store" } }); }
function text(value, maxLength) { return String(value ?? "").trim().slice(0, maxLength); }
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) return json({ ok: false, error: "D1 数据库未绑定" }, 500);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 16000) return json({ ok: false, error: "请求内容过大" }, 413);
  let body; try { body = JSON.parse(raw); } catch { return json({ ok: false, error: "请求内容不是有效 JSON" }, 400); }
  const feedbackType = text(body.feedbackType, 40), message = text(body.message, 2000);
  const proposedValue = text(body.proposedValue, 500), contact = text(body.contact, 200);
  if (!ALLOWED_TYPES.has(feedbackType)) return json({ ok: false, error: "反馈类型无效" }, 400);
  if (message.length < 5) return json({ ok: false, error: "反馈说明至少需要填写 5 个字符" }, 400);
  const ip = text(request.headers.get("CF-Connecting-IP"), 64);
  try {
    const recent = await env.DB.prepare("SELECT COUNT(*) AS count FROM feedback WHERE project_key = ? AND ip_address = ? AND created_at >= datetime('now', '-1 hour')").bind(PROJECT_KEY, ip).first();
    if (Number(recent?.count || 0) >= 20) return json({ ok: false, error: "提交过于频繁，请稍后再试" }, 429);
  } catch (error) { console.error(JSON.stringify({ event: "feedback_rate_limit_failed", message: String(error) })); }
  let recordData; try {
    const source = body.record ?? {};
    recordData = JSON.stringify({ index: body.index ?? source.index ?? null, position: body.position ?? null, page: text(source.page, 20), level: text(source.level, 10), name_zh: text(source.name_zh, 500), name_en: text(source.name_en, 1000), code: text(source.code, 100), confidence: source.confidence ?? null });
  } catch { return json({ ok: false, error: "词条数据格式无效" }, 400); }
  if (recordData.length > 12000) return json({ ok: false, error: "词条数据过大" }, 413);
  try {
    const result = await env.DB.prepare(`INSERT INTO feedback (project_key, record_data, feedback_type, proposed_value, message, contact, url, user_agent, as_name, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(PROJECT_KEY, recordData, feedbackType, proposedValue, message, contact, text(body.url, 1000), text(request.headers.get("user-agent"), 500), text(request.cf?.asOrganization, 200), ip).run();
    return json({ ok: true, id: result.meta?.last_row_id ?? null }, 201);
  } catch (error) { console.error(JSON.stringify({ event: "feedback_insert_failed", message: String(error) })); return json({ ok: false, error: "反馈保存失败" }, 500); }
}
export function onRequestGet() { return json({ ok: false, error: "Method not allowed" }, 405); }
