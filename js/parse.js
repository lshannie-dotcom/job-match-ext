import * as pdfjsLib from "../lib/pdf.min.mjs";

const url = (p) => (typeof chrome !== "undefined" && chrome?.runtime?.getURL ? chrome.runtime.getURL(p) : new URL(`../${p}`, import.meta.url).href);

pdfjsLib.GlobalWorkerOptions.workerSrc = url("lib/pdf.worker.min.mjs");

export const ACCEPT = ".pdf,.doc,.docx,.md,.markdown,.txt,.rtf,.png,.jpg,.jpeg,.webp";
export const IMAGE_EXT = ["png", "jpg", "jpeg", "webp", "bmp", "gif"];
export const MAX_IMAGES = 6;

const extOf = (name = "") => (name.split(".").pop() || "").toLowerCase();

export function fileKind(file) {
  const ext = extOf(file.name);
  if (IMAGE_EXT.includes(ext) || file.type.startsWith("image/")) return "image";
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (ext === "doc") return "doc";
  if (["md", "markdown"].includes(ext)) return "md";
  if (["txt", "rtf"].includes(ext)) return "txt";
  return "unknown";
}

async function readText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(new Error("读取文件失败"));
    r.readAsText(file, "utf-8");
  });
}

async function readBuffer(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("读取文件失败"));
    r.readAsArrayBuffer(file);
  });
}

async function readDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(new Error("读取文件失败"));
    r.readAsDataURL(file);
  });
}

/** PDF → 文本（含中文 CMap 支持） */
export async function pdfToText(file, onProgress) {
  const buf = await readBuffer(file);
  const doc = await pdfjsLib.getDocument({
    data: buf,
    cMapUrl: url("lib/cmaps/"),
    cMapPacked: true,
    standardFontDataUrl: url("lib/standard_fonts/"),
    isEvalSupported: false,
    useWorkerFetch: true
  }).promise;

  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let line = "";
    const lines = [];
    for (const item of content.items) {
      const str = item.str ?? "";
      line += str;
      if (item.hasEOL) {
        lines.push(line.trim());
        line = "";
      } else if (item.width === 0 && str.trim() === "") {
        // 空白分隔符
      }
    }
    if (line.trim()) lines.push(line.trim());
    pages.push(lines.filter(Boolean).join("\n"));
    onProgress?.(i, doc.numPages);
    page.cleanup();
  }
  const text = pages.join("\n\n").replace(/[ \t]{2,}/g, " ").trim();
  return { text, numPages: doc.numPages };
}

/** Word(.docx) → 文本：直接解 zip + 抽取 word/document.xml（不依赖 eval，适配扩展 CSP） */
function unzipEntry(buf, wantName) {
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  // 从尾部找 EOCD
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("不是有效的 docx（找不到 zip 目录）");
  const count = dv.getUint16(eocd + 10, true);
  let ptr = dv.getUint32(eocd + 16, true);

  for (let n = 0; n < count; n++) {
    if (dv.getUint32(ptr, true) !== 0x02014b50) break;
    const method = dv.getUint16(ptr + 10, true);
    const compSize = dv.getUint32(ptr + 20, true);
    const nameLen = dv.getUint16(ptr + 28, true);
    const extraLen = dv.getUint16(ptr + 30, true);
    const commentLen = dv.getUint16(ptr + 32, true);
    const localOff = dv.getUint32(ptr + 42, true);
    const name = new TextDecoder().decode(u8.subarray(ptr + 46, ptr + 46 + nameLen));
    if (name === wantName) {
      const lNameLen = dv.getUint16(localOff + 26, true);
      const lExtraLen = dv.getUint16(localOff + 28, true);
      const start = localOff + 30 + lNameLen + lExtraLen;
      const data = u8.subarray(start, start + compSize);
      return { method, data };
    }
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

async function inflateRaw(data) {
  if (typeof DecompressionStream === "undefined") throw new Error("当前浏览器不支持解压");
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function xmlToText(xml) {
  return xml
    .replace(/<w:tab[^>]*\/>/g, "\t")
    .replace(/<w:br[^>]*\/>/g, "\n")
    .replace(/<\/w:tc>/g, "\t")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:instrText[^>]*>[\s\S]*?<\/w:instrText>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

export async function docxToText(file) {
  const buf = await readBuffer(file);
  const entry = unzipEntry(buf, "word/document.xml");
  if (!entry) throw new Error("docx 结构异常：找不到 word/document.xml");
  const raw = entry.method === 0 ? entry.data : await inflateRaw(entry.data);
  const xml = new TextDecoder("utf-8").decode(raw);
  const text = xmlToText(xml).trim();
  if (!text) throw new Error("docx 里没有提取到文字");
  return text;
}

/** 图片 → 压缩后的 dataURL（长边 ≤ 1600，JPEG 0.82） */
export async function imageToDataURL(file, maxSide = 1600) {
  const raw = await readDataURL(file);
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.82 });
    const dataUrl = await new Promise((res) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.readAsDataURL(blob);
    });
    return { dataUrl, mime: "image/jpeg", width: w, height: h };
  } catch {
    return { dataUrl: raw, mime: file.type || "image/png", width: 0, height: 0 };
  }
}

/**
 * 统一入口：把文件解析为 { text, images[] }
 * images 用于视觉模型兜底（简历截图 / JD 截图 / 扫描版 PDF）
 */
export async function parseFile(file, onProgress) {
  const kind = fileKind(file);
  const base = { name: file.name, size: file.size, kind };

  if (kind === "image") {
    const img = await imageToDataURL(file);
    return { ...base, text: "", images: [{ ...img, name: file.name }] };
  }
  if (kind === "pdf") {
    let text = "";
    try {
      const r = await pdfToText(file, onProgress);
      text = r.text;
    } catch (e) {
      throw new Error(`PDF 解析失败：${e?.message || e}`);
    }
    if (text.replace(/\s/g, "").length < 40) {
      // 扫描件：交给视觉模型
      const img = await imageToDataURL(file);
      return { ...base, text, images: [{ ...img, name: file.name }], scanned: true };
    }
    return { ...base, text, images: [] };
  }
  if (kind === "docx") {
    const text = await docxToText(file);
    return { ...base, text, images: [] };
  }
  if (kind === "md" || kind === "txt") {
    const text = await readText(file);
    return { ...base, text: text.trim(), images: [] };
  }
  if (kind === "doc") {
    throw new Error("暂不支持 .doc（旧版二进制格式），请用 Word 另存为 .docx 后重试");
  }
  throw new Error(`不支持的文件类型：${file.name}`);
}
