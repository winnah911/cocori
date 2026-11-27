const crypto = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// Harga di server (samakan dengan index.html kalau harga berubah)
const BASE_PRICE = 10000;
const BUNDLE_PRICE = 10000;
const FLAVORS = ["Original", "Matcha", "Milk"];
const TOPPINGS = { "Coklat Serès": 2000, "Silverqueen": 3000, "Oreo Crush": 2000, "Keju": 2000, "Almond Slice": 3000 };
const AREAS = ["Pasirkuda", "Gunung Batu", "Bogor Barat", "Ciomas", "Jl. Letjen Ibrahim Adjie"];
const ADMIN_STATUSES = ["menunggu_pembayaran", "menunggu_konfirmasi", "dibayar", "ditolak"];

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

function makeOrderCode() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  return `COC-${stamp}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

// Bersihkan item dan hitung total dari harga server
function cleanItems(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 20) return null;
  let total = 0;
  const clean = [];
  for (const it of items) {
    const qty = Number(it && it.qty);
    if (!it || !FLAVORS.includes(it.flavor) || !Number.isInteger(qty) || qty < 1 || qty > 99) return null;
    const toppings = Array.isArray(it.toppings) ? it.toppings : [];
    if (toppings.length > 5) return null;
    for (const t of toppings) {
      if (typeof t !== "string" || !Object.prototype.hasOwnProperty.call(TOPPINGS, t)) return null;
    }
    const bundle = it.bundle === true;
    const unit = bundle ? BUNDLE_PRICE : BASE_PRICE + toppings.reduce((s, t) => s + TOPPINGS[t], 0);
    total += unit * qty;
    clean.push({ flavor: it.flavor, toppings, qty, bundle });
  }
  return { clean, total };
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

          // 1) tolak kalau toko diliburkan manual dari admin
      const st = await sb("store_settings?id=eq.1&select=manual_open");
      if (st.ok) {
        const srows = await st.json();
        if (srows[0] && srows[0].manual_open === false) {
          return res.status(403).json({ error: "Toko sedang tutup" });
        }
      }

      // 2) tolak di luar jam buka (07.00-21.00 WIB)
      const hour = Number(new Intl.DateTimeFormat("en-GB", {
        hour: "numeric", hourCycle: "h23", timeZone: "Asia/Jakarta",
      }).format(new Date()));
      if (hour < 7 || hour >= 21) {
        return res.status(403).json({ error: "Toko sedang tutup" });
      }

      // 3) batasi lonjakan order (maks 15 per menit, semua pembeli)
      const since = new Date(Date.now() - 60000).toISOString();
      const rc = await sb(`orders?select=order_code&created_at=gte.${since}`);
      if (rc.ok && (await rc.json()).length >= 15) {
        return res.status(429).json({ error: "Terlalu banyak order, coba lagi sebentar" });
      }

    // ---------- POST: customer bikin order baru ----------
    if (req.method === "POST") {
      const { customer_name, area, address, items } = req.body || {};
      const name = String(customer_name || "").trim();
      const addr = String(address || "").trim();
      const result = cleanItems(items);
      if (name.length < 1 || name.length > 60 || !AREAS.includes(area) || addr.length < 5 || addr.length > 300 || !result) {
        return res.status(400).json({ error: "Data order tidak valid" });
      }
      const r = await sb("orders", {
        method: "POST",
        body: JSON.stringify({
          order_code: makeOrderCode(),
          customer_name: name,
          area,
          address: addr,
          items: result.clean,
          total: result.total, // dihitung server, bukan dari browser
          status: "menunggu_pembayaran",
        }),
      });
      if (!r.ok) return res.status(500).json({ error: "Gagal menyimpan order" });
      const [data] = await r.json();
      return res.status(200).json(data);
    }

    // ---------- PATCH: update status ----------
    if (req.method === "PATCH") {
      const { order_code, status, byAdmin } = req.body || {};
      if (typeof order_code !== "string" || !order_code || !status) {
        return res.status(400).json({ error: "Data tidak lengkap" });
      }
      const admin = isAdmin(req);
      if (byAdmin && !admin) return res.status(401).json({ error: "Unauthorized" });

      let path = `orders?order_code=eq.${encodeURIComponent(order_code)}`;
      if (admin) {
        if (!ADMIN_STATUSES.includes(status)) return res.status(400).json({ error: "Status tidak valid" });
      } else {
        // customer hanya boleh konfirmasi bayar, dan hanya dari status menunggu_pembayaran
        if (status !== "menunggu_konfirmasi") return res.status(403).json({ error: "Forbidden" });
        path += "&status=eq.menunggu_pembayaran";
      }

      const r = await sb(path, { method: "PATCH", body: JSON.stringify({ status }) });
      if (!r.ok) return res.status(500).json({ error: "Gagal update status" });
      const rows = await r.json();
      if (!rows.length) return res.status(404).json({ error: "Order tidak ditemukan" });
      return res.status(200).json(rows[0]);
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
};
