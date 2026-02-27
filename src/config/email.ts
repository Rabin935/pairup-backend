import nodemailer from "nodemailer";

const EMAIL_USER = process.env.EMAIL_USER || "";
const EMAIL_PASS = process.env.EMAIL_PASS || "";
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || EMAIL_USER || "support@pairup.app";

if (!EMAIL_USER || !EMAIL_PASS) {
  console.warn("Warning: EMAIL_USER or EMAIL_PASS environment variables are not configured");
}

export const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
});

export const sendEmail = async (
  to: string,
  subject: string,
  htmlContent: string
) => {
  if (!EMAIL_USER || !EMAIL_PASS) {
    throw new Error(
      "Email service is not configured. Please set EMAIL_USER and EMAIL_PASS environment variables."
    );
  }

  return transporter.sendMail({
    from: `PairUp <${EMAIL_USER}>`,
    to,
    subject,
    html: htmlContent,
  });
};

const buildBanNotificationHtml = (reason: string) => `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PairUp Account Notice</title>
  </head>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:20px 24px;background:#0f172a;color:#ffffff;">
                <h1 style="margin:0;font-size:20px;line-height:28px;">PairUp</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <h2 style="margin:0 0 12px;font-size:18px;line-height:26px;">Account Ban Notification</h2>
                <p style="margin:0 0 12px;font-size:14px;line-height:22px;">
                  Your PairUp account has been banned due to a policy violation.
                </p>
                <p style="margin:0 0 6px;font-size:14px;line-height:22px;font-weight:700;">
                  Reason for ban:
                </p>
                <p style="margin:0 0 16px;font-size:14px;line-height:22px;color:#334155;">
                  ${reason}
                </p>
                <p style="margin:0 0 8px;font-size:14px;line-height:22px;">
                  If you believe this is incorrect, you may appeal by contacting our support team.
                </p>
                <p style="margin:0 0 4px;font-size:14px;line-height:22px;">
                  Support: <a href="mailto:${SUPPORT_EMAIL}" style="color:#be123c;text-decoration:none;">${SUPPORT_EMAIL}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;">
                <p style="margin:0;font-size:12px;line-height:18px;color:#64748b;">
                  This is an automated message from PairUp.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

type BanEmailPayload = {
  to: string;
  reason: string;
};

export const sendBanNotificationEmail = async ({ to, reason }: BanEmailPayload) => {
  return sendEmail(
    to,
    "PairUp Account Ban Notice",
    buildBanNotificationHtml(reason)
  );
};
