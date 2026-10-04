const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const sb = (path, options = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...options.headers,
    },
  });

module.exports = async (req, res) => {
  try {
    // ---------- GET: siapa saja boleh lihat status menu (buat ditampilkan di web) ----------
    if (req.method === "GET") {
      const r = await sb("menu_items?select=*");
      const data = await r.json();
      return res.status(200).json(data);
    }

    // ---------- PATCH: hanya admin yang boleh ubah status sold-out ----------
    if (req.method === "PATCH") {
      if (req.headers["x-admin-password"] !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const { flavor, sold_out } = req.body;
      if (!flavor || typeof sold_out !== "boolean") {
        return res.status(400).json({ error: "Data tidak lengkap" });
      }
      const r = await sb(`menu_items?flavor=eq.${encodeURIComponent(flavor)}`, {
        method: "PATCH",
        body: JSON.stringify({ sold_out }),
      });
      if (!r.ok) return res.status(500).json({ error: "Gagal update menu" });
      const [data] = await r.json();
      return res.status(200).json(data);
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
