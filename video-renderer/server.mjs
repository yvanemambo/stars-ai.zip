import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const PORT = Number(process.env.PORT || 10000);
const TOKEN = (process.env.VIDEO_RENDERER_TOKEN || "").trim();
const FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
const FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const MAX_BODY = 100_000;
function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}
async function bodyJson(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > MAX_BODY) throw new Error("body_too_large"); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}
function cleanText(value, max) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}
function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", chunk => { stderr = (stderr + chunk.toString()).slice(-5000); });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(new Error("ffmpeg_exit_" + code + ": " + stderr.slice(-1200))));
  });
}
async function render(input) {
  const scenes = input.scenes;
  if (!Array.isArray(scenes) || scenes.length !== 6) throw new Error("six_scenes_required");
  const ratio = input.aspectRatio === "16:9" ? "16:9" : input.aspectRatio === "1:1" ? "1:1" : "9:16";
  const [width, height] = ratio === "16:9" ? [1920, 1080] : ratio === "1:1" ? [1080, 1080] : [1080, 1920];
  const duration = Math.max(12, Math.min(30, Number(input.durationSeconds) || 30));
  const segment = duration / scenes.length;
  const work = await mkdtemp(path.join(os.tmpdir(), "yvanai-video-"));
  const output = path.join(work, "final.mp4");
  try {
    const palette = ["0x10152f", "0x171033", "0x10243a", "0x241333", "0x102b35", "0x17182f"];
    const filters = [], inputs = [];
    for (let i = 0; i < scenes.length; i++) {
      const titleFile = path.join(work, "title-" + i + ".txt");
      const subtitleFile = path.join(work, "subtitle-" + i + ".txt");
      await writeFile(titleFile, cleanText(scenes[i].title, 48) || ("Scène " + (i + 1)), "utf8");
      await writeFile(subtitleFile, cleanText(scenes[i].subtitle, 100), "utf8");
      inputs.push("-f", "lavfi", "-i", "color=c=" + palette[i] + ":s=" + width + "x" + height + ":r=30:d=" + segment.toFixed(3));
      const accentY = Math.round(height * 0.28), titleSize = Math.round(width * (ratio === "16:9" ? 0.052 : 0.064));
      const subSize = Math.round(width * 0.027), fade = Math.min(0.65, segment / 5), fadeOutAt = Math.max(fade, segment - fade);
      const label = "Y V A N A I   /   C R E A T I V E   S T U D I O";
      const chain = [
        "drawbox=x='mod(t*" + (110 + i * 13) + ",w)':y=" + accentY + ":w=" + Math.round(width * 0.26) + ":h=7:color=0xf4c96b@0.82:t=fill",
        "drawbox=x=0:y=0:w=iw:h=ih:color=0x080b18@0.18:t=fill",
        "drawtext=fontfile=" + FONT_BOLD + ":text='" + label + "':fontcolor=0xf4c96b:fontsize=" + Math.round(width * 0.018) + ":x=(w-text_w)/2:y=" + Math.round(height * 0.19),
        "drawtext=fontfile=" + FONT_BOLD + ":textfile=" + titleFile + ":fontcolor=white:fontsize=" + titleSize + ":line_spacing=14:x=(w-text_w)/2:y='h*0.43+16*sin(t*2)':shadowcolor=black@0.65:shadowx=3:shadowy=4:alpha='if(lt(t," + fade + "),t/" + fade + ",if(gt(t," + fadeOutAt + "),(" + segment + "-t)/" + fade + ",1))'",
        "drawtext=fontfile=" + FONT + ":textfile=" + subtitleFile + ":fontcolor=0xdbe4ff:fontsize=" + subSize + ":x=(w-text_w)/2:y=h*0.58:shadowcolor=black@0.55:shadowx=2:shadowy=3",
        "drawbox=x=0:y=h-14:w=iw:h=14:color=0xf4c96b@0.9:t=fill",
        "format=yuv420p"
      ].join(",");
      filters.push("[" + i + ":v]" + chain + "[v" + i + "]");
    }
    const concat = filters.join(";") + ";" + scenes.map((_, i) => "[v" + i + "]").join("") + "concat=n=6:v=1:a=0[outv]";
    await runFfmpeg(["-y", ...inputs, "-filter_complex", concat, "-map", "[outv]", "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-t", String(duration), output]);
    const video = await readFile(output);
    if (video.length < 10000) throw new Error("empty_video_output");
    return video;
  } finally { await rm(work, { recursive: true, force: true }).catch(() => {}); }
}
const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true, engine: "ffmpeg", format: "mp4" });
  if (req.method !== "POST" || req.url !== "/render") return send(res, 404, { error: "not_found" });
  if (!TOKEN || req.headers.authorization !== "Bearer " + TOKEN) return send(res, 401, { error: "unauthorized" });
  try {
    const video = await render(await bodyJson(req));
    res.writeHead(200, { "content-type": "video/mp4", "content-length": String(video.length), "cache-control": "no-store" });
    res.end(video);
  } catch (error) { console.error("[renderer]", error.message); send(res, 400, { error: "render_failed" }); }
});
server.listen(PORT, "0.0.0.0", () => console.log("[renderer] FFmpeg MP4 renderer listening on " + PORT));
