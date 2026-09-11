module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { amount, qty } = req.body;
    const apiKey = process.env.XENDIT_API_KEY;
    const externalId = 'COCORI-' + Date.now();

    const xenditRes = await fetch('https://api.xendit.co/v2/invoices', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(apiKey + ':').toString('base64'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        external_id: externalId,
        amount,
        description: `Cocori x${qty}`,
        currency: 'IDR',
        success_redirect_url: `https://${req.headers.host}`,
        failure_redirect_url: `https://${req.headers.host}`,
      }),
    });
    const data = await xenditRes.json();

    if (!data.invoice_url) return res.status(400).json(data);
    res.status(200).json({ checkout_url: data.invoice_url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
