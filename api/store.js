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

const isAdmin = (req) =>
  Boolean(ADMIN_PASSWORD) && req.headers["x-admin-password"] === ADMIN_PASSWORD;

module.exports = async (req, res) => {
  try {
    if (req.method === "GET") {
      const r = await sb("store_settings?id=eq.1&select=manual_open");
      if (!r.ok) return res.status(500).json({ error: "Gagal membaca status toko" });
      const rows = await r.json();
      return res.status(200).json({ manual_open: rows[0] ? rows[0].manual_open : true });
    }

    if (req.method === "PATCH") {
      if (!isAdmin(req)) return res.status(401).json({ error: "Unauthorized" });
      const { manual_open } = req.body || {};
      if (typeof manual_open !== "boolean") return res.status(400).json({ error: "Data tidak valid" });
      const r = await sb("store_settings?on_conflict=id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({ id: 1, manual_open }),
      });
      if (!r.ok) return res.status(500).json({ error: "Gagal update status toko" });
      return res.status(200).json({ manual_open });
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
};
