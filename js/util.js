export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export const uid = (prefix = "id") =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

export const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, Number(n) || 0));

export const truncate = (s, n) => {
  const t = String(s || "");
  return t.length > n ? `${t.slice(0, n)}\n…（后文已截断，共 ${t.length} 字）` : t;
};

export const fmtTime = (ts) => {
  if (!ts) return "";
  const d = new Date(ts);
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export const bytes = (n) => {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), u.length - 1);
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
};

export function toast(message, type = "info", ms = 2600) {
  const wrap = document.getElementById("toast");
  if (!wrap) return;
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = message;
  wrap.appendChild(el);
  requestAnimationFrame(() => el.classList.add("in"));
  setTimeout(() => {
    el.classList.remove("in");
    setTimeout(() => el.remove(), 260);
  }, ms);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

export function downloadText(filename, text, mime = "text/markdown;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function parseJsonLoose(raw) {
  if (!raw) return null;
  let t = String(raw).trim();
  t = t.replace(/^```(?:json|JSON)?\s*/g, "").replace(/```\s*$/g, "").trim();
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return null;
  const body = t.slice(first, last + 1);
  const attempts = [
    body,
    body.replace(/,\s*([}\]])/g, "$1"),
    body.replace(/[\u201c\u201d]/g, '"').replace(/,\s*([}\]])/g, "$1"),
    body.replace(/([{,]\s*)'([^']*?)'(\s*:)/g, '$1"$2"$3')
  ];
  for (const a of attempts) {
    try {
      return JSON.parse(a);
    } catch {
      /* next */
    }
  }
  return null;
}

export function debounce(fn, wait = 350) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

export const SWATCH = ["#4f46e5", "#0f9d76", "#0284c7", "#d97706", "#be123c", "#7c3aed", "#0891b2", "#c2410c"];
