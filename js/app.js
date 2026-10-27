import { CITIES, PROVIDERS, TIER_META } from "./config.js";
import { loadState, saveState, clearState, takePendingJDs, HAS_CHROME, DEFAULT_STATE, loadHistory, addHistoryRecord, updateHistoryRecord, deleteHistoryRecord, clearHistory } from "./store.js";
import { parseFile, ACCEPT, MAX_IMAGES } from "./parse.js";
import { chat, testConnection } from "./llm.js";
import { buildAnalysisMessages, buildCalibrationMessages, buildChatMessages, collectImages } from "./prompt.js";
import {
  $, $$, esc, uid, clamp, toast, copyText, downloadText, parseJsonLoose, debounce, fmtTime
} from "./util.js";
import {
  renderResume, renderCities, renderJDs, renderQA, renderMiniStats, readiness,
  renderResult, renderChat, appendChatMessage, buildMarkdown, buildPlainSummary
} from "./render.js";

window.__CITIES__ = CITIES;

const state = await loadState();
let editingJD = null;
let activeAbort = null;
let chatBusy = false;
let openPos = new Set();
let viewingRecord = null;   // 正在查看的历史记录对象（null 表示查看当前实时会话）
let historyCache = [];      // 历史记录列表缓存
let historyOpen = false;
let liveChatBackup = null;  // 进入历史查看前，暂存当前会话的追问记录

const scoreColor = (v) => (v >= 80 ? "#0f9d76" : v >= 65 ? "#4f46e5" : v >= 50 ? "#c2740a" : "#d92d20");

/* ---------------- 初始化 ---------------- */
async function init() {
  if (!state.company) state.company = structuredClone(DEFAULT_STATE.company);
  if (!state.qa) state.qa = { questions: [], answers: {}, generatedAt: 0 };
  if (!Array.isArray(state.cities)) state.cities = [];

  buildProviderSelect();
  bindFields();
  bindActions();
  bindUploads();
  bindChat();
  renderAll();
  loadPending();

  document.addEventListener("jme:saved", flashSaved);
  document.addEventListener("jme:save-failed", (e) => toast(`保存失败：${e.detail}`, "err"));

  const params = new URLSearchParams(location.search);
  if (params.get("view") === "result" && state.analysis) showResult();
  setupScrollSpy();

  historyCache = await loadHistory();
  updateHistoryBadge();
  document.addEventListener("jme:history-updated", updateHistoryBadge);
}

function renderAll() {
  renderResume(state);
  renderCities(state);
  renderJDs(state);
  renderQA(state);
  renderMiniStats(state);
  syncCompanyFields();
  syncModelFields();
  syncResumeMetaFields();
  updateReadiness();
  updateActionBar();
}

function flashSaved() {
  const el = $("#saveState");
  el.classList.add("flash");
  el.textContent = "已保存";
  clearTimeout(flashSaved._t);
  flashSaved._t = setTimeout(() => {
    el.classList.remove("flash");
    el.textContent = "已自动保存到本机";
  }, 1300);
}

/* ---------------- 模型下拉 ---------------- */
function buildProviderSelect() {
  const sel = $("#provider");
  sel.innerHTML = Object.entries(PROVIDERS)
    .map(([k, p]) => `<option value="${k}">${esc(p.label)}</option>`)
    .join("");
  sel.value = state.settings.provider || "deepseek";
}

function syncProviderUI(keepModel = false) {
  const p = PROVIDERS[state.settings.provider] || PROVIDERS.custom;
  const sel = $("#modelSelect");
  sel.innerHTML = p.models.map((m) => `<option value="${m}">${esc(m)}</option>`).join("") || `<option value="">自定义</option>`;
  if (keepModel && state.settings.model) {
    if (!p.models.includes(state.settings.model)) {
      sel.insertAdjacentHTML("beforeend", `<option value="${esc(state.settings.model)}">${esc(state.settings.model)}</option>`);
    }
    sel.value = state.settings.model;
  } else {
    state.settings.model = p.models[0] || "";
    sel.value = state.settings.model;
  }
  $("#modelCustom").value = p.models.includes(state.settings.model) ? "" : state.settings.model || "";
  $("#baseURL").value = state.settings.baseURL || p.baseURL || "";
  $("#apiKey").value = state.settings.apiKey || "";
  $("#visionModel").value = state.settings.visionModel || "";
  $("#temperature").value = String(state.settings.temperature ?? 0.3);
  $("#tempVal").textContent = Number(state.settings.temperature ?? 0.3).toFixed(2);
  $("#providerHint").innerHTML = `${esc(p.hint || "")}${p.keyURL ? ` · <a href="${p.keyURL}" target="_blank" rel="noreferrer">获取 API Key</a>` : ""}`;
  updateReadiness();
  updateActionBar();
}

function syncModelFields() {
  const p = PROVIDERS[state.settings.provider] || PROVIDERS.custom;
  if (!state.settings.baseURL) state.settings.baseURL = p.baseURL || "";
  syncProviderUI(true);
}

function syncCompanyFields() {
  const c = state.company;
  $("#companyName").value = c.name || "";
  $("#companyLimit").value = c.limit || 3;
  $("#companySite").value = c.site || "";
  $("#companyIntel").value = c.intel || "";
  $("#salaryIntel").value = c.salaryIntel || "";
  $("#companyExtra").value = c.extra || "";
  $$(".chip-btn[data-action='setLimit']").forEach((b) => b.classList.toggle("on", Number(b.dataset.val) === Number(c.limit)));
}

function syncResumeMetaFields() {
  $("#salaryExpect").value = state.salaryExpect || "";
  $("#gradInfo").value = state.gradInfo || "";
}

/* ---------------- 字段绑定 ---------------- */
function bindFields() {
  const bind = (sel, setter, opts = {}) => {
    const el = $(sel);
    if (!el) return;
    el.addEventListener("input", debounce(() => {
      setter(el.value);
      saveState(state);
      updateActionBar();
    }, opts.wait || 300));
    if (opts.change) el.addEventListener("change", () => {
      setter(el.value);
      saveState(state);
    });
  };

  bind("#companyName", (v) => { state.company.name = v.trim(); updateReadiness(); });
  bind("#companyLimit", (v) => {
    state.company.limit = Math.max(1, Math.min(20, Number(v) || 1));
    $$(".chip-btn[data-action='setLimit']").forEach((b) => b.classList.toggle("on", Number(b.dataset.val) === Number(state.company.limit)));
    updateReadiness(); updateActionBar();
  }, { change: true });
  bind("#companySite", (v) => { state.company.site = v.trim(); });
  bind("#companyIntel", (v) => { state.company.intel = v; });
  bind("#salaryIntel", (v) => { state.company.salaryIntel = v; });
  bind("#companyExtra", (v) => { state.company.extra = v; });
  bind("#salaryExpect", (v) => { state.salaryExpect = v.trim(); });

  $("#gradInfo").addEventListener("input", debounce(() => {
    state.gradInfo = $("#gradInfo").value.trim();
    saveState(state);
  }, 300));  $("#baseURL").addEventListener("input", debounce((e) => { state.settings.baseURL = e.target.value.trim(); saveState(state); }, 300));
  $("#apiKey").addEventListener("input", debounce((e) => { state.settings.apiKey = e.target.value.trim(); saveState(state); updateReadiness(); }, 300));
  $("#visionModel").addEventListener("input", debounce((e) => { state.settings.visionModel = e.target.value.trim(); saveState(state); }, 300));
  $("#modelCustom").addEventListener("input", debounce((e) => {
    const v = e.target.value.trim();
    if (v) { state.settings.model = v; saveState(state); updateActionBar(); }
  }, 300));

  $("#provider").addEventListener("change", () => {
    const key = $("#provider").value;
    state.settings.provider = key;
    state.settings.baseURL = PROVIDERS[key].baseURL || "";
    if (PROVIDERS[key].noKey) state.settings.apiKey = state.settings.apiKey || "";
    saveState(state);
    syncProviderUI(false);
    $("#testResult").textContent = "";
  });
  $("#modelSelect").addEventListener("change", () => {
    const v = $("#modelSelect").value;
    if (v) {
      state.settings.model = v;
      $("#modelCustom").value = "";
      saveState(state);
      updateActionBar();
    }
  });
  $("#temperature").addEventListener("input", (e) => {
    state.settings.temperature = Number(e.target.value);
    $("#tempVal").textContent = Number(e.target.value).toFixed(2);
    saveState(state);
  });
  $("#cityCustom").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); addCity(); }
  });

  document.addEventListener("input", (e) => {
    if (e.target.id === "resumeText") {
      state.resume.text = e.target.value;
      saveState(state);
      updateActionBar();
    }
    if (e.target.id === "chatInput") {
      e.target.style.height = "auto";
      e.target.style.height = `${Math.min(120, e.target.scrollHeight)}px`;
    }
  });
}

/* ---------------- 上传 ---------------- */
function bindUploads() {
  const drop = $("#resumeDrop");
  $("#resumeInput").addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) await handleResumeFile(f);
  });
  ["dragenter", "dragover"].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("drag"); })
  );
  ["dragleave", "drop"].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("drag"); })
  );
  drop.addEventListener("drop", async (e) => {
    const f = e.dataTransfer?.files?.[0];
    if (f) await handleResumeFile(f);
  });

  $("#jdInput").addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length) await handleJDFiles(files);
  });
}

async function handleResumeFile(file) {
  const drop = $("#resumeDrop");
  const dzText = drop.querySelector(".dz-text span");
  const old = dzText.textContent;
  drop.classList.add("busy");
  dzText.textContent = `正在解析 ${file.name}…`;
  try {
    const r = await parseFile(file, (i, total) => { dzText.textContent = `解析 PDF 第 ${i}/${total} 页…`; });
    const text = (r.text || "").trim();
    if (!text && !r.images?.length) throw new Error("没解析出内容，可能是扫描件或加密文件");
    state.resume = {
      fileName: file.name,
      kind: r.kind,
      text,
      images: (r.images || []).slice(0, MAX_IMAGES),
      scanned: !!r.scanned,
      size: file.size,
      updatedAt: Date.now()
    };
    await saveState(state);
    renderResume(state);
    toast(text ? `已解析简历（${text.replace(/\s/g, "").length} 字）` : "已读取简历图片，将由视觉模型分析", "ok");
    if (state.resume.images?.length && !currentVision()) {
      toast("当前模型不支持图片，建议在「模型」里填写视觉模型名", "warn", 4200);
    }
    updateReadiness(); updateActionBar(); renderMiniStats(state);
  } catch (e) {
    toast(String(e.message || e), "err", 4200);
  } finally {
    drop.classList.remove("busy");
    dzText.textContent = old;
  }
}

async function handleJDFiles(files) {
  for (const file of files) {
    try {
      toast(`正在解析 ${file.name}…`, "info", 1400);
      const r = await parseFile(file);
      const text = (r.text || "").trim();
      if (!text && !r.images?.length) throw new Error("没有解析出文字");
      const title = text.split("\n").map((s) => s.trim()).find((s) => s.length >= 4 && s.length <= 40) || file.name.replace(/\.[^.]+$/, "");
      state.jds.push({
        id: uid("jd"),
        title: title.slice(0, 60),
        dept: "", city: "", text,
        images: (r.images || []).slice(0, 2),
        sourceUrl: "",
        createdAt: Date.now()
      });
    } catch (e) {
      toast(`${file.name}：${e.message || e}`, "err");
    }
  }
  await saveState(state);
  renderJDs(state); renderMiniStats(state); updateReadiness(); updateActionBar();
  if (state.jds.length) toast(`已加入 ${state.jds.length} 个岗位`, "ok");
}

/* ---------------- 城市 ---------------- */
function addCity() {
  const input = $("#cityCustom");
  const v = input.value.trim();
  if (!v) return;
  if (!state.cities.includes(v)) state.cities.push(v);
  input.value = "";
  saveState(state);
  renderCities(state);
  updateReadiness(); updateActionBar(); renderMiniStats(state);
}

/* ---------------- JD ---------------- */
function togglePaste(show, jd = null) {
  const panel = $("#pastePanel");
  const willShow = show ?? panel.hidden;
  panel.hidden = !willShow;
  editingJD = jd?.id || null;
  if (willShow) {
    $("#jdTitle").value = jd?.title || "";
    $("#jdDept").value = jd?.dept || "";
    $("#jdCity").value = jd?.city || "";
    $("#jdUrl").value = jd?.sourceUrl || "";
    $("#jdText").value = jd?.text || "";
    panel.querySelector("[data-action='savePaste']").textContent = jd ? "保存修改" : "加入对比";
    setTimeout(() => (jd ? $("#jdText") : $("#jdTitle")).focus(), 60);
  }
}

function savePaste() {
  const title = $("#jdTitle").value.trim();
  const text = $("#jdText").value.trim();
  if (!text && !title) return toast("至少填写岗位名称或 JD 正文", "warn");
  if (text.replace(/\s/g, "").length < 20) return toast("JD 正文太短，至少 20 字", "warn");
  const payload = {
    title: title || text.split("\n")[0].slice(0, 40),
    dept: $("#jdDept").value.trim(),
    city: $("#jdCity").value.trim(),
    sourceUrl: $("#jdUrl").value.trim(),
    text
  };
  if (editingJD) {
    const jd = state.jds.find((x) => x.id === editingJD);
    if (jd) Object.assign(jd, payload, { updatedAt: Date.now() });
  } else {
    const old = state.jds.find((x) => x.text === text && x.title === payload.title);
    if (old) return toast("这个岗位已经在列表里了", "warn");
    state.jds.push({ id: uid("jd"), images: [], createdAt: Date.now(), ...payload });
  }
  saveState(state);
  renderJDs(state); renderMiniStats(state); updateReadiness(); updateActionBar();
  togglePaste(false);
  toast(editingJD ? "已更新" : "已加入对比", "ok");
  editingJD = null;
}

async function grabTab() {
  if (!HAS_CHROME) return toast("「抓取当前标签页」只在安装为浏览器扩展后可用", "warn");
  try {
    const res = await chrome.runtime.sendMessage({ type: "JME_EXTRACT_TAB" });
    if (!res?.ok) throw new Error(res?.error || "抓取失败");
    const { title, text, url } = res.data;
    if (!text || text.length < 40) throw new Error("这个页面没抓到有效正文，换到 JD 详情页试试");
    togglePaste(true);
    $("#jdTitle").value = title || "";
    $("#jdText").value = text;
    $("#jdUrl").value = url || "";
    detectLimitFrom(text);
    toast("已抓取页面正文，确认一下岗位名称", "ok");
  } catch (e) {
    toast(`抓取失败：${e.message || e}`, "err", 4200);
  }
}

function detectLimitFrom(text) {
  if (!text) return null;
  const CN = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5 };
  const pats = [
    /(?:最多|最多可|限|只能|仅可|仅能)[^。；\n]{0,14}?(?:投递|申请|应聘|选择)[^。；\n]{0,14}?(\d+)\s*(?:个|家|次|所)/,
    /(?:投递|申请|应聘)[^。；\n]{0,10}?(\d+)\s*(?:个)?\s*(?:岗位|职位|志愿|部门)/,
    /(\d+)\s*个?\s*志愿/,
    /(?:最多|限|只能|仅可|仅能|仅)[^。；\n]{0,12}?(?:投递|申请|应聘|选择)[^。；\n]{0,10}?([一二两三四五])\s*(?:个|家|次|所)/
  ];
  for (const p of pats) {
    const m = text.match(p);
    if (m) {
      const n = CN[m[1]] || Number(m[1]);
      if (n >= 1 && n <= 20) return { n, snippet: m[0].trim().slice(0, 60) };
    }
  }
  return null;
}

/* ---------------- 官网抓取 ---------------- */
async function fetchSite() {
  let url = $("#companySite").value.trim() || state.company.site;
  if (!url) return toast("先填写招聘官网地址", "warn");
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  const hint = $("#siteHint");
  hint.textContent = "正在抓取官网页面…";
  try {
    const res = await fetch(url, { credentials: "omit" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("script,style,noscript,svg,iframe").forEach((el) => el.remove());
    const text = (doc.body?.innerText || doc.body?.textContent || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, 8000);
    if (text.length < 60) throw new Error("页面几乎没有正文（可能是动态渲染），可以手动把规则贴进「其他补充」");
    state.company.siteText = text;
    state.company.site = url;
    const found = detectLimitFrom(text);
    if (found) {
      state.company.suggestedLimit = found.n;
      hint.innerHTML = `识别到可能的投递上限：<b>${found.n} 个</b>（依据「${esc(found.snippet)}」）<button class="btn text" data-action="useLimit" data-val="${found.n}">采用</button>`;
    } else {
      hint.innerHTML = `已抓取 ${text.length} 字官网内容，未识别到投递上限，请手动确认。内容会作为分析依据。`;
    }
    await saveState(state);
    toast("官网内容已抓取，将作为分析依据", "ok");
  } catch (e) {
    hint.textContent = "";
    toast(`抓取失败：${e.message || e}（可尝试在官网页面用「抓取当前标签页」）`, "err", 4600);
  }
}

/* ---------------- 问答 ---------------- */
async function genQuestions() {
  if (!checkResume()) return;
  if (!(state.jds || []).length) return needStep(2, "先加入至少一个岗位");
  const btn = $("#genQBtn");
  btn.disabled = true;
  btn.textContent = "生成中…";
  try {
    const { text } = await chat({
      settings: state.settings,
      messages: buildCalibrationMessages(state),
      maxTokens: 1600,
      timeoutMs: 120000
    });
    const data = parseJsonLoose(text);
    const qs = (data?.questions || []).filter((q) => q?.q).slice(0, 6);
    if (!qs.length) throw new Error("模型没有返回可用的问答题，请重试或换模型");
    state.qa.questions = qs.map((q, i) => ({
      id: q.id || `q${i + 1}`,
      q: q.q,
      type: q.type === "multi" ? "multi" : q.type === "text" ? "text" : q.options?.length ? "single" : "text",
      options: Array.isArray(q.options) ? q.options.map(String).slice(0, 8) : [],
      hint: q.hint || "",
      why: q.why || ""
    }));
    state.qa.answers = {};
    state.qa.generatedAt = Date.now();
    await saveState(state);
    renderQA(state);
    toast(`生成了 ${qs.length} 个问题，回答后分析会更准`, "ok");
  } catch (e) {
    toast(`生成失败：${e.message || e}`, "err", 4600);
  } finally {
    btn.disabled = false;
    btn.textContent = "生成问题";
  }
}

/* ---------------- 分析 ---------------- */
function currentVision() {
  return state.settings.visionModel || (PROVIDERS[state.settings.provider]?.vision ? state.settings.model : "");
}

function checkResume() {
  if (!state.resume || (!state.resume.text && !state.resume.images?.length)) {
    needStep(1, "请先上传简历");
    return false;
  }
  return true;
}

function needStep(n, msg) {
  toast(msg, "warn");
  goStep(n);
  return false;
}

function validate() {
  if (!checkResume()) return false;
  if (!state.cities?.length) return needStep(1, "请选择至少一个意向工作城市");
  if (!state.jds?.length) return needStep(2, "请至少加入一个岗位 JD");
  if (!state.company.name?.trim()) return needStep(3, "请填写公司名称");
  if (!Number(state.company.limit)) return needStep(3, "请填写投递数量上限");
  if (!state.settings.model) return needStep(4, "请选择模型");
  if (!state.settings.apiKey && state.settings.provider !== "ollama") return needStep(4, "请填写 API Key");
  return true;
}

async function startAnalysis() {
  if (!validate()) return;
  const images = collectImages(state);
  const vision = currentVision();
  if (images.length && !vision) {
    const ok = await confirmModal("当前模型不支持图片", "你上传了简历或 JD 的图片，但没配置支持视觉的模型。图片内容会被忽略，只分析文字部分。要继续吗？", "仍要继续");
    if (!ok) return needStep(4, "填写视觉模型，或换成支持图片的模型");
  }
  if (state.jds.length > 8) {
    const ok = await confirmModal("岗位较多", `当前有 ${state.jds.length} 个岗位，一次全量对比可能超长（费用与耗时都会上升）。建议一次 3–6 个。仍要继续吗？`, "继续分析");
    if (!ok) return;
  }

  const settings = { ...state.settings };
  if (images.length && vision) settings.model = vision;

  showProgress();
  activeAbort = new AbortController();
  try {
    setProgress(18, "正在整理简历、岗位与情报…");
    const messages = buildAnalysisMessages(state);
    setProgress(34, `正在调用 ${settings.model} 对比 ${state.jds.length} 个岗位…`);
    const started = Date.now();
    const { text, usage } = await chat({
      settings,
      messages,
      images: images.map((i) => ({ dataUrl: i.dataUrl })),
      maxTokens: 8000,
      signal: activeAbort.signal,
      timeoutMs: 300000
    });
    setProgress(82, "正在解析模型输出…");
    const raw = parseJsonLoose(text);
    if (!raw) {
      hideProgress();
      showRawFallback(text);
      toast("模型没有返回标准 JSON，已展示原始结论", "warn", 4000);
      return;
    }
    const analysis = normalizeAnalysis(raw);
    state.analysis = analysis;
    state.chat = [];
    viewingRecord = null;
    await saveState(state);
    const record = {
      id: uid("rec"),
      company: state.company.name || analysis.company || "未命名公司",
      createdAt: analysis.createdAt || Date.now(),
      analysis,
      chat: [],
      context: {
        cities: [...(state.cities || [])],
        limit: Number(state.company.limit) || 0,
        model: state.settings.model || "",
        resumeName: state.resume?.fileName || (state.resume?.images?.length ? "图片简历" : ""),
        jds: (state.jds || []).map((j) => ({ title: j.title, dept: j.dept, city: j.city }))
      }
    };
    historyCache = await addHistoryRecord(record);
    updateHistoryBadge();
    hideProgress();
    openPos = new Set(analysis.positions.slice(0, 1).map((p) => p.id));
    showResult();
    const secs = ((Date.now() - started) / 1000).toFixed(0);
    toast(`分析完成，用时 ${secs}s${usage?.total_tokens ? ` · ${usage.total_tokens} tokens` : ""} · 已存入历史`, "ok", 3600);
  } catch (e) {
    hideProgress();
    if (/aborted|取消/i.test(e.message || "")) toast("已取消分析");
    else toast(`分析失败：${e.message || e}`, "err", 6000);
  } finally {
    activeAbort = null;
  }
}

function normalizeAnalysis(raw) {
  const a = { ...raw };
  a.createdAt = Date.now();
  a.company = a.company || state.company.name;
  if (!Array.isArray(a.positions) || !a.positions.length) throw new Error("模型没有返回任何岗位结论，请重试");
  const byId = new Map(state.jds.map((j) => [j.id, j]));
  const byTitle = new Map(state.jds.map((j) => [(j.title || "").replace(/\s/g, ""), j]));

  a.positions = a.positions.map((p, i) => {
    let jd = byId.get(p.id);
    if (!jd && p.title) jd = byTitle.get(String(p.title).replace(/\s/g, ""));
    if (!jd) jd = state.jds[i];
    const score = clamp(p.score ?? p.match?.score ?? p.overall);
    const quality = clamp(p.quality ?? 60);
    const overall = clamp(p.overall || Math.round(score * 0.65 + quality * 0.35));
    return {
      ...p,
      id: jd?.id || p.id || uid("pos"),
      title: p.title || jd?.title || `岗位 ${i + 1}`,
      score,
      quality,
      overall,
      difficulty: ["高", "中", "低"].includes(p.difficulty) ? p.difficulty : "中",
      tier: TIER_META[p.tier] ? p.tier : "稳",
      verdict: p.verdict || "可尝试",
      match: { skill: clamp(p.match?.skill), experience: clamp(p.match?.experience), project: clamp(p.match?.project), education: clamp(p.match?.education) },
      qualityDetail: {
        prospect: clamp(p.qualityDetail?.prospect),
        team: clamp(p.qualityDetail?.team),
        salary: clamp(p.qualityDetail?.salary),
        city: clamp(p.qualityDetail?.city)
      },
      salary: p.salary || {},
      team: p.team || {},
      prospect: p.prospect || {},
      matched: Array.isArray(p.matched) ? p.matched : [],
      gaps: Array.isArray(p.gaps) ? p.gaps : [],
      resumeTips: Array.isArray(p.resumeTips) ? p.resumeTips : [],
      interviewFocus: Array.isArray(p.interviewFocus) ? p.interviewFocus : [],
      reason: p.reason || ""
    };
  }).sort((x, y) => y.overall - x.overall);

  const plan = a.applyPlan || {};
  plan.limit = Number(plan.limit) || Number(state.company.limit) || 1;
  plan.picks = Array.isArray(plan.picks) ? plan.picks : [];
  plan.portfolio = Array.isArray(plan.portfolio) ? plan.portfolio : [];
  plan.skip = Array.isArray(plan.skip) ? plan.skip : [];
  a.applyPlan = plan;
  a.comparison = Array.isArray(a.comparison) ? a.comparison : [];
  a.nextActions = Array.isArray(a.nextActions) ? a.nextActions : [];
  a.openQuestions = Array.isArray(a.openQuestions) ? a.openQuestions : [];
  a.model = state.settings.model;
  return a;
}

function showRawFallback(text) {
  const root = $("#resultRoot");
  $("#viewSetup").hidden = true;
  $("#viewResult").hidden = false;
  $("#actionBar").style.display = "none";
  root.innerHTML = `<div class="result-head"><div class="result-title"><h1>模型输出（非结构化）</h1><p>没能解析成标准结果，下面是模型原文，可复制后自行整理。</p></div>
    <div class="result-actions"><button class="btn ghost sm" data-action="backToSetup">返回修改</button><button class="btn ghost sm" data-action="copyRaw">复制原文</button></div></div>
    <div class="panel"><div style="white-space:pre-wrap;font-size:12.8px;line-height:1.75">${esc(text)}</div></div>`;
  window.__rawText = text;
}

/* ---------------- 结果视图 ---------------- */
function showResult() {
  const a = viewingRecord ? viewingRecord.analysis : state.analysis;
  const ctx = viewingRecord ? viewingRecord.context : null;
  if (!a) return;
  if (!openPos.size && a.positions?.length) openPos = new Set([a.positions[0].id]);
  $("#viewSetup").hidden = true;
  $("#viewResult").hidden = false;
  $("#actionBar").style.display = "none";
  renderResult(state, openPos, a, ctx);
  window.scrollTo({ top: 0, behavior: "instant" });
  const box = $("#chatBox");
  if (box) box.scrollTop = box.scrollHeight;
}

function backToSetup() {
  if (viewingRecord) {
    state.chat = liveChatBackup || [];
    liveChatBackup = null;
    viewingRecord = null;
  }
  $("#viewResult").hidden = true;
  $("#viewSetup").hidden = false;
  $("#actionBar").style.display = "";
  renderMiniStats(state);
  updateActionBar();
  window.scrollTo({ top: 0, behavior: "instant" });
}

/* ---------------- 追问 ---------------- */
function bindChat() {
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && e.target.id === "chatInput") {
      e.preventDefault();
      sendChat();
    }
  });
}

async function sendChat(preset) {
  const input = $("#chatInput");
  const q = (preset ?? input?.value ?? "").trim();
  if (!q || chatBusy) return;
  if (!state.analysis) return toast("先完成一次分析", "warn");
  chatBusy = true;
  if (input) { input.value = ""; input.style.height = "auto"; }
  state.chat.push({ role: "user", content: q, ts: Date.now() });
  appendChatMessage({ role: "user", content: q });
  const btn = $("#sendChatBtn");
  if (btn) btn.disabled = true;

  const holder = document.createElement("div");
  holder.className = "msg assistant";
  holder.innerHTML = `<div class="avatar">AI</div><div class="bubble" style="color:#949bad">思考中…</div>`;
  $("#chatBox")?.appendChild(holder);
  $("#chatBox").scrollTop = $("#chatBox").scrollHeight;

  try {
    const history = state.chat.slice(0, -1).map((m) => ({ role: m.role, content: m.content }));
    const vision = currentVision();
    const useImg = !state.resume?.text && (state.resume?.images || []).length && vision;
    const settings = useImg ? { ...state.settings, model: vision } : state.settings;
    const { text } = await chat({
      settings,
      messages: buildChatMessages(state, q, history),
      images: useImg ? state.resume.images.slice(0, 2).map((i) => ({ dataUrl: i.dataUrl })) : [],
      maxTokens: 2200,
      timeoutMs: 180000
    });
    holder.remove();
    state.chat.push({ role: "assistant", content: text.trim(), ts: Date.now() });
    await saveState(state);
    if (viewingRecord) await updateHistoryRecord(viewingRecord.id, { chat: state.chat });
    appendChatMessage({ role: "assistant", content: text.trim() });
  } catch (e) {
    holder.remove();
    appendChatMessage({ role: "assistant", content: `请求失败：${e.message || e}` });
    state.chat.push({ role: "assistant", content: `请求失败：${e.message || e}`, ts: Date.now() });
    if (viewingRecord) await updateHistoryRecord(viewingRecord.id, { chat: state.chat });
  } finally {
    chatBusy = false;
    if (btn) btn.disabled = false;
  }
}

/* ---------------- 进度 ---------------- */
let progTimer = null;
function showProgress() {
  const ov = $("#progressOverlay");
  ov.hidden = false;
  $("#progressTitle").textContent = "正在分析…";
  $("#progressDesc").textContent = "模型正在阅读简历与岗位 JD";
  $("#progressMeta").textContent = "";
  $("#progressBar").style.width = "8%";
  $("#startBtn").disabled = true;
  const t0 = Date.now();
  let v = 8;
  const msgs = [
    [20, "正在提取简历要点与硬门槛…"],
    [38, "正在逐个拆解岗位要求…"],
    [55, "正在比对证据链，评估匹配度…"],
    [70, "正在估算薪资区间与部门风险…"],
    [86, "正在做投递组合优化…"]
  ];
  clearInterval(progTimer);
  progTimer = setInterval(() => {
    v = Math.min(93, v + Math.random() * 3.2);
    $("#progressBar").style.width = `${v}%`;
    const hit = msgs.filter((m) => v >= m[0]).pop();
    if (hit) $("#progressDesc").textContent = hit[1];
    $("#progressMeta").textContent = `已用时 ${Math.round((Date.now() - t0) / 1000)}s · 长文本通常需要 1–3 分钟`;
  }, 700);
}
function setProgress(v, desc) {
  $("#progressBar").style.width = `${v}%`;
  if (desc) $("#progressDesc").textContent = desc;
}
function hideProgress() {
  clearInterval(progTimer);
  $("#progressOverlay").hidden = true;
  $("#startBtn").disabled = false;
  $("#progressBar").style.width = "100%";
}

/* ---------------- 完成度 ---------------- */
function updateReadiness() {
  const { score, checks } = readiness(state);
  const badge = $("#readyBadge");
  badge.textContent = `准备度 ${score}%`;
  badge.classList.toggle("good", score >= 85);
  $$("#steps .step").forEach((el) => {
    const n = Number(el.dataset.step);
    let done = false;
    if (n === 1) done = !!state.resume && state.cities.length > 0;
    if (n === 2) done = state.jds.length >= 2;
    if (n === 3) done = !!state.company.name && Number(state.company.limit) > 0;
    if (n === 4) done = !!state.settings.model && (!!state.settings.apiKey || state.settings.provider === "ollama");
    if (n === 5) done = (state.qa?.questions || []).length > 0;
    el.classList.toggle("done", done);
  });
}

function updateActionBar() {
  const status = $("#actionStatus");
  if (!status) return;
  const parts = [
    [`简历${state.resume ? " ✓" : ""}`, !!state.resume],
    [`岗位 ${state.jds?.length || 0}`, (state.jds?.length || 0) >= 2],
    [`城市 ${state.cities?.length || 0}`, (state.cities?.length || 0) > 0],
    [`上限 ${state.company?.limit || "—"}`, !!Number(state.company?.limit)],
    [state.settings?.model || "未选模型", !!state.settings?.model]
  ];
  status.innerHTML = parts
    .map(([t, ok]) => `<span class="${ok ? "ok" : "miss"}">${esc(t)}</span>`)
    .join(`<span class="sep">·</span>`);
  const exist = $("#viewLastBtn");
  if (state.analysis && !exist) {
    status.insertAdjacentHTML("afterbegin", `<button class="btn ghost sm" data-action="viewLast" id="viewLastBtn">查看上次结果</button><span class="sep">·</span>`);
  }
}

/* ---------------- 事件 ---------------- */
function bindActions() {
  document.addEventListener("click", async (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const action = el.dataset.action;
    const a = ACTIONS[action];
    if (!a) return;
    if (el.tagName === "A") e.preventDefault();
    try {
      await a(el, e);
    } catch (err) {
      console.error(err);
      toast(String(err.message || err), "err");
    }
  });
}

const ACTIONS = {
  pickResume: () => $("#resumeInput").click(),
  delResume: async () => {
    if (!(await confirmModal("删除简历？", "简历内容会从本机清除，之后需要重新上传。", "删除"))) return;
    state.resume = null;
    await saveState(state);
    renderResume(state); renderMiniStats(state); updateReadiness(); updateActionBar();
  },
  delResumeImage: async (el) => {
    const idx = Number(el.dataset.idx);
    state.resume.images.splice(idx, 1);
    await saveState(state);
    renderResume(state);
  },
  addCity: () => addCity(),
  toggleCity: (el) => {
    const c = el.dataset.city;
    const i = state.cities.indexOf(c);
    if (i >= 0) state.cities.splice(i, 1);
    else state.cities.push(c);
    saveState(state); renderCities(state); updateReadiness(); updateActionBar(); renderMiniStats(state);
  },
  togglePaste: () => togglePaste(),
  savePaste: () => savePaste(),
  pickJDFiles: () => $("#jdInput").click(),
  grabTab: () => grabTab(),
  toggleJDText: (el) => {
    const t = el.closest(".jd-card").querySelector(".jd-text");
    t.classList.toggle("open");
  },
  editJD: (el) => {
    const id = el.closest(".jd-card").dataset.jd;
    const jd = state.jds.find((x) => x.id === id);
    if (jd) togglePaste(true, jd);
  },
  delJD: async (el) => {
    const id = el.closest(".jd-card").dataset.jd;
    state.jds = state.jds.filter((x) => x.id !== id);
    await saveState(state);
    renderJDs(state); renderMiniStats(state); updateReadiness(); updateActionBar();
  },
  setLimit: (el) => {
    state.company.limit = Number(el.dataset.val);
    $("#companyLimit").value = state.company.limit;
    $$(".chip-btn[data-action='setLimit']").forEach((b) => b.classList.toggle("on", b === el));
    saveState(state); updateReadiness(); updateActionBar();
  },
  useLimit: (el) => {
    state.company.limit = Number(el.dataset.val);
    $("#companyLimit").value = state.company.limit;
    saveState(state); updateReadiness(); updateActionBar();
    toast(`已采用投递上限 ${el.dataset.val}`, "ok");
  },
  fetchSite: () => fetchSite(),
  toggleKey: (el) => {
    const input = $("#apiKey");
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    el.textContent = show ? "隐藏" : "显示";
  },
  testModel: async (el) => {
    const out = $("#testResult");
    el.disabled = true;
    out.className = "test-result";
    out.textContent = "测试中…";
    try {
      state.settings.baseURL = $("#baseURL").value.trim() || state.settings.baseURL;
      state.settings.apiKey = $("#apiKey").value.trim() || state.settings.apiKey;
      state.settings.model = $("#modelCustom").value.trim() || $("#modelSelect").value || state.settings.model;
      await saveState(state);
      const r = await testConnection(state.settings);
      out.className = "test-result ok";
      out.textContent = `连接成功 · ${r.ms}ms · 返回「${r.text}」`;
      toast("模型连接正常", "ok");
    } catch (e) {
      out.className = "test-result err";
      out.textContent = String(e.message || e);
    } finally {
      el.disabled = false;
    }
  },
  genQuestions: () => genQuestions(),
  answerQA: (el) => {
    const { qid, opt, multi } = el.dataset;
    if (multi === "true") {
      const arr = Array.isArray(state.qa.answers[qid]) ? state.qa.answers[qid] : [];
      const i = arr.indexOf(opt);
      if (i >= 0) arr.splice(i, 1); else arr.push(opt);
      state.qa.answers[qid] = arr;
    } else {
      if (state.qa.answers[qid] === opt) delete state.qa.answers[qid];
      else state.qa.answers[qid] = opt;
    }
    saveState(state);
    renderQA(state);
  },
  startAnalysis: () => startAnalysis(),
  cancelAnalysis: () => {
    activeAbort?.abort();
    hideProgress();
    toast("已取消");
  },
  backToSetup: () => backToSetup(),
  viewLast: () => showResult(),
  exportMd: () => {
    const a = viewingRecord ? viewingRecord.analysis : state.analysis;
    const ctx = viewingRecord ? viewingRecord.context : null;
    const md = buildMarkdown(state, a, ctx);
    if (!md) return toast("没有可导出的结果", "warn");
    const name = (viewingRecord ? viewingRecord.company : state.company.name) || "岗位";
    downloadText(`${name}-对比分析.md`, md);
    toast("已导出 Markdown", "ok");
  },
  copySummary: async () => {
    const a = viewingRecord ? viewingRecord.analysis : state.analysis;
    const ctx = viewingRecord ? viewingRecord.context : null;
    const t = buildPlainSummary(state, a, ctx);
    if (!t) return toast("没有可复制的内容", "warn");
    await copyText(t);
    toast("结论已复制", "ok");
  },
  copyRaw: async () => {
    await copyText(window.__rawText || "");
    toast("原文已复制", "ok");
  },
  togglePos: (el) => {
    const id = el.dataset.id;
    if (openPos.has(id)) openPos.delete(id);
    else openPos.add(id);
    renderResult(state, openPos);
  },
  sendChat: () => sendChat(),
  quickAsk: (el) => sendChat(el.dataset.q),
  showHelp: () => showHelp(),
  openModelSettings: () => goStep(4),
  gotoStep: (el) => goStep(Number(el.dataset.step)),
  openHistory: () => openHistory(),
  closeHistory: () => closeHistory(),
  toggleHistGroup: (el) => {
    const g = el.closest(".hist-group");
    if (g) g.classList.toggle("open");
  },
  viewRecord: (el) => viewRecord(el.dataset.id),
  delRecord: (el) => deleteRecord(el.dataset.id),
  clearHistory: () => clearAllHistory(),
  closeHistoryView: () => closeHistoryView(),
  resetAll: async () => {
    if (!(await confirmModal("清空所有数据？", "简历、岗位、情报、分析与对话都会从本机删除，且无法恢复。", "全部清空"))) return;
    await clearState();
    location.reload();
  }
};

document.addEventListener("input", (e) => {
  if (e.target.matches("[data-action='qaText']")) {
    const qid = e.target.dataset.qid;
    const v = e.target.value;
    if (v) state.qa.answers[qid] = v;
    else delete state.qa.answers[qid];
    saveState(state);
  }
});

/* ---------------- 导航 ---------------- */
function goStep(n) {
  backToSetupIfNeeded();
  const card = $(`#step${n}`);
  if (!card) return;
  card.scrollIntoView({ behavior: "smooth", block: "start" });
  $$(".step-card").forEach((c) => c.classList.remove("focus"));
  card.classList.add("focus");
  setTimeout(() => card.classList.remove("focus"), 2200);
  const first = card.querySelector("input:not([type=hidden]), textarea, select");
  setTimeout(() => first?.focus({ preventScroll: true }), 520);
}

function backToSetupIfNeeded() {
  if (!$("#viewResult").hidden) backToSetup();
}

function setupScrollSpy() {
  const obs = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        const n = en.target.dataset.card;
        $$("#steps .step").forEach((s) => s.classList.toggle("active", s.dataset.step === n));
      });
    },
    { rootMargin: "-72px 0px -60% 0px", threshold: 0.01 }
  );
  $$(".step-card").forEach((c) => obs.observe(c));
}

/* ---------------- 弹窗 ---------------- */
function confirmModal(title, desc, okText = "确定") {
  return new Promise((resolve) => {
    const root = $("#modalRoot");
    root.innerHTML = `<div class="modal-mask"><div class="modal">
      <h3>${esc(title)}</h3><p>${esc(desc)}</p>
      <div class="row-end"><button class="btn ghost" data-cancel>取消</button><button class="btn primary" data-ok>${esc(okText)}</button></div>
    </div></div>`;
    const close = (v) => { root.innerHTML = ""; resolve(v); };
    root.querySelector("[data-ok]").onclick = () => close(true);
    root.querySelector("[data-cancel]").onclick = () => close(false);
    root.querySelector(".modal-mask").addEventListener("click", (e) => { if (e.target.classList.contains("modal-mask")) close(false); });
  });
}

function showHelp() {
  $("#modalRoot").innerHTML = `<div class="modal-mask"><div class="modal">
    <h3>怎么用</h3>
    <ol>
      <li><b>上传简历</b>：支持 PDF / Word(.docx) / Markdown / TXT / 图片。PDF 与 Word 会在本机解析成文字，图片交给视觉模型。</li>
      <li><b>选意向城市</b>：决定岗位分布与薪资估算口径，必填。</li>
      <li><b>录入岗位</b>：粘贴 JD 文字、上传 JD 文件，或在官网 JD 页面点「抓取当前标签页」。</li>
      <li><b>填投递规则与情报</b>：投递上限、部门氛围、福利、裁员传闻、薪资截图内容——这些是模型判断"值不值得投"的关键。</li>
      <li><b>选模型</b>：填自己的 API Key，可先「测试连接」。</li>
      <li><b>校准问答</b>：让模型问你几个关键问题，答完再分析，排序会明显更准。</li>
      <li><b>开始分析</b>：结果按综合分排序，含匹配证据、缺口补法、简历改写、面试追问；可继续追问或导出 Markdown。</li>
    </ol>
    <h4>分数怎么算</h4>
    <ul>
      <li><b>匹配分</b> = 技能 35% + 经历 30% + 项目 20% + 学历门槛 15%</li>
      <li><b>质量分</b> = 前景 40% + 部门状态 30% + 薪资 20% + 城市 10%</li>
      <li><b>综合分</b> = 匹配 65% + 质量 35%（硬门槛不满足时封顶 55）</li>
      <li><b>冲/稳/保</b> 由综合分与竞争烈度共同决定</li>
    </ul>
    <h4>关于数据</h4>
    <p>简历、岗位、Key 都只存在浏览器本机（chrome.storage.local）。点"开始分析"时，材料会发送到你选择的模型服务商，请自行确认其数据政策。模型没有依据的信息会标"未知/估算"，薪资只给区间——不要把它当官方数据。</p>
    <h4>历史记录</h4>
    <p>每完成一次分析，结果会自动按公司归类存进「历史」（顶栏按钮）。刷新、切换公司或关掉标签页都不会丢；历史里可以按公司展开、查看具体岗位与分数，也能继续追问或导出。历史仅存本机，可单条删除或一键清空。</p>
    <h4>常见问题</h4>
    <ul>
      <li>接口报 401/403：Key 错了或额度用尽。</li>
      <li>接口报 404：BaseURL 或模型名不对（注意有些服务要带 <code>/v1</code>）。</li>
      <li>请求失败 / Failed to fetch：地址不可达、需要代理，或该服务不允许浏览器直连。</li>
      <li>中文 PDF 解析乱码：换成导出为 PDF 的简历，或直接用图片 + 视觉模型。</li>
    </ul>
    <div class="row-end"><button class="btn primary" data-close>知道了</button></div>
  </div></div>`;
  $("#modalRoot").querySelector("[data-close]").onclick = () => ($("#modalRoot").innerHTML = "");
  $("#modalRoot").querySelector(".modal-mask").addEventListener("click", (e) => {
    if (e.target.classList.contains("modal-mask")) $("#modalRoot").innerHTML = "";
  });
}

/* ---------------- 历史记录 ---------------- */
function updateHistoryBadge() {
  const b = $("#historyBadge");
  if (!b) return;
  const n = historyCache.length;
  b.textContent = n ? String(n) : "";
  b.hidden = n === 0;
}

function openHistory() {
  historyOpen = true;
  renderHistory();
  const d = $("#historyDrawer");
  d.hidden = false;
  requestAnimationFrame(() => d.classList.add("open"));
}

function closeHistory() {
  historyOpen = false;
  const d = $("#historyDrawer");
  d.classList.remove("open");
  setTimeout(() => { if (!historyOpen) d.hidden = true; }, 220);
}

function groupByCompany(list) {
  const map = new Map();
  for (const r of list) {
    const key = (r.company || "未命名公司").trim() || "未命名公司";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }
  return [...map.entries()];
}

function histRow(r) {
  const a = r.analysis || {};
  const positions = a.positions || [];
  const top = positions.length ? Math.max(...positions.map((p) => clamp(p.overall))) : 0;
  const jobInfo = positions
    .map((p) => `${esc(p.title)} <b style="color:${scoreColor(p.overall)}">${clamp(p.overall)}</b>`)
    .join("、");
  const jobCount = positions.length ? `${positions.length} 个岗位` : "（无岗位）";
  return `<div class="hist-item" data-record="${r.id}">
    <div class="hist-item-main" data-action="viewRecord" data-id="${r.id}">
      <div class="hist-item-top">
        <span class="hist-item-time">${fmtTime(r.createdAt)}</span>
        <span class="hist-item-meta">${jobCount} · 最高 ${top} 分 · ${esc(r.context?.model || "")}</span>
      </div>
      <div class="hist-item-jobs">${jobInfo || "（无岗位）"}</div>
    </div>
    <button class="icon-btn danger" data-action="delRecord" data-id="${r.id}" title="删除这条">×</button>
  </div>`;
}

function renderHistory() {
  const root = $("#historyList");
  if (!root) return;
  const groups = groupByCompany(historyCache);
  $("#historyCount").textContent = String(historyCache.length);
  if (!groups.length) {
    root.innerHTML = `<div class="hist-empty">还没有历史记录。每完成一次分析，结果会自动按公司归类保存在这里，刷新或切换公司都不会丢。</div>`;
    return;
  }
  root.innerHTML = groups
    .map(([company, recs]) => {
      const open = recs.some((r) => viewingRecord && r.id === viewingRecord.id);
      return `<div class="hist-group ${open ? "open" : ""}">
        <div class="hist-group-head" data-action="toggleHistGroup" data-company="${esc(company)}">
          <svg class="caret" width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M6 8l4 4 4-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <b>${esc(company)}</b>
          <span class="hist-group-count">${recs.length} 次</span>
        </div>
        <div class="hist-group-body">${recs.map(histRow).join("")}</div>
      </div>`;
    })
    .join("");
}

function viewRecord(id) {
  const rec = historyCache.find((r) => r.id === id);
  if (!rec) return toast("记录不存在", "warn");
  viewingRecord = rec;
  liveChatBackup = state.chat;
  state.chat = rec.chat || [];
  openPos = new Set((rec.analysis.positions || []).slice(0, 1).map((p) => p.id));
  closeHistory();
  showResult();
  toast(`正在查看「${rec.company}」的历史分析`, "info", 2000);
}

function closeHistoryView() {
  if (!viewingRecord) return;
  viewingRecord = null;
  state.chat = liveChatBackup || [];
  liveChatBackup = null;
  if (state.analysis) showResult();
  else backToSetup();
}

async function deleteRecord(id) {
  if (!(await confirmModal("删除这条历史？", "该次分析结果会从本机移除，无法恢复。", "删除"))) return;
  const wasViewing = viewingRecord && viewingRecord.id === id;
  historyCache = await deleteHistoryRecord(id);
  updateHistoryBadge();
  if (historyOpen) renderHistory();
  if (wasViewing) {
    viewingRecord = null;
    liveChatBackup = null;
    state.chat = [];
    $("#viewResult").hidden = true;
    $("#viewSetup").hidden = false;
    $("#actionBar").style.display = "";
    renderMiniStats(state);
    updateActionBar();
  }
  toast("已删除", "ok");
}

async function clearAllHistory() {
  if (!(await confirmModal("清空全部历史？", "所有历史分析记录都会从本机删除，无法恢复。", "全部清空"))) return;
  historyCache = await clearHistory();
  updateHistoryBadge();
  if (historyOpen) renderHistory();
  if (viewingRecord) {
    viewingRecord = null;
    liveChatBackup = null;
    state.chat = [];
    $("#viewResult").hidden = true;
    $("#viewSetup").hidden = false;
    $("#actionBar").style.display = "";
  }
  toast("历史已清空", "ok");
}

/* ---------------- 右键菜单来的 JD ---------------- */
async function loadPending() {
  const list = await takePendingJDs();
  if (!list?.length) return;
  list.forEach((p) => {
    state.jds.push({
      id: uid("jd"),
      title: p.title || "来自网页的片段",
      dept: "", city: "",
      text: p.text,
      images: [],
      sourceUrl: p.sourceUrl || "",
      createdAt: Date.now()
    });
  });
  await saveState(state);
  renderJDs(state); renderMiniStats(state); updateReadiness(); updateActionBar();
  toast(`已加入 ${list.length} 段网页内容`, "ok");
}

init();
