import { render } from "@react-email/render"

import { createTransporter } from "./send-email"

// Email template component
interface DonationReceiptProps {
  donorName: string
  amount: number
  currency: string
  projectTitle: string
  transactionId: string
  donationDate: string
  message?: string
}

const DonationReceiptEmail = ({
  donorName,
  amount,
  currency,
  projectTitle,
  transactionId,
  donationDate,
  message,
}: DonationReceiptProps) => {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Thank you for your donation!</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #f8f9fa; padding: 20px; text-align: center; border-radius: 8px; }
          .content { padding: 20px 0; }
          .receipt { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .receipt-item { display: flex; justify-content: space-between; margin: 10px 0; }
          .footer { text-align: center; color: #666; font-size: 14px; margin-top: 40px; }
          .button { background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Thank You for Your Support! ❤️</h1>
          </div>
          
          <div class="content">
            <p>Dear ${donorName || "Generous Supporter"},</p>
            
            <p>Thank you for your generous donation to <strong>${projectTitle}</strong>. Your support means the world to us and brings us one step closer to our goal.</p>
            
            <div class="receipt">
              <h3>Donation Receipt</h3>
              <div class="receipt-item">
                <span>Transaction ID:</span>
                <span>${transactionId}</span>
              </div>
              <div class="receipt-item">
                <span>Date:</span>
                <span>${donationDate}</span>
              </div>
              <div class="receipt-item">
                <span>Amount:</span>
                <span><strong>${currency} ${amount}</strong></span>
              </div>
              <div class="receipt-item">
                <span>Project:</span>
                <span>${projectTitle}</span>
              </div>
              ${
                message
                  ? `
                <div class="receipt-item">
                  <span>Your Message:</span>
                  <span>"${message}"</span>
                </div>
              `
                  : ""
              }
            </div>
            
            <p>This receipt serves as confirmation of your donation. Please keep it for your records.</p>
            
            <center>
              <a href="${process.env.NEXT_PUBLIC_APP_URL}/projects" class="button">
                View More Projects
              </a>
            </center>
          </div>
          
          <div class="footer">
            <p>Thank you for making a difference!</p>
            <p>Give Platform | ${new Date().getFullYear()}</p>
            <p>This is an automated email. Please do not reply.</p>
          </div>
        </div>
      </body>
    </html>
  `
}

// Send donation receipt
export async function sendDonationReceipt(
  email: string,
  donation: {
    id: string
    Amount: number
    Currency: string
    GiverName?: string
    Message?: string
    PaymentId: string
    createdAt: string
    Project: {
      Title: string
    }
  }
) {
  try {
    const transporter = createTransporter()

    const html = DonationReceiptEmail({
      donorName: donation.GiverName || "Anonymous",
      amount: donation.Amount,
      currency: donation.Currency,
      projectTitle: donation.Project.Title,
      transactionId: donation.PaymentId,
      donationDate: new Date(donation.createdAt).toLocaleDateString(),
      message: donation.Message,
    })

    const mailOptions = {
      from: process.env.SMTP_FROM || "Give Platform <noreply@give.local>",
      to: email,
      subject: `Thank you for supporting ${donation.Project.Title}!`,
      html,
    }

    const info = await transporter.sendMail(mailOptions)
    console.log("Email sent:", info.messageId)

    return { success: true, messageId: info.messageId }
  } catch (error) {
    console.error("Email send error:", error)
    return { success: false, error }
  }
}

// Send refund notification
export async function sendRefundNotification(
  email: string,
  donation: {
    Amount: number
    Currency: string
    PaymentId: string
    Project: {
      Title: string
    }
  },
  reason?: string
) {
  try {
    const transporter = createTransporter()

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Refund Processed</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #fee2e2; padding: 20px; text-align: center; border-radius: 8px; }
            .content { padding: 20px 0; }
            .info { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Refund Processed</h1>
            </div>
            
            <div class="content">
              <p>Your refund has been processed for the following donation:</p>
              
              <div class="info">
                <p><strong>Project:</strong> ${donation.Project.Title}</p>
                <p><strong>Amount:</strong> ${donation.Currency} ${donation.Amount}</p>
                <p><strong>Transaction ID:</strong> ${donation.PaymentId}</p>
                ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ""}
              </div>
              
              <p>The refund should appear in your account within 5-10 business days.</p>
              
              <p>If you have any questions, please contact our support team.</p>
            </div>
          </div>
        </body>
      </html>
    `

    const mailOptions = {
      from: process.env.SMTP_FROM || "Give Platform <noreply@give.local>",
      to: email,
      subject: "Refund Processed - Give Platform",
      html,
    }

    await transporter.sendMail(mailOptions)
    return { success: true }
  } catch (error) {
    console.error("Refund email error:", error)
    return { success: false, error }
  }
}
