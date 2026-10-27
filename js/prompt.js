import { CITY_TIER } from "./config.js";
import { truncate } from "./util.js";

const RESUME_LIMIT = 9000;
const JD_LIMIT = 4200;
const INTEL_LIMIT = 3500;

export const SYSTEM_ANALYST = `你是「投递参谋」，一位同时具备三种视角的资深求职顾问：
1. 大厂/中厂校招面试官与招聘经理——清楚简历初筛的真实标准、硬门槛和竞争烈度；
2. 职业规划顾问——能判断岗位前景、业务线趋势、部门状态与能力的长期可迁移性；
3. 求职策略顾问——在"投递数量受限"的约束下做组合优化。

必须遵守的工作原则：
- 事实优先：用户提供的简历、JD、公司情报、候选人回答是唯一事实来源。没有依据的内容必须标注【推测】，并给出置信度；严禁编造具体部门名、裁员事件、福利细节、薪资数字或信息来源。
- 允许"有边界的推断"：对公司的行业地位、业务线阶段、岗位常规成长路径、城市薪资水位这类公开认知，可以给出判断，但必须写成"【推测】……（置信度低/中）"，并说明推断依据（行业常识/公司量级/岗位序列）。不要用一句"未知"敷衍掉整个维度。
- 薪资只能给区间：如果用户没有提供薪资情报，只能给"市场估算区间"（月薪 × 月数 = 年包），置信度标"低"，并写清估算依据（城市层级、行业、岗位序列、公司量级），绝不伪造精确数字或"某平台数据"。部门氛围/裁员风险同理：没有情报时给区间化判断 + 置信度，而不是确定结论。
- 要有区分度：不要把岗位都打成 75–85 分。分数必须能支撑"投 / 不投"的决策，同一批岗位之间要拉开差距。
- 缺口必须可执行：写清"缺什么 → 怎么补 → 大概多久 → 能不能在投递前补上"。
- 简历建议必须可直接抄进简历：只能用简历里已有的真实经历改写，不得虚构项目、数据、奖项。
- 中文输出，专业术语保留原文（如 RAG、LLM、K8s、A/B test）。`;

const cityLine = (cities) =>
  cities.length
    ? cities.map((c) => `${c}（${CITY_TIER[c] || "其他"}）`).join("、")
    : "未填写（请按候选人可能接受的范围内提示风险）";

function jdBlock(jds) {
  return jds
    .map((jd, i) => {
      const head = [
        `【岗位 ${i + 1}】id: ${jd.id}`,
        jd.title ? `名称：${jd.title}` : "",
        jd.dept ? `部门/团队：${jd.dept}` : "",
        jd.city ? `工作城市：${jd.city}` : "",
        jd.sourceUrl ? `JD 来源：${jd.sourceUrl}` : ""
      ]
        .filter(Boolean)
        .join("\n");
      const body = truncate((jd.text || "").trim() || "（未提供文字，见附件图片）", JD_LIMIT);
      return `${head}\n---- JD 正文 ----\n${body}`;
    })
    .join("\n\n");
}

function qaBlock(qa) {
  const answered = (qa?.questions || [])
    .map((q) => ({ q, a: (qa.answers || {})[q.id] }))
    .filter((x) => x.a && String(x.a).trim());
  if (!answered.length) return "（候选人未补充回答）";
  return answered.map((x) => `Q：${x.q.q}\nA：${Array.isArray(x.a) ? x.a.join("、") : String(x.a).trim()}`).join("\n\n");
}

export function collectImages(state) {
  const out = [];
  if (state.resume?.images?.length) {
    state.resume.images.forEach((im, i) => out.push({ dataUrl: im.dataUrl, label: `简历图片 ${i + 1}` }));
  }
  (state.jds || []).forEach((jd, i) => {
    (jd.images || []).forEach((im) => out.push({ dataUrl: im.dataUrl, label: `岗位 ${i + 1}（${jd.title || "未命名"}）的 JD 截图` }));
  });
  return out.slice(0, 6);
}

export function buildAnalysisMessages(state) {
  const { resume, cities, salaryExpect, jds, company, qa, gradInfo } = state;
  const images = collectImages(state);
  const imageNote = images.length
    ? `\n\n【附件图片说明】共 ${images.length} 张，按顺序为：${images.map((x) => x.label).join("；")}。请先读图提取文字，再与文本材料一并分析（图片内容优先用于补齐扫描件/截图缺失的信息）。`
    : "";

  const user = `请对下列 ${jds.length} 个岗位做深度匹配分析，并在投递数量上限内给出投递组合方案。

============ 一、候选人 ============
【简历正文】
${truncate(resume?.text || "（简历为图片，请从附件图片读取）", RESUME_LIMIT)}

【意向工作城市】${cityLine(cities)}
【毕业时间/应届身份】${gradInfo?.trim() || "未填写"}
【期望薪资】${salaryExpect?.trim() || "未填写"}
【候选人补充回答】
${qaBlock(qa)}

============ 二、目标公司与情报 ============
公司：${company.name?.trim() || "未填写"}
本次可投递岗位数量上限：${Number(company.limit) || 1} 个
招聘官网：${company.site?.trim() || "未提供"}
【招聘官网摘录（用户抓取，作为事实参考）】
${truncate(company.siteText?.trim() || "（无）", 3000)}
【公司/部门情报（用户提供，视为事实，但请注意其可能片面）】
${truncate(company.intel?.trim() || "（无）", INTEL_LIMIT)}
【薪资情报（用户提供）】
${truncate(company.salaryIntel?.trim() || "（无，需要你按市场估算并标注置信度）", 2000)}
【其他要求/背景】
${truncate(company.extra?.trim() || "（无）", 1500)}

============ 三、待比较岗位 ============
${jdBlock(jds)}
${imageNote}

============ 四、评分与分析规则 ============
1) 人岗匹配分 match（0–100）= skill 35% + experience 30% + project 20% + education 15%
   - skill：JD 要求的核心技术栈/工具/语言的覆盖度与深度（看简历证据，不看自我评价）
   - experience：实习/全职经历的行业相关性、职责复杂度、产出（量化结果优先）
   - project：项目/论文/竞赛与岗位方向的重合度与技术含量
   - education：学历层次、专业对口、毕业时间/应届身份等硬门槛
2) 岗位质量分 quality（0–100）= prospect 40% + team 30% + salary 20% + city 10%
   - prospect：业务线趋势、岗位成长路径、能力可迁移性、被 AI/组织调整替代的风险
   - team：部门氛围、福利、加班强度、裁员/收缩风险。有情报用情报；无情报时基于公司与业务线的公开认知给区间化判断，标【推测】并给置信度，分数取中性 60。
   - salary：按【意向城市】给该岗位的校招年包区间；有情报用情报，无情报给估算并标低置信度
   - city：岗位是否在意向城市、是否有异地/调动风险
3) 综合分 overall = round(match × 0.65 + quality × 0.35)。若存在硬门槛不满足（学历/专业/毕业时间/岗位不在意向城市且不可协商），overall 上限 55，verdict 为"不建议"或"可尝试"，并明确写出卡点。
4) 竞争烈度 difficulty（高/中/低）：综合公司热度、岗位 HC 稀缺度、JD 硬门槛、候选人背景在同批人中的相对位置。
5) 档位 tier：
   - 冲：overall ≥ 70 但 difficulty 高，或存在 1–2 个可快速补上的关键缺口
   - 稳：overall ≥ 70 且 difficulty 中低；或 62–70 且无明显硬伤
   - 保：match ≥ 75 且 difficulty 低
6) 投递组合 applyPlan：在 limit 内挑选，必须覆盖"冲/稳/保"中的至少两档（limit ≥ 3 时三档齐全）；同方向岗位若明显同质（同一部门不同组），要提示"重复投递可能浪费名额"。order 为建议投递先后顺序（考虑开放时间/流程速度/拿 offer 的把握，先投最有把握或最想去的）。
7) 所有金额用"月薪 × 月数（年包）"表达，人民币，例如 "25–32K × 15 ≈ 38–48 万"。
8) 必须给出去重后的差异化判断：这些岗位"看起来像"的地方要点明，真正拉开差距的地方要讲透（业务阶段、技术纵深、汇报关系、成长天花板、转正/晋升难度）。

============ 五、输出格式 ============
只输出一个 JSON 对象，不要任何解释文字、不要 markdown 代码块。字段必须完整，字符串精炼（每条 ≤ 80 字，除 reason/note 可到 150 字）：

{
  "company": "公司名",
  "candidate": {
    "headline": "一句话定位候选人（学历/方向/最强证据）",
    "strengths": ["3–5 条核心竞争力，带简历证据"],
    "weaknesses": ["2–4 条相对短板"],
    "cityFit": "意向城市与岗位分布的匹配情况"
  },
  "market": {
    "salaryNote": "该公司在该城市该方向的校招薪资总体判断（区间+依据+置信度）",
    "hiringTrend": "该方向今年的招聘/竞争态势判断",
    "confidence": "高/中/低"
  },
  "positions": [
    {
      "id": "必须原样复制岗位 id",
      "title": "岗位名",
      "score": 0,
      "quality": 0,
      "overall": 0,
      "difficulty": "高/中/低",
      "tier": "冲/稳/保",
      "verdict": "强烈推荐/推荐/可尝试/不建议",
      "match": { "skill": 0, "experience": 0, "project": 0, "education": 0 },
      "qualityDetail": { "prospect": 0, "team": 0, "salary": 0, "city": 0 },
      "salary": { "range": "月薪区间 × 月数 = 年包", "confidence": "高/中/低", "note": "依据或估算说明" },
      "team": { "atmosphere": "氛围判断（无情报写【推测】并给置信度）", "welfare": "福利/加班判断", "layoffRisk": "高/中/低/未知", "stability": "稳定性判断", "confidence": "高/中/低" },
      "prospect": { "trend": "业务/赛道趋势", "growth": "成长路径与天花板", "transfer": "能力可迁移性", "note": "补充" },
      "cityFit": "城市匹配说明",
      "matched": [{ "req": "JD 要求（原文要点）", "evidence": "简历中的对应证据（具体到项目/数字）", "level": "强/中/弱" }],
      "gaps": [{ "req": "未满足的要求", "gap": "差在哪", "fix": "怎么补（可执行）", "effort": "低/中/高" }],
      "resumeTips": ["可直接写进简历的改写句（基于真实经历）"],
      "interviewFocus": ["最可能被追问的问题 + 一句话应对思路"],
      "reason": "为什么是这个分数，最关键的 2–3 个理由"
    }
  ],
  "applyPlan": {
    "limit": 0,
    "order": ["岗位 id，按投递先后排序"],
    "picks": ["最终建议投递的岗位 id"],
    "portfolio": [{ "id": "岗位 id", "tier": "冲/稳/保", "why": "为什么占这个名额" }],
    "skip": [{ "id": "岗位 id", "why": "为什么放弃（名额/同质化/硬伤）" }],
    "rationale": "整体策略说明：名额怎么分配、为什么是这个组合"
  },
  "comparison": [{ "dimension": "对比维度（如技术纵深/业务阶段/成长天花板/薪资/稳定性/竞争烈度）", "note": "这批岗位在该维度上的真实差异，点名具体岗位" }],
  "nextActions": ["未来 7 天可执行的动作，按优先级"],
  "openQuestions": ["还需要候选人补充的信息（会显著影响判断的），最多 3 条"]
}`;

  return [
    { role: "system", content: SYSTEM_ANALYST },
    { role: "user", content: user }
  ];
}

export function buildCalibrationMessages(state) {
  const { resume, cities, jds, company } = state;
  const brief = jds.map((jd, i) => `${i + 1}. ${jd.title || "未命名"}${jd.dept ? ` / ${jd.dept}` : ""}${jd.city ? ` / ${jd.city}` : ""}`).join("\n");

  const user = `你是资深校招顾问。下面是一位候选人的简历摘要、意向城市和准备投递的岗位清单。

【简历摘要】
${truncate(resume?.text || "（简历为图片）", 3000)}

【意向城市】${cityLine(cities)}
【公司】${company.name || "未填写"}
【岗位清单】
${brief || "（暂无）"}

请提出 4–6 个"最影响投递决策、但简历和 JD 里看不出来"的问题，用于校准后续的岗位对比分析。要求：
- 只问真正会改变排序或结论的问题（例如：城市能否妥协、是否接受非核心业务、薪资底线、能否提前实习转正、方向的长期偏好、是否有竞品 offer、对加班/出差容忍度、毕业时间与签约节奏）。
- 每个问题给 2–6 个可直接点选的选项（type=single 或 multi），确实无法枚举的用 type=text。
- 问题要具体到这位候选人的情况，不要问泛泛的"你的职业规划是什么"。
- 每个问题附一句 why，说明它会怎么影响分析结论。

只输出 JSON，不要解释：
{
  "questions": [
    { "id": "q1", "q": "问题", "type": "single|multi|text", "options": ["选项1","选项2"], "hint": "可选补充说明", "why": "影响什么判断" }
  ]
}`;

  return [
    { role: "system", content: SYSTEM_ANALYST },
    { role: "user", content: user }
  ];
}

export function buildChatMessages(state, question, history = []) {
  const a = state.analysis;
  const summary = a
    ? `【已完成的岗位对比结论摘要】
${(a.positions || [])
  .map(
    (p) =>
      `- ${p.title}（id=${p.id}）overall ${p.overall}，match ${p.score}，quality ${p.quality}，${p.tier}，难度${p.difficulty}，结论：${p.verdict}`
  )
  .join("\n")}
【投递组合】${(a.applyPlan?.picks || []).join("、") || "未给出"}；理由：${a.applyPlan?.rationale || ""}
【仍需补充的信息】${(a.openQuestions || []).join("；") || "无"}`
    : "（尚未完成分析）";

  const context = `你正在和候选人对话，回答他关于本次岗位选择的问题。请像一位负责的学长/职业顾问：直接给结论，再给依据；能落到动作的建议优先；不确定的地方明确说"不确定"。

============ 候选人简历 ============
${truncate(state.resume?.text || "（简历为图片）", 6000)}

============ 意向城市 ============
${cityLine(state.cities || [])}
毕业时间/身份：${state.gradInfo || "未填写"}
期望薪资：${state.salaryExpect || "未填写"}

============ 目标公司 ============
${state.company?.name || "未填写"}｜投递上限 ${state.company?.limit || "未填"} 个
【公司/部门情报】${truncate(state.company?.intel || "（无）", 2000)}
【薪资情报】${truncate(state.company?.salaryIntel || "（无）", 1200)}

============ 岗位清单 ============
${(state.jds || [])
  .map((jd, i) => `【岗位 ${i + 1}】id=${jd.id}｜${jd.title}｜${jd.dept || ""}｜${jd.city || ""}\n${truncate(jd.text, 1500)}`)
  .join("\n\n")}

${summary}

============ 候选人补充回答 ============
${qaBlock(state.qa)}

回答要求：中文；用 markdown 小标题和要点，控制在 500 字内（除非用户要求展开）；涉及岗位时点名具体岗位，不要泛泛而谈。`;

  const msgs = [{ role: "system", content: context }, ...history.slice(-10)];
  msgs.push({ role: "user", content: question });
  return msgs;
}

export const buildResumeOnly = (resumeText) => `请阅读以下简历，输出 5 条最能打的、可量化的亮点：\n${truncate(resumeText, 4000)}`;
