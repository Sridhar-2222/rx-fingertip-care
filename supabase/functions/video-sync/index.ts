// Rx Fingertip Care — fills public.video_library from trusted YouTube channels.
// Uses YouTube's free public RSS feed (no API key). Runs at most once every 6 hours.
import { createClient } from "npm:@supabase/supabase-js@2";

const CONDITIONS: Record<string, string[]> = {
  diabetes: ["diabetes", "diabetic", "sugar", "insulin", "hba1c", "షుగర్", "మధుమేహ", "డయాబెటి", "చక్కెర"],
  bp: ["blood pressure", " bp", "bp ", "hypertension", "బీపీ", "రక్తపోటు"],
  heart: ["heart", "cardiac", "cardio", "chest pain", "angioplasty", "bypass", "గుండె", "హార్ట్"],
  thyroid: ["thyroid", "థైరాయిడ్"],
  kidney: ["kidney", "renal", "dialysis", "urine", "uti", "కిడ్నీ", "మూత్ర"],
  liver: ["liver", "hepatitis", "jaundice", "లివర్", "కాలేయ", "కామెర్ల"],
  pregnancy: ["pregnan", "ivf", "fertility", "pcos", "pcod", "delivery", "గర్భ", "ప్రెగ్నెన్సీ"],
  child: ["child", "baby", "kids", "infant", "newborn", "pediatric", "paediatric", "పిల్ల", "శిశు"],
  joints: ["knee", "joint", "back pain", "neck pain", "arthritis", "spine", "ortho", "bone", "మోకాలి", "నడుము", "కీళ్ల", "ఎముక"],
  lungs: ["asthma", "lung", "breath", "copd", "cough", "tb ", "tuberculosis", "pneumonia", "ఆస్తమా", "ఊపిరి", "దగ్గు"],
  stomach: ["stomach", "gastric", "acidity", "piles", "gas ", "constipation", "ulcer", "gall", "digest", "కడుపు", "గ్యాస్", "పైల్స్"],
  cancer: ["cancer", "tumor", "tumour", "oncolog", "chemo", "క్యాన్సర్"],
  brain: ["stroke", "brain", "neuro", "migraine", "headache", "epilep", "seizure", "paralysis", "parkinson", "పక్షవాత", "తలనొప్పి", "మెదడు"],
  women: ["women", "period", "menstru", "menopause", "breast", "uterus", "మహిళ", "పీరియడ్"],
  fever: ["fever", "dengue", "malaria", "typhoid", "viral", "infection", "జ్వర", "డెంగ్యూ"],
  diet: ["diet", "food", "nutrition", "weight", "obesity", "fat loss", "ఆహార", "బరువు", "డైట్"],
  mind: ["stress", "anxiety", "depression", "sleep", "mental", "ఒత్తిడి", "నిద్ర"],
  firstaid: ["first aid", "cpr", "emergency", "heart attack", "accident", "burn", "choking", "ప్రథమ చికిత్స", "అత్యవసర"],
};
const tag = (t: string) => {
  const s = " " + t.toLowerCase() + " ";
  return Object.entries(CONDITIONS).filter(([, ks]) => ks.some((k) => s.includes(k))).map(([c]) => c);
};
const lang = (t: string) => /[ఀ-౿]/.test(t) || /telugu/i.test(t) ? "te" : /[ऀ-ॿ]/.test(t) || /hindi/i.test(t) ? "hi" : "en";
const unesc = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
const UA = { "User-Agent": "Mozilla/5.0 (compatible; RxFingertipCare/1.0)", "Accept-Language": "en-IN,en;q=0.9" };

Deno.serve(async () => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: st } = await db.from("video_sync_state").select("last_run").eq("id", 1).maybeSingle();
  if (st?.last_run && Date.now() - new Date(st.last_run).getTime() < 6 * 3600 * 1000) return json({ skipped: "ran recently" });
  await db.from("video_sync_state").update({ last_run: new Date().toISOString() }).eq("id", 1);

  const { data: chans } = await db.from("video_channels").select("*").eq("active", true);
  const report: Record<string, unknown> = {};
  for (const ch of chans ?? []) {
    try {
      let id = ch.channel_id as string | null;
      if (!id) {
        const page = await (await fetch("https://www.youtube.com/" + ch.handle, { headers: UA })).text();
        id = (page.match(/"externalId":"(UC[\w-]{22})"/) || page.match(/channel_id=(UC[\w-]{22})/) || [])[1] || null;
        if (!id) throw new Error("channel not found");
        await db.from("video_channels").update({ channel_id: id }).eq("handle", ch.handle);
      }
      // the channel's latest uploads, plus its public playlists (each feed lists up to 15 videos)
      const feeds = ["channel_id=" + id];
      try {
        const pl = await (await fetch("https://www.youtube.com/channel/" + id + "/playlists", { headers: UA })).text();
        [...new Set([...pl.matchAll(/"playlistId":"(PL[\w-]{10,40})"/g)].map((m) => m[1]))].slice(0, 40).forEach((p) => feeds.push("playlist_id=" + p));
      } catch (_) { /* uploads feed still works */ }
      const xmls: string[] = [];
      for (let i = 0; i < feeds.length; i += 6) {
        const part = await Promise.all(feeds.slice(i, i + 6).map((f) => fetch("https://www.youtube.com/feeds/videos.xml?" + f, { headers: UA }).then((r) => r.ok ? r.text() : "").catch(() => "")));
        xmls.push(...part);
      }
      const xml = xmls.join("\n");
      const seen = new Set<string>();
      const rows = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => {
        const e = m[1];
        const vid = (e.match(/<yt:videoId>([\w-]{11})<\/yt:videoId>/) || [])[1];
        const title = unesc((e.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "").trim();
        const views = +((e.match(/<media:statistics views="(\d+)"/) || [])[1] || 0);
        const pub = (e.match(/<published>([^<]+)<\/published>/) || [])[1] || null;
        if (!vid || seen.has(vid)) return null; seen.add(vid);
        return vid && title ? { id: vid, channel_id: id, channel_name: ch.name, title, lang: lang(title), conditions: tag(title), views, published_at: pub } : null;
      }).filter(Boolean);
      if (rows.length) {
        const { error } = await db.from("video_library").upsert(rows, { onConflict: "id", ignoreDuplicates: false });
        if (error) throw error;
      }
      await db.from("video_channels").update({ last_synced: new Date().toISOString(), last_error: null }).eq("handle", ch.handle);
      report[ch.handle] = { videos: rows.length, feeds: feeds.length };
    } catch (err) {
      await db.from("video_channels").update({ last_error: String((err as Error).message || err).slice(0, 200) }).eq("handle", ch.handle);
      report[ch.handle] = "error: " + String((err as Error).message || err);
    }
  }
  return json({ ok: true, report });
});
