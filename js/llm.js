import { PROVIDERS } from "./config.js";

const trimSlash = (s = "") => s.replace(/\/+$/, "");
const stripEndpoint = (s = "") => trimSlash(s).replace(/\/chat\/completions$/, "").replace(/\/messages$/, "");

function providerOf(settings) {
  return PROVIDERS[settings.provider] || PROVIDERS.custom;
}

function dataUrlPart(dataUrl) {
  const m = /^data:([^;,]+);base64,(.*)$/.exec(dataUrl || "");
  if (!m) return null;
  return { mime: m[1], b64: m[2] };
}

function httpError(status, body) {
  let msg = "";
  try {
    const j = JSON.parse(body);
    msg = j?.error?.message || j?.message || j?.msg || JSON.stringify(j).slice(0, 300);
  } catch {
    msg = String(body || "").slice(0, 300);
  }
  const hint =
    status === 401 || status === 403
      ? "（API Key 无效、无权限或额度用尽）"
      : status === 404
        ? "（接口地址或模型名不对，检查 BaseURL 与模型 ID）"
        : status === 429
          ? "（请求过于频繁或超出配额）"
          : "";
  return new Error(`模型接口返回 ${status} ${hint} ${msg}`.trim());
}

/**
 * 调用大模型
 * @param {object} opts
 * @param {object} opts.settings {provider, baseURL, model, apiKey, temperature}
 * @param {Array<{role:string, content:string}>} opts.messages
 * @param {Array<{dataUrl:string}>} [opts.images] 附加到最后一条 user 消息的图片
 * @param {number} [opts.maxTokens]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{text:string, usage?:object}>}
 */
export async function chat({ settings, messages, images = [], maxTokens = 4096, signal, timeoutMs = 240000 }) {
  const p = providerOf(settings);
  const protocol = p.protocol;
  const baseURL = stripEndpoint(settings.baseURL || p.baseURL);
  const model = settings.model || p.models?.[0];
  const temperature = Number.isFinite(settings.temperature) ? settings.temperature : 0.3;

  if (!model) throw new Error("请先选择或填写模型");
  if (!baseURL) throw new Error("请先填写接口地址（BaseURL）");
  if (!settings.apiKey && !p.noKey) throw new Error("请先填写 API Key");

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);

  const imgs = images.map(dataUrlPart).filter(Boolean);
  let url = "";
  let headers = { "Content-Type": "application/json" };
  let body = {};

  if (protocol === "anthropic") {
    url = `${baseURL}/messages`;
    headers = {
      ...headers,
      "x-api-key": settings.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    };
    const msgs = messages.filter((m) => m.role !== "system").map((m, i, arr) => {
      const isLast = i === arr.length - 1;
      const parts = [];
      if (isLast && m.role === "user" && imgs.length) {
        for (const im of imgs) parts.push({ type: "image", source: { type: "base64", media_type: im.mime, data: im.b64 } });
      }
      parts.push({ type: "text", text: m.content });
      return { role: m.role === "assistant" ? "assistant" : "user", content: parts };
    });
    body = {
      model,
      max_tokens: maxTokens,
      temperature,
      system: messages.find((m) => m.role === "system")?.content || undefined,
      messages: msgs
    };
  } else if (protocol === "gemini") {
    url = `${baseURL}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(settings.apiKey)}`;
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m, i, arr) => {
        const isLast = i === arr.length - 1;
        const parts = [{ text: m.content }];
        if (isLast && m.role === "user" && imgs.length) {
          for (const im of imgs) parts.push({ inline_data: { mime_type: im.mime, data: im.b64 } });
        }
        return { role: m.role === "assistant" ? "model" : "user", parts };
      });
    body = {
      systemInstruction: messages.find((m) => m.role === "system")
        ? { parts: [{ text: messages.find((m) => m.role === "system").content }] }
        : undefined,
      contents,
      generationConfig: { temperature, maxOutputTokens: maxTokens }
    };
  } else {
    url = `${baseURL}/chat/completions`;
    headers = { ...headers, Authorization: `Bearer ${settings.apiKey || "ollama"}` };
    const msgs = messages.map((m, i, arr) => {
      const isLast = i === arr.length - 1;
      if (isLast && m.role === "user" && imgs.length) {
        return {
          role: "user",
          content: [
            { type: "text", text: m.content },
            ...imgs.map((im) => ({ type: "image_url", image_url: { url: `data:${im.mime};base64,${im.b64}` } }))
          ]
        };
      }
      return { role: m.role, content: m.content };
    });
    body = { model, messages: msgs, temperature, max_tokens: maxTokens, stream: false };
  }

  try {
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: controller.signal });
    const raw = await res.text();
    if (!res.ok) throw httpError(res.status, raw);
    const data = JSON.parse(raw);

    let text = "";
    if (protocol === "anthropic") {
      text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    } else if (protocol === "gemini") {
      text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
      if (!text && data.candidates?.[0]?.finishReason === "SAFETY") throw new Error("模型因安全策略拒绝回答");
    } else {
      text = data.choices?.[0]?.message?.content ?? "";
      if (Array.isArray(text)) text = text.map((x) => x.text || "").join("");
    }
    if (!text.trim()) throw new Error("模型返回为空，可能是内容被过滤或 max_tokens 过小");
    return { text, usage: data.usage || data.usageMetadata || null };
  } catch (e) {
    if (e?.name === "AbortError") {
      if (!timedOut) throw new Error("请求已取消");
      const secs = Math.round(timeoutMs / 1000);
      throw new Error(`连接超时：${secs} 秒内没有收到任何响应（${url}）`);
    }
    if (e instanceof TypeError && /Failed to fetch|NetworkError|Load failed/i.test(e.message)) {
      throw new Error(`无法建立连接（${url}）：域名不可达、被拦截，或浏览器 CORS 限制`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/** 探测域名是否可达：只关心"能不能连上"，不关心返回什么状态码 */
async function probeReachable(baseURL) {
  const c = new AbortController();
  const timer = setTimeout(() => c.abort(), 6000);
  try {
    const res = await fetch(baseURL, { method: "GET", signal: c.signal, cache: "no-store" });
    return { ok: true, status: res.status };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

export async function testConnection(settings) {
  const t0 = Date.now();
  const p = PROVIDERS[settings.provider] || PROVIDERS.custom;
  const baseURL = stripEndpoint(settings.baseURL || p.baseURL);
  const inExt = typeof chrome !== "undefined" && !!chrome.runtime?.id;
  try {
    const { text } = await chat({
      settings,
      messages: [
        { role: "system", content: "你是连通性测试助手，只回答 OK。" },
        { role: "user", content: "请只回答：OK" }
      ],
      maxTokens: 16,
      timeoutMs: 30000
    });
    return { ok: true, ms: Date.now() - t0, text: text.trim().slice(0, 40) };
  } catch (e) {
    // 失败时再做一次连通性探测，把「网络不通」和「Key/余额问题」分开
    const msg = String(e?.message || e);
    if (!/连接超时|无法建立连接/.test(msg)) throw e;

    const lines = [msg];
    const r = await probeReachable(baseURL);
    if (r.ok) {
      lines.push(`诊断：${baseURL} 本身可访问（HTTP ${r.status}），网络没断，问题在接口路径、模型名或请求被拦截。`);
    } else {
      lines.push(`诊断：${baseURL} 连不上，确认是网络层问题，与 API Key、余额都没有关系。`);
      if (/openai\.com|anthropic\.com|googleapis\.com/.test(baseURL)) {
        lines.push("这些域名在国内网络无法直连（DNS 被污染），需要代理；想零成本直接用，请换智谱 glm-4-flash、通义 qwen-turbo，或本地 Ollama。");
      }
    }
    if (!inExt) lines.push("当前是网页预览模式，浏览器 CORS 也会拦截 API 请求，正式测试请把扩展装进 Chrome 后再点。");
    throw new Error(lines.join("\n"));
  }
}
