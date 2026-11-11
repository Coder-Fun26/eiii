const ALLOWED_ORIGINS = new Set([
  "https://coder-fun26.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
]);
const CATEGORIES = new Set(["میم", "بازی", "واکنش", "حیوانات", "دیگر"]);
const MAX_UPLOAD = 450 * 1024;

function cors(request) {
  const origin = request.headers.get("Origin") || "";
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
  if (ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}
function json(request, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors(request), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}
function isAdmin(request, env) {
  return !!env.ADMIN_KEY && request.headers.get("Authorization") === "Bearer " + env.ADMIN_KEY;
}
function cleanText(value, max, fallback) {
  return String(value || "").trim().replace(/[\u0000-\u001f<>]/g, "").slice(0, max) || fallback;
}
function mimeFromName(name) {
  const ext = (String(name).split(".").pop() || "").toLowerCase();
  return ({ mp3:"audio/mpeg", wav:"audio/wav", ogg:"audio/ogg", webm:"audio/webm", m4a:"audio/mp4", aac:"audio/aac" })[ext] || "";
}
function validAudio(bytes, mime) {
  if (bytes.length < 4) return false;
  const ascii = (a, b) => String.fromCharCode(...bytes.slice(a, b));
  if (mime === "audio/wav") return ascii(0,4) === "RIFF" && ascii(8,12) === "WAVE";
  if (mime === "audio/ogg") return ascii(0,4) === "OggS";
  if (mime === "audio/webm") return bytes[0]===0x1a && bytes[1]===0x45 && bytes[2]===0xdf && bytes[3]===0xa3;
  if (mime === "audio/mp4") return ascii(4,8) === "ftyp";
  if (mime === "audio/mpeg") return ascii(0,3) === "ID3" || (bytes[0]===0xff && (bytes[1]&0xe0)===0xe0);
  if (mime === "audio/aac") return bytes[0]===0xff && (bytes[1]&0xf6)===0xf0;
  return false;
}
async function hashedIp(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip + ":" + env.ADMIN_KEY));
  return Array.from(new Uint8Array(digest)).map(n=>n.toString(16).padStart(2,"0")).join("");
}
async function handle(request, env) {
  const url = new URL(request.url), path = url.pathname;
  if (request.method === "OPTIONS") return new Response(null, {status:204, headers:cors(request)});
  if (path === "/api/health" && request.method === "GET") {
    const row = await env.DB.prepare("SELECT COUNT(*) AS total FROM sounds").first();
    return json(request, {ok:true, service:"soundboard-api", sounds:Number(row?.total || 0)});
  }
  if (path === "/api/sounds" && request.method === "GET") {
    const category = url.searchParams.get("category"), q = (url.searchParams.get("q") || "").trim().slice(0,50);
    let sql = "SELECT id,title,category,author,mime_type,bytes,plays,created_at FROM sounds WHERE status='published'", params = [];
    if (category && CATEGORIES.has(category)) { sql += " AND category=?"; params.push(category); }
    if (q) { sql += " AND (title LIKE ? OR author LIKE ?)"; params.push("%"+q+"%", "%"+q+"%"); }
    sql += " ORDER BY created_at DESC LIMIT 120";
    const result = await env.DB.prepare(sql).bind(...params).all();
    return json(request, {sounds:result.results || []});
  }
  const audio = path.match(/^\/api\/sounds\/([a-f0-9-]+)\/audio$/);
  if (audio && request.method === "GET") {
    const row = await env.DB.prepare("SELECT audio_blob,mime_type FROM sounds WHERE id=? AND status='published'").bind(audio[1]).first();
    if (!row) return json(request, {error:"صدا پیدا نشد."}, 404);
    return new Response(row.audio_blob, {headers:{...cors(request), "Content-Type":row.mime_type || "application/octet-stream", "Content-Disposition":"inline", "Cache-Control":"public, max-age=3600"}});
  }
  const play = path.match(/^\/api\/sounds\/([a-f0-9-]+)\/play$/);
  if (play && request.method === "POST") {
    await env.DB.prepare("UPDATE sounds SET plays=plays+1 WHERE id=? AND status='published'").bind(play[1]).run();
    return json(request, {ok:true});
  }
  if (path === "/api/sounds" && request.method === "POST") {
    if (Number(request.headers.get("Content-Length") || 0) > MAX_UPLOAD + 10000) return json(request, {error:"حجم فایل باید کمتر از ۴۵۰ کیلوبایت باشد."}, 413);
    const form = await request.formData(), file = form.get("file");
    if (!(file instanceof File)) return json(request, {error:"فایل صوتی انتخاب نشده است."}, 400);
    if (!file.size || file.size > MAX_UPLOAD) return json(request, {error:"حجم فایل باید کمتر از ۴۵۰ کیلوبایت باشد."}, 413);
    const mime = file.type || mimeFromName(file.name);
    const allowed = new Set(["audio/mpeg","audio/wav","audio/ogg","audio/webm","audio/mp4","audio/aac"]);
    if (!allowed.has(mime)) return json(request, {error:"فرمت مجاز: MP3، WAV، OGG، WEBM، M4A یا AAC."}, 415);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!validAudio(bytes, mime)) return json(request, {error:"محتوای فایل با فرمت صوتی سازگار نیست."}, 415);
    const ipHash = await hashedIp(request, env);
    const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM upload_limits WHERE ip_hash=? AND uploaded_at > datetime('now','-1 hour')").bind(ipHash).first();
    if (Number(count?.total || 0) >= 4) return json(request, {error:"برای جلوگیری از اسپم، در هر ساعت حداکثر ۴ ارسال مجاز است."}, 429);
    const title = cleanText(form.get("title"), 42, "صدای تازه");
    const raw = cleanText(form.get("category"), 20, "دیگر"), category = CATEGORIES.has(raw) ? raw : "دیگر";
    const author = cleanText(form.get("author"), 22, "ناشناس"), id = crypto.randomUUID(), createdAt = new Date().toISOString();
    await env.DB.prepare("INSERT INTO sounds (id,title,category,author,mime_type,bytes,audio_blob,status,plays,created_at) VALUES (?,?,?,?,?,?,?,'pending',0,?)").bind(id,title,category,author,mime,bytes,createdAt).run();
    await env.DB.prepare("INSERT INTO upload_limits (ip_hash,uploaded_at) VALUES (?,?)").bind(ipHash,createdAt).run();
    return json(request, {ok:true,id,message:"صدای شما برای بررسی ارسال شد؛ بعد از تأیید در گالری عمومی قرار می‌گیرد."}, 202);
  }
  if (path === "/api/admin/pending" && request.method === "GET") {
    if (!isAdmin(request, env)) return json(request, {error:"دسترسی مدیر تأیید نشد."}, 401);
    const result = await env.DB.prepare("SELECT id,title,category,author,mime_type,bytes,created_at FROM sounds WHERE status='pending' ORDER BY created_at ASC LIMIT 100").all();
    return json(request, {sounds:result.results || []});
  }
  const admin = path.match(/^\/api\/admin\/sounds\/([a-f0-9-]+)\/(approve|reject)$/);
  if (admin && request.method === "POST") {
    if (!isAdmin(request, env)) return json(request, {error:"دسترسی مدیر تأیید نشد."}, 401);
    const status = admin[2] === "approve" ? "published" : "rejected";
    await env.DB.prepare("UPDATE sounds SET status=? WHERE id=? AND status='pending'").bind(status, admin[1]).run();
    return json(request, {ok:true,status});
  }
  return json(request, {error:"مسیر پیدا نشد."}, 404);
}
export default {
  async fetch(request, env) {
    try { return await handle(request, env); }
    catch (error) { return json(request, {error:"خطای داخلی سرویس.", detail:String(error?.message || error)}, 500); }
  }
};