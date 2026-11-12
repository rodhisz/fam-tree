// Proxy pengambilan foto untuk import Excel.
// Browser tidak bisa mengambil bytes gambar langsung dari Google Drive karena
// CORS, jadi edge function ini yang mengambilnya lalu meneruskan hasilnya ke
// browser. Hanya host Google yang diizinkan agar fungsi ini tidak jadi
// proxy terbuka untuk domain mana pun.

const ALLOWED_HOSTS = ["drive.google.com", "docs.google.com"];
const ALLOWED_SUFFIXES = ["googleusercontent.com", "ggpht.com"];

const MAX_BYTES = 20 * 1024 * 1024; // batas unduhan sebelum kompresi
const TIMEOUT_MS = 15000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, message: string) =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const hostAllowed = (hostname: string) =>
  ALLOWED_HOSTS.includes(hostname) ||
  ALLOWED_SUFFIXES.some(
    (suffix) => hostname === suffix || hostname.endsWith("." + suffix),
  );

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, "hanya POST yang didukung");

  let target: string;
  try {
    const body = await req.json();
    target = String(body?.url ?? "");
  } catch {
    return json(400, "body bukan JSON yang valid");
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return json(400, "URL tidak valid");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return json(400, "hanya http dan https yang didukung");
  }
  if (!hostAllowed(parsed.hostname)) {
    return json(403, "host tidak diizinkan");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const upstream = await fetch(parsed.toString(), {
      signal: controller.signal,
      redirect: "follow",
    });
    if (!upstream.ok) return json(502, `sumber menjawab HTTP ${upstream.status}`);

    const contentType = (upstream.headers.get("content-type") ?? "")
      .toLowerCase()
      .split(";")[0];
    if (!contentType.startsWith("image/")) {
      return json(415, "tautan tidak mengembalikan gambar");
    }

    const buffer = await upstream.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) return json(413, "gambar melebihi batas ukuran");

    return new Response(buffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return json(504, "waktu pengambilan habis");
    }
    return json(502, "gagal mengambil dari sumber");
  } finally {
    clearTimeout(timer);
  }
});
