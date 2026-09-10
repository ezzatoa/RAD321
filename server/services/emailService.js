const nodemailer = require('nodemailer');
const { getDatabase } = require('../db/database');

const emailService = {
  // Get active SMTP transport configuration
  getTransporter() {
    const db = getDatabase();
    const host = db.prepare("SELECT value FROM system_settings WHERE key = 'smtp_host'").get()?.value || process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = parseInt(db.prepare("SELECT value FROM system_settings WHERE key = 'smtp_port'").get()?.value || process.env.SMTP_PORT || '465', 10);
    const user = db.prepare("SELECT value FROM system_settings WHERE key = 'smtp_user'").get()?.value || process.env.SMTP_USER || 'ezzatoa@gmail.com';
    const rawPass = db.prepare("SELECT value FROM system_settings WHERE key = 'smtp_pass'").get()?.value || process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;
    // Gmail displays app passwords with spaces; SMTP auth requires them stripped.
    const pass = rawPass ? String(rawPass).replace(/\s+/g, '') : rawPass;

    if (!host || !user || !pass) {
      return null; // SMTP not configured; fallback to internal outbox logging
    }

    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass }
    });
  },

  // Record an email in the internal Outbox
  recordOutbox({ toEmail, toName, subject, htmlBody, tokenLink, status = 'logged', errorMessage = null }) {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO outbox_emails (to_email, to_name, subject, html_body, token_link, status, error_message, sent_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const sentAt = (status === 'sent' || status === 'logged') ? new Date().toISOString() : null;
    const result = stmt.run(toEmail, toName || '', subject, htmlBody, tokenLink || null, status, errorMessage, sentAt);
    return result.lastInsertRowid;
  },

  // Send activation email with one-time token link
  async sendActivationEmail(user, token, appUrl = null) {
    const db = getDatabase();
    const resolvedUrl = appUrl || process.env.APP_BASE_URL || db.prepare("SELECT value FROM system_settings WHERE key = 'app_url'").get()?.value || 'http://localhost:3000';
    const activationLink = `${resolvedUrl.replace(/\/$/, '')}/activate/${token}`;
    const subject = 'RAD 321 — Account Registration Approved & Password Setup';
    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #0b2545 0%, #134e70 100%); padding: 28px 24px; color: #ffffff; text-align: center;">
          <div style="font-size: 13px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: #7fe0d6;">Taibah University · Diagnostic Radiology Technology</div>
          <h1 style="margin: 8px 0 0; font-size: 22px; font-weight: 800; color: #ffffff;">RAD 321: Image Recording &amp; Analysis</h1>
          <p style="margin: 6px 0 0; font-size: 14px; opacity: 0.9;">Department Virtual Laboratory Platform</p>
        </div>
        <div style="padding: 28px 24px; color: #1e293b; line-height: 1.6;">
          <p style="font-size: 16px; margin-top: 0;">Dear <strong>${user.name}</strong>,</p>
          <p>Your registration for the <strong>RAD 321 Laboratory Course</strong> has been reviewed and <span style="color: #059669; font-weight: 700;">APPROVED</span> by the department administrator.</p>
          <div style="background: #f8fafc; border-left: 4px solid #007a78; border-radius: 6px; padding: 14px 18px; margin: 20px 0;">
            <div style="font-size: 13px; color: #64748b;">Student Name: <strong style="color: #0b2545;">${user.name}</strong></div>
            <div style="font-size: 13px; color: #64748b;">Student ID: <strong style="color: #0b2545;">${user.student_id || 'N/A'}</strong></div>
            <div style="font-size: 13px; color: #64748b;">Assigned Role: <strong style="color: #0b2545;">Student</strong></div>
          </div>
          <p>Please click the button below to activate your account and establish your secure password. This one-time activation link is valid for <strong>7 days</strong>:</p>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${activationLink}" style="background: #007a78; color: #ffffff; text-decoration: none; padding: 13px 28px; font-size: 15px; font-weight: 700; border-radius: 8px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">Activate Account &amp; Set Password</a>
          </div>
          <p style="font-size: 12px; color: #64748b; margin-top: 24px; word-break: break-all;">
            If the button above does not work, copy and paste this URL into your browser:<br>
            <a href="${activationLink}" style="color: #007a78;">${activationLink}</a>
          </p>
        </div>
        <div style="background: #f1f5f9; padding: 14px 24px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0;">
          Department of Diagnostic Radiology Technology · College of Applied Medical Sciences · Taibah University
        </div>
      </div>
    `;

    const transporter = this.getTransporter();
    let status = 'logged';
    let errorMessage = null;

    if (transporter) {
      const db = getDatabase();
      const fromAddr = db.prepare("SELECT value FROM system_settings WHERE key = 'smtp_from'").get()?.value || 'RAD 321 Portal <noreply@taibahu.edu.sa>';
      try {
        await transporter.sendMail({
          from: fromAddr,
          to: user.email,
          subject,
          html: htmlBody
        });
        status = 'sent';
      } catch (err) {
        console.error('SMTP sending error:', err);
        status = 'failed';
        errorMessage = err.message;
      }
    }

    // Always record to Outbox for local audit & offline VPS visibility
    this.recordOutbox({
      toEmail: user.email,
      toName: user.name,
      subject,
      htmlBody,
      tokenLink: activationLink,
      status,
      errorMessage
    });

    return { status, activationLink };
  },

  // Send announcement / mass email to section or students
  async sendAnnouncementEmail({ recipients, subject, body, senderName = 'RAD 321 Instructor' }) {
    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #ffffff;">
        <div style="background: #0b2545; padding: 22px 24px; color: #ffffff;">
          <div style="font-size: 12px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #7fe0d6;">RAD 321 Laboratory Announcement</div>
          <h2 style="margin: 6px 0 0; font-size: 20px; font-weight: 700; color: #ffffff;">${subject}</h2>
        </div>
        <div style="padding: 24px; color: #1e293b; line-height: 1.6; white-space: pre-line;">
          ${body}
        </div>
        <div style="background: #f8fafc; padding: 14px 24px; font-size: 13px; color: #64748b; border-top: 1px solid #e2e8f0;">
          Sent by: <strong>${senderName}</strong> · RAD 321 Course Management
        </div>
      </div>
    `;

    const transporter = this.getTransporter();
    const results = [];

    for (const recipient of recipients) {
      let status = 'logged';
      let errorMessage = null;

      if (transporter) {
        const db = getDatabase();
        const fromAddr = db.prepare("SELECT value FROM system_settings WHERE key = 'smtp_from'").get()?.value || 'RAD 321 Portal <noreply@taibahu.edu.sa>';
        try {
          await transporter.sendMail({
            from: fromAddr,
            to: recipient.email,
            subject,
            html: htmlBody
          });
          status = 'sent';
        } catch (err) {
          status = 'failed';
          errorMessage = err.message;
        }
      }

      this.recordOutbox({
        toEmail: recipient.email,
        toName: recipient.name || '',
        subject,
        htmlBody,
        tokenLink: null,
        status,
        errorMessage
      });

      results.push({ email: recipient.email, status });
    }

    return results;
  },

  // Test SMTP connection
  async testSmtp(toEmail) {
    const transporter = this.getTransporter();
    if (!transporter) {
      throw new Error('SMTP credentials are not configured in System Settings.');
    }

    const db = getDatabase();
    const fromAddr = db.prepare("SELECT value FROM system_settings WHERE key = 'smtp_from'").get()?.value || 'RAD 321 Portal <noreply@taibahu.edu.sa>';

    await transporter.verify();
    await transporter.sendMail({
      from: fromAddr,
      to: toEmail,
      subject: 'RAD 321 Portal — SMTP Configuration Test',
      html: '<p>This is a successful test email from your local RAD 321 department VPS laboratory portal.</p>'
    });

    return { success: true, message: `Test email successfully sent to ${toEmail}` };
  }
};

module.exports = emailService;
