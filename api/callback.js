module.exports = async (req, res) => {
  const token = req.headers['x-callback-token'];
  if (token !== process.env.XENDIT_CALLBACK_TOKEN) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }

  const { external_id, status, paid_amount, amount } = req.body;

  if (status === 'PAID') {
    const total = paid_amount || amount;
    const msg = encodeURIComponent(
      `🎉 Order baru Cocori!\nRef: ${external_id}\nTotal: Rp${Number(total).toLocaleString('id-ID')}\nStatus: LUNAS`
    );
    await fetch(
      `https://api.callmebot.com/whatsapp.php?phone=${process.env.WA_NUMBER}&text=${msg}&apikey=${process.env.CALLMEBOT_APIKEY}`
    );
  }

  res.status(200).json({ success: true });
};
