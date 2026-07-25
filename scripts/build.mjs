import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const csvPath = path.join(root, "data", "eindex.csv");
const templatePath = path.join(root, "template", "index.template.html");
const outputDir = path.join(root, "dist");
const outputPath = path.join(outputDir, "index.html");
const referenceImage = path.join(root, "target_page_1541.jpg");
const PLACEHOLDER = "__EINDEX_DATA__";

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ""; }
    else if (ch === '\n') { row.push(field.replace(/\r$/, "")); rows.push(row); row=[]; field=""; }
    else field += ch;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  const headers = rows.shift().map((v, i) => i === 0 ? v.replace(/^\uFEFF/, "") : v);
  return rows.filter(r => r.some(Boolean)).map(r => Object.fromEntries(headers.map((h,i)=>[h,(r[i]??"").trim()])));
}
function n(v, fallback=0){ const x=Number(v); return Number.isFinite(x)?x:fallback; }
function normalize(rows){ return rows.map((r,i)=>({
  index:i, page:n(r.image_page), level:Math.max(0,n(r.level)),
  name_zh:r.chinese||"", name_en:r.english||"", code:r.code||"",
  confidence:n(r.confidence,1), parent:null, children:[]
})); }
function hierarchy(records){
  const last=new Map();
  for(let i=0;i<records.length;i++){
    const r=records[i]; let p=null;
    for(let l=r.level-1;l>=0;l--) if(last.has(l)){p=last.get(l);break;}
    r.parent=p; if(p!==null) records[p].children.push(i); last.set(r.level,i);
    for(const l of [...last.keys()]) if(l>r.level) last.delete(l);
  }
  return records;
}
function inline(v){return JSON.stringify(v).replace(/</g,"\\u003c").replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029");}
const [csvText,template]=await Promise.all([fs.readFile(csvPath,"utf8"),fs.readFile(templatePath,"utf8")]);
if(!template.includes(PLACEHOLDER)) throw new Error(`模板缺少 ${PLACEHOLDER}`);
const data=hierarchy(normalize(parseCsv(csvText)));
const seeLinkCode=`function seeLinks(v){let out=esc(v);return out.replace(/(see(?: also)?\\s+[^;。)]+|见[^；。)]+)/gi,m=>\`<button class="see" data-query="\${esc(m.replace(/^see(?: also)?\\s+/i,'').replace(/^见/,'').trim())}">\${m}</button>\`)};`;
const feedbackDialog='<dialog id="feedback-dialog" class="feedback-dialog"><form id="feedback-form"><div class="feedback-header"><div><strong>提交数据反馈</strong><div id="feedback-record" class="feedback-record-name"></div></div></div><label class="field"><span>问题类型</span><select id="feedback-type" required><option value="">请选择</option><option>中文名称错误</option><option>英文名称错误</option><option>编码错误</option><option>层级错误</option><option>缺少词条</option><option>其他</option></select></label><label class="field"><span>建议修改为</span><input id="feedback-proposed" maxlength="500" placeholder="可选"></label><label class="field"><span>问题说明</span><textarea id="feedback-message" maxlength="2000" rows="6" required></textarea></label><label class="field"><span>联系方式</span><input id="feedback-contact" maxlength="200" placeholder="可选"></label><div id="feedback-status" class="feedback-status"></div><div class="feedback-actions"><button type="button" id="feedback-cancel" class="secondary-btn">取消</button><button type="submit" id="feedback-submit" class="primary-btn">提交反馈</button></div></form></dialog>';
const feedbackStyle='<style>.feedback-dialog{width:min(600px,calc(100% - 24px));border:1px solid var(--border);border-radius:18px;padding:0;background:var(--panel);box-shadow:var(--shadow)}.feedback-dialog::backdrop{background:rgb(0 0 0 / .5);backdrop-filter:blur(3px)}.feedback-dialog form{padding:22px}.feedback-header{display:flex;justify-content:space-between;gap:16px;margin-bottom:20px}.feedback-record-name{margin-top:5px;color:var(--muted);font-size:13px}.field{display:grid;gap:7px;margin-bottom:15px}.field span{font-size:14px;font-weight:600}.field input,.field select,.field textarea{width:100%;border:1px solid var(--border);border-radius:10px;padding:11px 12px;background:var(--subtle);color:var(--text)}.field textarea{resize:vertical}.feedback-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:20px}.primary-btn,.secondary-btn{border-radius:10px;padding:10px 16px;cursor:pointer}.primary-btn{border:0;background:var(--accent);color:white}.secondary-btn{border:1px solid var(--border);background:transparent;color:var(--text)}.feedback-status{min-height:22px;color:var(--muted);font-size:14px}.card-actions{display:flex;justify-content:flex-end;margin-top:14px}.card-feedback{border:1px solid var(--border);border-radius:9px;padding:7px 11px;background:transparent;color:var(--accent);cursor:pointer;font-size:13px}.card-feedback:hover{background:var(--chip)}</style>';
const feedbackCode=`const feedbackDialog=document.getElementById('feedback-dialog'),feedbackForm=document.getElementById('feedback-form');let feedbackPosition=null;function openFeedback(pos){feedbackPosition=pos;const r=DATA[pos];document.getElementById('feedback-record').textContent=[\`索引 \${r.index}\`,r.name_zh,r.name_en,r.code].filter(Boolean).join(' / ');feedbackForm.reset();feedbackDialog.showModal()}document.getElementById('feedback-cancel').addEventListener('click',()=>feedbackDialog.close());feedbackForm.addEventListener('submit',async e=>{e.preventDefault();const button=document.getElementById('feedback-submit'),status=document.getElementById('feedback-status'),row=DATA[feedbackPosition];button.disabled=true;status.textContent='正在提交……';try{const r=await fetch('/api/feedback',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({feedbackType:document.getElementById('feedback-type').value,proposedValue:document.getElementById('feedback-proposed').value,message:document.getElementById('feedback-message').value,contact:document.getElementById('feedback-contact').value,index:row.index,position:feedbackPosition,record:row,url:location.href})});const result=await r.json();if(!r.ok)throw new Error(result.error||'提交失败');status.textContent='反馈已提交';setTimeout(()=>feedbackDialog.close(),800)}catch(error){status.textContent=error.message}finally{button.disabled=false}});`;
const enhancedTemplate=template
  .replace("mark{", ".see{border:0;padding:0;background:transparent;color:var(--accent);text-decoration:underline;cursor:pointer}mark{")
  .replace("</style>", `${feedbackStyle}</style>`)
  .replace("</header>", '<a class="reference" href="target_page_1541.jpg" target="_blank" rel="noopener">显示：陆地运输意外事故表</a></header>')
  .replace("function hi(v,terms){",`${seeLinkCode}function hi(v,terms){`)
  .replace("let out=esc(v);for(const t", "let out=seeLinks(v);if(/see(?: also)?\\s+|另?见/i.test(v))return out;for(const t")
  .replace("</main>", `${feedbackDialog}</main>`)
  .replace("</script>", `${feedbackCode}</script>`)
  .replace("</div><div class=\"en\">", "<button class=\"card-feedback\" type=\"button\" data-feedback-position=\"${pos}\">Report</button></div><div class=\"en\">")
  .replace("q.value=r.name_zh||r.name_en||r.code;render();", "renderExact(Number(b.dataset.pos));")
  .replace("results.addEventListener('click',e=>{", "function renderExact(pos){const r=DATA[pos];if(!r)return;const label=r.name_zh||r.name_en||r.code;q.value=label;clear.style.display='block';meta.textContent=`精准定位：${label}`;results.innerHTML=card(pos,[])}const referenceAliases=(()=>{const aliases=new Map();for(const r of DATA){const zh=[...String(r.name_zh||'').matchAll(/(?:另?见|见)\\s*([^；。)]+)/g)].map(m=>norm(m[1]).replace(/[，、]$/,''));const en=[...String(r.name_en||'').matchAll(/see(?: also)?\\s+([^;。):]+?)(?=\\s*(?:[:-]|$))/gi)].map(m=>norm(m[1]).replace(/[,:]$/,''));if(zh.length&&en.length)for(let i=0;i<Math.min(zh.length,en.length);i++)aliases.set(zh[i],en[i])}return aliases})();function findExactTarget(target){const wanted=norm(target);return DATA.findIndex(r=>norm(r.name_en)===norm(referenceAliases.get(wanted)||wanted)||norm(r.name_zh)===wanted)}results.addEventListener('click',e=>{")
  .replace("q.value=see.dataset.query;render();scrollTo({top:0,behavior:'smooth'});return", "const exact=findExactTarget(see.dataset.query);if(exact>=0)renderExact(exact);else{q.value=see.dataset.query;render()}scrollTo({top:0,behavior:'smooth'});return")
  .replace("results.addEventListener('click',e=>{const b=e.target.closest('[data-pos]');", "results.addEventListener('click',e=>{const feedback=e.target.closest('[data-feedback-position]');if(feedback){openFeedback(Number(feedback.dataset.feedbackPosition));return}const see=e.target.closest('[data-query]');if(see){const exact=findExactTarget(see.dataset.query);if(exact>=0)renderExact(exact);else{q.value=see.dataset.query;render()}scrollTo({top:0,behavior:'smooth'});return}const b=e.target.closest('[data-pos]');");
await fs.mkdir(outputDir,{recursive:true});
await fs.writeFile(outputPath,enhancedTemplate.replace(PLACEHOLDER,inline(data)),"utf8");
await fs.copyFile(referenceImage, path.join(outputDir, "target_page_1541.jpg"));
const stat=await fs.stat(outputPath);
console.log(`Built ${data.length} records -> ${outputPath}`);
console.log(`Output size: ${(stat.size/1024/1024).toFixed(2)} MiB`);
