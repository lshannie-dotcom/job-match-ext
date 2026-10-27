const KEY = "jme_state_v1";
const HAS_CHROME = typeof chrome !== "undefined" && !!chrome?.storage?.local && !!chrome?.runtime?.id;

export const DEFAULT_STATE = {
  version: 1,
  settings: {
    provider: "deepseek",
    baseURL: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    apiKey: "",
    visionModel: "",
    temperature: 0.3
  },
  resume: null,
  cities: [],
  salaryExpect: "",
  gradInfo: "",
  jds: [],
  company: { name: "", limit: 3, site: "", siteText: "", intel: "", salaryIntel: "", extra: "", suggestedLimit: 0 },
  qa: { questions: [], answers: {}, generatedAt: 0 },
  analysis: null,
  chat: [],
  updatedAt: 0
};

const merge = (base, patch) => {
  if (!patch || typeof patch !== "object") return base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === "object" && !Array.isArray(v) && base?.[k] && typeof base[k] === "object") {
      out[k] = merge(base[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
};

export async function loadState() {
  try {
    if (HAS_CHROME) {
      const got = await chrome.storage.local.get(KEY);
      return merge(structuredClone(DEFAULT_STATE), got?.[KEY] || {});
    }
    const raw = localStorage.getItem(KEY);
    return merge(structuredClone(DEFAULT_STATE), raw ? JSON.parse(raw) : {});
  } catch (e) {
    console.warn("[jme] load failed", e);
    return structuredClone(DEFAULT_STATE);
  }
}

let timer = null;
export function saveState(state) {
  state.updatedAt = Date.now();
  const payload = { [KEY]: state };
  return new Promise((resolve) => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        if (HAS_CHROME) await chrome.storage.local.set(payload);
        else localStorage.setItem(KEY, JSON.stringify(state));
        document.dispatchEvent(new CustomEvent("jme:saved"));
        resolve(true);
      } catch (e) {
        console.warn("[jme] save failed", e);
        document.dispatchEvent(new CustomEvent("jme:save-failed", { detail: String(e?.message || e) }));
        resolve(false);
      }
    }, 260);
  });
}

export async function clearState() {
  if (HAS_CHROME) await chrome.storage.local.remove(KEY);
  else localStorage.removeItem(KEY);
}

export async function takePendingJDs() {
  if (!HAS_CHROME) return [];
  const got = await chrome.storage.local.get("pendingJDs");
  const list = got?.pendingJDs || [];
  if (list.length) await chrome.storage.local.remove("pendingJDs");
  return list;
}

export { HAS_CHROME };
