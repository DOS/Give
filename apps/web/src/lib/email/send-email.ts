import nodemailer from "nodemailer"

// Email transporter configuration
export const createTransporter = () => {
  // For development, use Ethereal Email or local SMTP
  if (process.env.NODE_ENV === "development") {
    return nodemailer.createTransport({
      host: "localhost",
      port: 1025, // MailHog or similar
      secure: false,
      ignoreTLS: true,
    })
  }

  // For production, use real SMTP service
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
}

export async function sendEmail(options: {
  to: string
  subject: string
  html: string
  text?: string
}) {
  return createTransporter().sendMail({
    from: process.env.SMTP_FROM || "Give Platform <noreply@give.local>",
    ...options,
  })
}
