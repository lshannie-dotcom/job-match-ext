// 模型服务商与常用选项配置
export const PROVIDERS = {
  deepseek: {
    label: "DeepSeek",
    protocol: "openai",
    baseURL: "https://api.deepseek.com/v1",
    models: ["deepseek-chat", "deepseek-reasoner"],
    vision: false,
    keyURL: "https://platform.deepseek.com/api_keys",
    hint: "性价比高，中文长文本理解好；不支持图片，简历/JD 为图片时请改用视觉模型。"
  },
  openai: {
    label: "OpenAI",
    protocol: "openai",
    baseURL: "https://api.openai.com/v1",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "o4-mini"],
    vision: true,
    keyURL: "https://platform.openai.com/api-keys",
    hint: "综合能力强，支持图片。注意两点：① api.openai.com 在国内网络无法直连（DNS 被污染），会一直卡到超时，需要代理；② API 是预付费，账户没余额会返回 429，ChatGPT Plus 订阅不含 API 额度。国内网络建议直接用智谱 / 通义 / Kimi。"
  },
  moonshot: {
    label: "Moonshot Kimi",
    protocol: "openai",
    baseURL: "https://api.moonshot.cn/v1",
    models: ["kimi-k2-0711-preview", "moonshot-v1-32k", "moonshot-v1-128k"],
    vision: false,
    keyURL: "https://platform.moonshot.cn/console/api-keys",
    hint: "国内直连、注册有免费额度；长上下文，适合一次塞进多份 JD 对比。"
  },
  zhipu: {
    label: "智谱 GLM（有免费模型）",
    protocol: "openai",
    baseURL: "https://open.bigmodel.cn/api/paas/v4",
    models: ["glm-4-flash", "glm-4-plus", "glm-4-air", "glm-4v-plus", "glm-4.5"],
    vision: true,
    keyURL: "https://open.bigmodel.cn/usercenter/apikeys",
    hint: "国内直连、无需代理。glm-4-flash 官方长期免费，是零成本跑通的首选；glm-4v 系列支持图片。若提示模型不存在，按官网当前免费型号改名即可。"
  },
  qwen: {
    label: "通义千问（阿里云）",
    protocol: "openai",
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: ["qwen-turbo", "qwen-max", "qwen-plus", "qwen-vl-max", "qwen-vl-plus"],
    vision: true,
    keyURL: "https://bailian.console.aliyun.com/?apiKey=1",
    hint: "国内直连、新用户有免费额度；qwen-turbo 最便宜，qwen-vl 系列支持图片。"
  },
  doubao: {
    label: "豆包（火山方舟）",
    protocol: "openai",
    baseURL: "https://ark.cn-beijing.volces.com/api/v3",
    models: ["doubao-pro-32k", "doubao-vision-pro-32k"],
    vision: true,
    keyURL: "https://console.volcengine.com/ark",
    hint: "模型名需填写方舟里的接入点 ID（ep-xxxx）或模型 ID。"
  },
  anthropic: {
    label: "Claude（Anthropic）",
    protocol: "anthropic",
    baseURL: "https://api.anthropic.com/v1",
    models: ["claude-sonnet-4-20250514", "claude-3-7-sonnet-20250219", "claude-3-5-haiku-20241022"],
    vision: true,
    keyURL: "https://console.anthropic.com/settings/keys",
    hint: "支持图片；api.anthropic.com 在国内网络无法直连，需要代理。"
  },
  gemini: {
    label: "Gemini（Google）",
    protocol: "gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta",
    models: ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
    vision: true,
    keyURL: "https://aistudio.google.com/app/apikey",
    hint: "支持图片；国内需代理。"
  },
  ollama: {
    label: "本地 Ollama（完全免费）",
    protocol: "openai",
    baseURL: "http://localhost:11434/v1",
    models: ["qwen2.5:7b", "qwen2.5:14b", "qwen2.5:32b", "llama3.1:8b"],
    vision: false,
    noKey: true,
    hint: "不花钱、不走网络、简历不出本机。先安装 Ollama 并执行 OLLAMA_ORIGINS=* ollama serve，再 ollama pull qwen2.5:7b；16G 内存可跑 7B，分析质量略低于在线模型。"
  },
  custom: {
    label: "自定义（OpenAI 兼容）",
    protocol: "openai",
    baseURL: "",
    models: [],
    vision: true,
    hint: "填写任意兼容 /chat/completions 的中转或自建服务，例如公司内网网关。"
  }
};

export const CITIES = [
  "北京", "上海", "深圳", "广州", "杭州", "成都", "南京", "武汉",
  "西安", "苏州", "重庆", "天津", "长沙", "合肥", "厦门", "青岛",
  "郑州", "济南", "无锡", "珠海", "东莞", "佛山", "宁波", "福州",
  "大连", "沈阳", "哈尔滨", "香港", "新加坡", "远程"
];

export const TIER_META = {
  冲: { cls: "tier-chong", desc: "匹配度或竞争难度偏高，值得搏一次" },
  稳: { cls: "tier-wen", desc: "匹配度与竞争度均衡，主力投递位" },
  保: { cls: "tier-bao", desc: "命中率高，作为兜底" }
};

export const CITY_TIER = {
  北京: "一线", 上海: "一线", 深圳: "一线", 广州: "一线",
  杭州: "新一线", 成都: "新一线", 南京: "新一线", 武汉: "新一线",
  西安: "新一线", 苏州: "新一线", 重庆: "新一线", 天津: "新一线",
  长沙: "新一线", 合肥: "新一线", 厦门: "二线", 青岛: "新一线",
  郑州: "新一线", 济南: "二线", 无锡: "二线", 珠海: "二线",
  东莞: "二线", 佛山: "二线", 宁波: "新一线", 福州: "二线",
  大连: "二线", 沈阳: "二线", 哈尔滨: "二线", 香港: "境外", 新加坡: "境外", 远程: "远程"
};
