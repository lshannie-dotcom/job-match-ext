import { esc, clamp, fmtTime, SWATCH } from "./util.js";
import { TIER_META } from "./config.js";

const DIM_LABEL = { skill: "技能", experience: "经历", project: "项目", education: "学历" };
const QDIM_LABEL = { prospect: "前景", team: "部门", salary: "薪资", city: "城市" };

const scoreColor = (v) => (v >= 80 ? "#0f9d76" : v >= 65 ? "#4f46e5" : v >= 50 ? "#c2740a" : "#d92d20");

const chips = (list, cls = "") =>
  (list || []).filter(Boolean).map((x) => `<span class="tag ${cls}">${esc(x)}</span>`).join("");

const bullets = (list, cls = "") =>
  (list || []).filter(Boolean).length
    ? `<ul class="bullet ${cls}">${list.filter(Boolean).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`
    : `<div class="qa-empty">—</div>`;

const kv = (label, value) =>
  value
    ? `<div class="kv"><b>${esc(label)}</b><span>${esc(value)}</span></div>`
    : "";

const levelCls = (lv) => (lv === "强" ? "s" : lv === "中" ? "m" : "w");

export function renderResume(state) {
  const root = document.getElementById("resumePreview");
  const r = state.resume;
  if (!r) {
    root.hidden = true;
    root.innerHTML = "";
    return;
  }
  const words = (r.text || "").replace(/\s/g, "").length;
  const thumbs = (r.images || [])
    .map(
      (im, i) =>
        `<div class="thumb"><img src="${im.dataUrl}" alt="简历图片${i + 1}" /><div class="tag">图 ${i + 1}</div><button data-action="delResumeImage" data-idx="${i}" title="删除">×</button></div>`
    )
    .join("");
  root.hidden = false;
  root.innerHTML = `
    <div class="resume-card">
      <div class="resume-top">
        <div class="file-ico">${esc((r.kind || "file").toUpperCase().slice(0, 4))}</div>
        <div class="resume-meta">
          <b>${esc(r.fileName || "简历")}</b>
          <span>${words ? `${words} 字` : "图片简历"}${r.images?.length ? ` · ${r.images.length} 张图片` : ""} · 更新于 ${fmtTime(r.updatedAt)}</span>
        </div>
        <div class="resume-actions">
          <button class="btn ghost sm" data-action="pickResume">重新上传</button>
          <button class="btn ghost sm danger" data-action="delResume">删除</button>
        </div>
      </div>
      ${
        r.text
          ? `<div class="resume-text"><textarea id="resumeText" rows="7" placeholder="简历正文">${esc(r.text)}</textarea>
             <div class="hint-line">可以直接在这里修改解析结果，分析用的是这段文字。</div></div>`
          : `<div class="hint-line" style="margin-top:10px">这是图片简历，将由视觉模型直接读图分析。如果模型不支持图片，请换成文字版简历。</div>`
      }
      ${thumbs ? `<div class="thumbs">${thumbs}</div>` : ""}
    </div>`;
}

export function renderCities(state) {
  const wrap = document.getElementById("cityChips");
  const CITIES = window.__CITIES__ || [];
  const extra = (state.cities || []).filter((c) => !CITIES.includes(c));
  wrap.innerHTML = [...CITIES, ...extra]
    .map((c) => `<button class="chip ${state.cities.includes(c) ? "on" : ""}" data-action="toggleCity" data-city="${esc(c)}">${esc(c)}</button>`)
    .join("");
  const s = document.getElementById("salaryExpect");
  if (s.value !== (state.salaryExpect || "")) s.value = state.salaryExpect || "";
}

export function renderJDs(state) {
  const list = document.getElementById("jdList");
  const empty = document.getElementById("jdEmpty");
  const jds = state.jds || [];
  empty.hidden = jds.length > 0;
  list.innerHTML = jds
    .map((jd, i) => {
      const words = (jd.text || "").replace(/\s/g, "").length;
      return `<div class="jd-card" data-jd="${jd.id}">
        <div class="jd-top">
          <div class="jd-idx">${i + 1}</div>
          <div class="jd-main">
            <div class="jd-name">${esc(jd.title || `未命名岗位 ${i + 1}`)}</div>
            <div class="jd-meta">
              ${jd.dept ? `<span class="tag dept">${esc(jd.dept)}</span>` : ""}
              ${jd.city ? `<span class="tag city">${esc(jd.city)}</span>` : ""}
              ${jd.images?.length ? `<span class="tag img">含图片 ${jd.images.length}</span>` : ""}
              <span class="tag">${words} 字</span>
              ${jd.sourceUrl ? `<a class="tag" href="${esc(jd.sourceUrl)}" target="_blank" rel="noreferrer">来源</a>` : ""}
            </div>
          </div>
          <div class="jd-actions">
            <button class="icon-btn" data-action="toggleJDText" title="展开/收起">
              <svg viewBox="0 0 20 20" fill="none"><path d="M6 8l4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <button class="icon-btn" data-action="editJD" title="编辑">
              <svg viewBox="0 0 20 20" fill="none"><path d="M12.4 4.6l3 3-8 8H4.4v-3l8-8Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
            </button>
            <button class="icon-btn danger" data-action="delJD" title="删除">
              <svg viewBox="0 0 20 20" fill="none"><path d="M4.5 6.5h11M8 6.5V5h4v1.5M6.5 6.5l.6 8.2h5.8l.6-8.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>
        </div>
        <div class="jd-text">${esc((jd.text || "（无文字，仅图片）").slice(0, 600))}</div>
      </div>`;
    })
    .join("");
}

export function renderQA(state) {
  const wrap = document.getElementById("qaList");
  const qs = state.qa?.questions || [];
  if (!qs.length) {
    wrap.innerHTML = `<div class="qa-empty">还没有问题。点右上角「生成问题」，模型会根据你的简历和岗位清单问 4–6 个关键问题；也可以跳过直接分析。</div>`;
    return;
  }
  wrap.innerHTML = qs
    .map((q, i) => {
      const ans = state.qa.answers?.[q.id];
      const isMulti = q.type === "multi";
      const opts = (q.options || [])
        .map((o) => {
          const on = isMulti ? Array.isArray(ans) && ans.includes(o) : ans === o;
          return `<button class="chip ${on ? "on" : ""}" data-action="answerQA" data-qid="${esc(q.id)}" data-opt="${esc(o)}" data-multi="${isMulti}">${esc(o)}</button>`;
        })
        .join("");
      return `<div class="qa-item">
        <div class="qa-q">${i + 1}. ${esc(q.q)}</div>
        ${q.why ? `<div class="qa-why">${esc(q.why)}</div>` : ""}
        ${opts ? `<div class="qa-options">${opts}</div>` : ""}
        <textarea data-action="qaText" data-qid="${esc(q.id)}" rows="2" placeholder="${esc(q.hint || "补充说明（可留空）")}">${esc(!isMulti && !q.options?.length ? ans || "" : "")}</textarea>
      </div>`;
    })
    .join("");
}

export function renderMiniStats(state) {
  const el = document.getElementById("miniStats");
  const r = state.resume;
  const limit = Number(state.company?.limit) || 0;
  const rows = [
    ["简历", r ? (r.fileName || "已上传") : "未上传"],
    ["岗位", `${state.jds?.length || 0} 个`],
    ["城市", state.cities?.length ? state.cities.join("、") : "未选择"],
    ["投递上限", limit ? `${limit} 个` : "未填写"],
    ["模型", state.settings?.model || "未选择"]
  ];
  el.innerHTML = rows
    .map(([k, v]) => `<li><span>${k}</span><b title="${esc(v)}">${esc(v)}</b></li>`)
    .join("");
}

export function readiness(state) {
  const checks = [
    { ok: !!state.resume, label: "简历", weight: 30 },
    { ok: (state.cities || []).length > 0, label: "意向城市", weight: 15 },
    { ok: (state.jds || []).length >= 2, label: "岗位 ≥2", weight: 25 },
    { ok: !!state.company?.name && Number(state.company?.limit) > 0, label: "公司与上限", weight: 15 },
    { ok: !!state.settings?.apiKey || state.settings?.provider === "ollama", label: "模型 Key", weight: 15 }
  ];
  const score = checks.reduce((n, c) => n + (c.ok ? c.weight : 0), 0);
  return { checks, score };
}

/* ---------------- 结果 ---------------- */

const ring = (v, label = "综合") => {
  const val = clamp(v);
  return `<div class="ring" style="--v:${val};--c:${scoreColor(val)}"><div class="val" style="color:${scoreColor(val)}">${val}</div><div class="lb">${label}</div></div>`;
};

const dimRows = (obj, labels) =>
  Object.entries(labels)
    .map(([k, name]) => {
      const v = clamp(obj?.[k]);
      return `<div class="dim-row"><span>${name}</span><div class="dim-bar"><i style="width:${v}%"></i></div><b>${v}</b></div>`;
    })
    .join("");

function posBody(p) {
  const m = p.match || {};
  const q = p.qualityDetail || {};
  const s = p.salary || {};
  const t = p.team || {};
  const pr = p.prospect || {};
  const matched = (p.matched || [])
    .map(
      (x) =>
        `<tr><td>${esc(x.req || "")}</td><td>${esc(x.evidence || "")} <span class="lv ${levelCls(x.level)}">${esc(x.level || "中")}</span></td></tr>`
    )
    .join("");
  const gapList = (p.gaps || [])
    .map(
      (g) =>
        `<li><b>${esc(g.req || "")}</b>：${esc(g.gap || "")}<br/><span style="color:#4f46e5">补法：${esc(g.fix || "")}</span> <span class="lv w">${esc(g.effort || "中")}成本</span></li>`
    )
    .join("");

  return `<div class="pos-body">
    <div class="dim-grid">
      <div class="dim-box"><div class="dt">人岗匹配 · ${clamp(p.score)} 分</div>${dimRows(m, DIM_LABEL)}</div>
      <div class="dim-box"><div class="dt">岗位质量 · ${clamp(p.quality)} 分</div>${dimRows(q, QDIM_LABEL)}</div>
    </div>

    <div class="pos-cols">
      <div>
        <div class="pos-block">
          <h4><span class="bar"></span>命中要点（简历证据）</h4>
          ${matched ? `<table class="match-table"><thead><tr><th>JD 要求</th><th>你的证据</th></tr></thead><tbody>${matched}</tbody></table>` : `<div class="qa-empty">—</div>`}
        </div>
        <div class="pos-block">
          <h4><span class="bar"></span>关键缺口与补法</h4>
          ${gapList ? `<ul class="bullet gaps">${gapList}</ul>` : `<div class="qa-empty">没有明显硬缺口</div>`}
        </div>
        <div class="pos-block">
          <h4><span class="bar"></span>为什么是这个分</h4>
          <div class="clamp-note">${esc(p.reason || "—")}</div>
        </div>
      </div>
      <div>
        <div class="pos-block">
          <h4><span class="bar"></span>薪资 · 部门 · 前景</h4>
          <div class="kv-list">
            ${kv("薪资", s.range || "未知")}
            ${s.confidence ? `<div class="kv"><b>置信度</b><span>${esc(s.confidence)}${s.note ? ` · ${esc(s.note)}` : ""}</span></div>` : ""}
            ${kv("氛围", t.atmosphere)}
            ${kv("福利/强度", t.welfare)}
            ${kv("裁员风险", t.layoffRisk ? `${t.layoffRisk}${t.confidence ? `（置信度${t.confidence}）` : ""}` : "")}
            ${kv("稳定性", t.stability)}
            ${kv("前景", pr.trend)}
            ${kv("成长", pr.growth)}
            ${kv("可迁移", pr.transfer)}
            ${kv("城市", p.cityFit)}
          </div>
        </div>
        <div class="pos-block">
          <h4><span class="bar"></span>简历改写建议（可直接抄）</h4>
          ${bullets(p.resumeTips, "tips")}
        </div>
        <div class="pos-block">
          <h4><span class="bar"></span>面试可能追问</h4>
          ${bullets(p.interviewFocus, "qs")}
        </div>
      </div>
    </div>
  </div>`;
}

export function renderResult(state, openIds = null, analysis = null, ctx = null) {
  const a = analysis || state.analysis;
  const root = document.getElementById("resultRoot");
  if (!a) {
    root.innerHTML = `<div class="panel"><p>还没有分析结果。</p></div>`;
    return;
  }
  const positions = a.positions || [];
  const picked = new Set(a.applyPlan?.picks || []);
  const openSet = openIds || new Set(positions.length ? [positions[0].id] : []);
  const cities = (ctx?.cities && ctx.cities.length ? ctx.cities : state.cities) || [];
  const cityText = cities.join("、") || "未填写";
  const modelName = ctx?.model || state.settings?.model || "";
  const limitVal = ctx?.limit ?? state.company?.limit;

  const posCards = positions
    .map((p, i) => {
      const tier = TIER_META[p.tier] ? p.tier : "稳";
      const isOpen = openSet.has(p.id);
      return `<article class="pos-card ${picked.has(p.id) ? "chosen" : ""}" data-pos="${esc(p.id)}">
        <div class="pos-head" data-action="togglePos" data-id="${esc(p.id)}">
          ${ring(p.overall)}
          <div class="pos-main">
            <div class="pos-title-row">
              <span class="pos-title">${esc(p.title || `岗位 ${i + 1}`)}</span>
              <span class="badge ${TIER_META[tier].cls}">${esc(tier)}</span>
              <span class="badge diff">难度 ${esc(p.difficulty || "中")}</span>
              <span class="badge verdict">${esc(p.verdict || "")}</span>
              ${picked.has(p.id) ? `<span class="badge picked">建议投递</span>` : ""}
            </div>
            <div class="pos-sub">
              <span>匹配 ${clamp(p.score)}</span><span>质量 ${clamp(p.quality)}</span>
              <span>${esc(p.salary?.range || "薪资未知")}</span>
            </div>
          </div>
          <div class="pos-metrics">
            <div class="metric"><b style="color:${scoreColor(p.score)}">${clamp(p.score)}</b><span>匹配</span></div>
            <div class="metric"><b style="color:${scoreColor(p.quality)}">${clamp(p.quality)}</b><span>质量</span></div>
            <div class="metric"><b>${esc(p.difficulty || "中")}</b><span>竞争</span></div>
          </div>
          <svg class="caret ${isOpen ? "open" : ""}" width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M6 8l4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        ${isOpen ? posBody(p) : ""}
      </article>`;
    })
    .join("");

  const isHistory = !!ctx;
  const cmpRows = [
    ["综合分", (p) => `<b class="${p.overall === Math.max(...positions.map((x) => x.overall)) ? "best" : ""}">${clamp(p.overall)}</b>`],
    ["人岗匹配", (p) => clamp(p.score)],
    ["岗位质量", (p) => clamp(p.quality)],
    ["竞争烈度", (p) => esc(p.difficulty || "中")],
    ["档位", (p) => `<span class="badge ${TIER_META[p.tier]?.cls || "tier-wen"}">${esc(p.tier || "稳")}</span>`],
    ["年包（估算）", (p) => esc(p.salary?.range || "未知")],
    ["岗位前景", (p) => esc(p.prospect?.trend || "未知")],
    ["部门状态", (p) => esc(p.team?.atmosphere || "未知")],
    ["裁员风险", (p) => esc(p.team?.layoffRisk || "未知")],
    ["城市", (p) => esc(p.cityFit || "—")]
  ]
    .map(
      ([label, fn]) =>
        `<tr><td>${label}</td>${positions.map((p) => `<td class="num-cell">${fn(p)}</td>`).join("")}</tr>`
    )
    .join("");

  const cmpTable = `<div class="table-wrap"><table class="cmp-table">
    <thead><tr><th>维度</th>${positions.map((p) => `<th>${esc(p.title || "")}</th>`).join("")}</tr></thead>
    <tbody>${cmpRows}</tbody>
  </table></div>`;

  const plan = a.applyPlan || {};
  const portfolio = (plan.portfolio || [])
    .map(
      (x, i) => `<div class="plan-pick">
        <span class="num-badge">${i + 1}</span>
        <span class="badge ${TIER_META[x.tier]?.cls || "tier-wen"}">${esc(x.tier || "稳")}</span>
        <b>${esc(positions.find((p) => p.id === x.id)?.title || x.id)}</b>
      </div>`
    )
    .join("");
  const skipList = (plan.skip || [])
    .map((x) => `<li><b>${esc(positions.find((p) => p.id === x.id)?.title || x.id)}</b>：${esc(x.why || "")}</li>`)
    .join("");

  const cmpNotes = (a.comparison || [])
    .map((c) => `<div class="kv"><b>${esc(c.dimension || "")}</b><span>${esc(c.note || "")}</span></div>`)
    .join("");

  root.innerHTML = `
    <div class="result-head">
      <div class="result-title">
        <h1>${esc(a.company || state.company?.name || "岗位对比")} · ${positions.length} 个岗位</h1>
        <p>意向城市 ${esc(cityText)} · 投递上限 ${esc(String(plan.limit || limitVal || "—"))} 个 · ${fmtTime(a.createdAt || Date.now())} · ${esc(modelName)}</p>
      </div>
      <div class="result-actions">
        <button class="btn ghost sm" data-action="backToSetup">返回修改</button>
        <button class="btn ghost sm" data-action="copySummary">复制结论</button>
        <button class="btn ghost sm" data-action="exportMd">导出 Markdown</button>
        ${isHistory ? `<button class="btn ghost sm" data-action="closeHistoryView">回到当前分析</button>` : `<button class="btn primary sm" data-action="startAnalysis">重新分析</button>`}
      </div>
    </div>

    ${isHistory ? `<div class="history-banner"><svg viewBox="0 0 16 16" width="14" height="14" fill="none"><circle cx="8" cy="8" r="6.3" stroke="currentColor" stroke-width="1.3"/><path d="M8 4.6V8l2.3 1.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>这是历史记录（只读）。如需基于最新材料重新分析，点「回到当前分析」回到本机最新的会话。</div>` : ""}

    <div class="overview-grid">
      <div class="panel">
        <div class="panel-title">候选人画像</div>
        <p style="font-weight:600;color:#111726;margin-bottom:8px">${esc(a.candidate?.headline || "—")}</p>
        <div class="kv-list">
          ${kv("优势", (a.candidate?.strengths || []).slice(0, 3).join("；"))}
          ${kv("短板", (a.candidate?.weaknesses || []).join("；"))}
          ${kv("城市", a.candidate?.cityFit)}
        </div>
      </div>
      <div class="panel">
        <div class="panel-title">市场与薪资判断</div>
        <div class="kv-list">
          ${kv("薪资", a.market?.salaryNote)}
          ${kv("招聘态势", a.market?.hiringTrend)}
          ${kv("整体置信度", a.market?.confidence)}
        </div>
      </div>
      <div class="panel">
        <div class="panel-title">投递组合建议（上限 ${esc(String(plan.limit || limitVal || "—"))}）</div>
        <div class="plan-picks">${portfolio || `<span class="qa-empty">未给出</span>`}</div>
        <p>${esc(plan.rationale || "")}</p>
      </div>
    </div>

    <div class="section-title"><h2>岗位逐个看</h2><span>按综合分排序，点击卡片展开依据</span></div>
    <div class="rank-list">${posCards || `<div class="panel"><p>模型没有返回岗位结果，请重试。</p></div>`}</div>

    <div class="section-title"><h2>横向对比</h2><span>同方向岗位真正的差异在哪</span></div>
    ${cmpTable}
    ${cmpNotes ? `<div class="panel" style="margin-top:12px"><div class="kv-list">${cmpNotes}</div></div>` : ""}

    <div class="section-title"><h2>名额怎么用</h2><span>在 ${esc(String(plan.limit || ""))} 个名额内做取舍</span></div>
    <div class="panel">
      ${skipList ? `<h4 style="margin:0 0 8px;font-size:13px">建议放弃 / 暂不投</h4><ul class="bullet">${skipList}</ul>` : ""}
      <h4 style="margin:14px 0 8px;font-size:13px">接下来 7 天</h4>
      ${bullets(a.nextActions, "tips")}
      ${(a.openQuestions || []).length ? `<h4 style="margin:14px 0 8px;font-size:13px">还需要你补充的信息</h4>${bullets(a.openQuestions, "qs")}` : ""}
    </div>

    <div class="chat-panel">
      <div class="section-title"><h2>继续追问</h2><span>基于你的简历和上面的结论，问什么都行</span></div>
      <div class="panel">
        <div class="chat-box" id="chatBox">${renderChat(state.chat || [])}</div>
        <div class="chat-input">
          <textarea id="chatInput" rows="1" placeholder="例如：如果只能投一个，你会选哪个？/ 面这个岗位我最可能挂在哪一轮？"></textarea>
          <button class="btn primary" data-action="sendChat" id="sendChatBtn">发送</button>
        </div>
        <div class="chat-suggests">
          <button class="suggest" data-action="quickAsk" data-q="如果只能投一个，你建议投哪个？为什么？">只投一个选谁</button>
          <button class="suggest" data-action="quickAsk" data-q="按我现在的简历，这几个岗位初筛通过率分别大概多少？最容易被卡在哪一条？">初筛通过率</button>
          <button class="suggest" data-action="quickAsk" data-q="帮我把简历按最适合的那个岗位重写一版要点，保持真实经历。">按最优岗位改简历</button>
          <button class="suggest" data-action="quickAsk" data-q="这两个岗位的面试考察重点有什么不同？我该怎么分别准备？">面试准备差异</button>
        </div>
      </div>
    </div>`;
}

const mdToHtml = (text) => {
  let t = esc(text || "");
  t = t.replace(/^### (.+)$/gm, "<b>$1</b>").replace(/^## (.+)$/gm, "<b>$1</b>").replace(/^# (.+)$/gm, "<b>$1</b>");
  t = t.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  t = t.replace(/`([^`]+)`/g, '<span style="background:#f4f5f9;padding:0 4px;border-radius:4px">$1</span>');
  return t;
};

export function renderChat(chat) {
  if (!chat.length) return `<div class="qa-empty">还没有追问。可以问「只投一个选谁」「面试最可能挂在哪」。</div>`;
  return chat
    .map(
      (m) =>
        `<div class="msg ${m.role === "user" ? "user" : "assistant"}"><div class="avatar">${m.role === "user" ? "我" : "AI"}</div><div class="bubble">${mdToHtml(m.content)}</div></div>`
    )
    .join("");
}

export function appendChatMessage(msg) {
  const box = document.getElementById("chatBox");
  if (!box) return;
  box.insertAdjacentHTML("beforeend", renderChat([msg]));
  box.scrollTop = box.scrollHeight;
}

export function buildMarkdown(state, analysis = null, ctx = null) {
  const a = analysis || state.analysis;
  if (!a) return "";
  const cities = (ctx?.cities && ctx.cities.length ? ctx.cities : state.cities) || [];
  const limitVal = ctx?.limit ?? state.company?.limit;
  const modelName = ctx?.model || state.settings?.model || "";
  const L = [];
  L.push(`# ${a.company || state.company?.name || ""} · 岗位对比与投递建议`, "");
  L.push(`- 意向城市：${cities.join("、") || "未填写"}`);
  L.push(`- 投递上限：${a.applyPlan?.limit || limitVal || "—"} 个`);
  L.push(`- 生成时间：${fmtTime(a.createdAt || Date.now())}`);
  L.push(`- 使用模型：${modelName}`, "");
  if (a.candidate?.headline) {
    L.push("## 候选人画像", "", `**定位**：${a.candidate.headline}`, "");
    if (a.candidate.strengths?.length) L.push("**优势**", ...a.candidate.strengths.map((x) => `- ${x}`), "");
    if (a.candidate.weaknesses?.length) L.push("**短板**", ...a.candidate.weaknesses.map((x) => `- ${x}`), "");
    if (a.candidate.cityFit) L.push(`**城市匹配**：${a.candidate.cityFit}`, "");
  }
  if (a.market) {
    L.push("## 市场与薪资", "");
    if (a.market.salaryNote) L.push(`- 薪资：${a.market.salaryNote}`);
    if (a.market.hiringTrend) L.push(`- 招聘态势：${a.market.hiringTrend}`);
    L.push(`- 置信度：${a.market.confidence || "—"}`, "");
  }
  if (a.applyPlan) {
    L.push("## 投递组合", "");
    const name = (id) => a.positions?.find((p) => p.id === id)?.title || id;
    L.push(`**建议投递**：${(a.applyPlan.picks || []).map(name).join(" / ") || "—"}`, "");
    (a.applyPlan.portfolio || []).forEach((x) => L.push(`- [${x.tier}] ${name(x.id)}：${x.why || ""}`));
    L.push("");
    if (a.applyPlan.rationale) L.push(`> ${a.applyPlan.rationale}`, "");
    (a.applyPlan.skip || []).forEach((x) => L.push(`- 放弃 ${name(x.id)}：${x.why || ""}`));
    L.push("");
  }
  L.push("## 岗位逐个看", "");
  (a.positions || []).forEach((p) => {
    L.push(`### ${p.title}　综合 ${p.overall}｜匹配 ${p.score}｜质量 ${p.quality}｜${p.tier}｜难度${p.difficulty}`, "");
    L.push(`- 结论：${p.verdict}`);
    L.push(`- 薪资：${p.salary?.range || "未知"}（置信度 ${p.salary?.confidence || "—"}）${p.salary?.note ? `｜${p.salary.note}` : ""}`);
    L.push(`- 部门：氛围 ${p.team?.atmosphere || "未知"}；福利/强度 ${p.team?.welfare || "未知"}；裁员风险 ${p.team?.layoffRisk || "未知"}`);
    L.push(`- 前景：${p.prospect?.trend || "未知"}；成长 ${p.prospect?.growth || "未知"}；可迁移 ${p.prospect?.transfer || "未知"}`);
    L.push(`- 城市：${p.cityFit || "—"}`, "");
    if (p.matched?.length) {
      L.push("**命中**", "", "| JD 要求 | 简历证据 | 强度 |", "| --- | --- | --- |");
      p.matched.forEach((m) => L.push(`| ${m.req} | ${m.evidence} | ${m.level} |`));
      L.push("");
    }
    if (p.gaps?.length) {
      L.push("**缺口**", "");
      p.gaps.forEach((g) => L.push(`- ${g.req}：${g.gap} → 补法：${g.fix}（${g.effort}成本）`));
      L.push("");
    }
    if (p.resumeTips?.length) L.push("**简历改写**", ...p.resumeTips.map((x) => `- ${x}`), "");
    if (p.interviewFocus?.length) L.push("**面试追问**", ...p.interviewFocus.map((x) => `- ${x}`), "");
    L.push(`**判断依据**：${p.reason || ""}`, "");
  });
  if (a.comparison?.length) {
    L.push("## 横向对比", "");
    a.comparison.forEach((c) => L.push(`- **${c.dimension}**：${c.note}`));
    L.push("");
  }
  if (a.nextActions?.length) L.push("## 接下来 7 天", ...a.nextActions.map((x) => `- ${x}`), "");
  if (a.openQuestions?.length) L.push("## 待补充信息", ...a.openQuestions.map((x) => `- ${x}`), "");
  return L.join("\n");
}

export function buildPlainSummary(state, analysis = null, ctx = null) {
  const a = analysis || state.analysis;
  if (!a) return "";
  const cities = (ctx?.cities && ctx.cities.length ? ctx.cities : state.cities) || [];
  const name = (id) => a.positions?.find((p) => p.id === id)?.title || id;
  const lines = [
    `${a.company || ""}｜投递上限 ${a.applyPlan?.limit || ""} 个｜意向城市 ${cities.join("、")}`,
    `建议投递：${(a.applyPlan?.picks || []).map(name).join("、") || "—"}`,
    ...(a.positions || []).map((p) => `${p.title}：综合${p.overall}（匹配${p.score}/质量${p.quality}，${p.tier}，难度${p.difficulty}）`),
    a.applyPlan?.rationale ? `理由：${a.applyPlan.rationale}` : ""
  ];
  return lines.filter(Boolean).join("\n");
}
