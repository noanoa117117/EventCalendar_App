import "server-only";

export type CancellationEmailEvent = {
  title: string;
  startAt: string;
  endAt: string;
  organizerName?: string;
};

export type ResendResult = { ok: true } | { ok: false; reason: string };

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);

export function buildCancellationEmail(to: string, event: CancellationEmailEvent, from: string) {
  const title = escapeHtml(event.title);
  const organizer = event.organizerName ? `<p>主催者: ${escapeHtml(event.organizerName)}</p>` : "";
  return {
    from,
    to: [to],
    subject: `【予定キャンセル】${event.title}`,
    text: `予定「${event.title}」はキャンセルされました。\n${event.startAt}〜${event.endAt}${event.organizerName ? `\n主催者: ${event.organizerName}` : ""}`,
    html: `<p>予定「${title}」はキャンセルされました。</p><p>${escapeHtml(event.startAt)}〜${escapeHtml(event.endAt)}</p>${organizer}`,
  };
}

export async function sendCancellationEmail(to: string, event: CancellationEmailEvent, options: { apiKey?: string; from?: string; fetch?: typeof fetch } = {}): Promise<ResendResult> {
  const apiKey = options.apiKey ?? process.env.RESEND_API_KEY;
  const from = options.from ?? process.env.RESEND_FROM;
  if (!apiKey || !from) return { ok: false, reason: "not_configured" };

  try {
    const response = await (options.fetch ?? fetch)("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "eventcalendar-app/1.0",
      },
      body: JSON.stringify(buildCancellationEmail(to, event, from)),
    });
    if (!response.ok) return { ok: false, reason: `resend_${response.status}` };
    return { ok: true };
  } catch {
    return { ok: false, reason: "resend_request_failed" };
  }
}
