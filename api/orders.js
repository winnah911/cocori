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

function isAdmin(req) {
  return req.headers["x-admin-password"] === ADMIN_PASSWORD;
}

function makeOrderCode() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  return `COC-${stamp}-${Math.floor(100 + Math.random() * 900)}`;
}

module.exports = async (req, res) => {
  try {
    // ---------- GET: admin melihat semua order ----------
    if (req.method === "GET") {
      if (!isAdmin(req)) return res.status(401).json({ error: "Unauthorized" });
      const r = await sb("orders?select=*&order=created_at.desc");
      const data = await r.json();
      return res.status(200).json(data);
    }

    // ---------- POST: customer bikin order baru ----------
    if (req.method === "POST") {
      const { customer_name, area, address, items, total } = req.body;
      if (!customer_name || !area || !address || !items?.length || !total) {
        return res.status(400).json({ error: "Data order tidak lengkap" });
      }
      const order_code = makeOrderCode();
      const r = await sb("orders", {
        method: "POST",
        body: JSON.stringify({
          order_code,
          customer_name,
          area,
          address,
          items,
          total,
          status: "menunggu_pembayaran",
        }),
      });
      if (!r.ok) return res.status(500).json({ error: "Gagal menyimpan order" });
      const [data] = await r.json();
      return res.status(200).json(data);
    }

    // ---------- PATCH: update status order (customer konfirmasi bayar / admin terima-tolak) ----------
    if (req.method === "PATCH") {
      const { order_code, status, byAdmin } = req.body;
      if (!order_code || !status) return res.status(400).json({ error: "Data tidak lengkap" });
      if (byAdmin && !isAdmin(req)) return res.status(401).json({ error: "Unauthorized" });

      const r = await sb(`orders?order_code=eq.${encodeURIComponent(order_code)}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      if (!r.ok) return res.status(500).json({ error: "Gagal update status" });
      const [data] = await r.json();
      return res.status(200).json(data);
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
