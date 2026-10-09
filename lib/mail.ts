export async function sendLoginCode(to: string, code: string) {
  const key = process.env.RESEND_API_KEY
  if (!key) return { sent: false as const }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.MAIL_FROM ?? 'med <onboarding@resend.dev>',
      to,
      subject: 'رمز الدخول إلى لوحة تحكم med',
      html: `<div dir="rtl" style="font-family:sans-serif;padding:24px">
        <h2 style="color:#1b6b3f">الدفاع المدني السوري - med</h2>
        <p>رمز الدخول الخاص بك إلى لوحة التحكم:</p>
        <p style="font-size:32px;letter-spacing:8px;font-weight:bold">${code}</p>
        <p>صالح لمدة 10 دقائق. إذا لم تطلب هذا الرمز تجاهل الرسالة.</p>
      </div>`,
    }),
  })
  return { sent: res.ok as boolean }
}
