import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { readConfig } from './config';
@Injectable()
export class Mail {
  configured() { const c = readConfig(); return !!(c.SMTP_HOST && c.MAIL_FROM); }
  async sendLink(email: string, kind: 'reset' | 'invite' | 'verify', token: string) {
    const c = readConfig();
    if (!this.configured()) throw new ServiceUnavailableException('Email delivery is not configured');
    const transport = nodemailer.createTransport({ host: c.SMTP_HOST, port: c.SMTP_PORT, secure: c.SMTP_PORT === 465, requireTLS: c.NODE_ENV === 'production', auth: c.SMTP_USER ? { user: c.SMTP_USER, pass: c.SMTP_PASSWORD } : undefined });
    try { await transport.sendMail({ from: c.MAIL_FROM, to: email, subject: 'قيد | رابط الحساب', text: `رابط حساب قيد (صالح لمدة ساعة):\n${c.APP_ORIGIN}/#${kind}=${token}\nإذا لم تطلب هذا الإجراء، تجاهل الرسالة.` }); }
    catch { throw new ServiceUnavailableException('Email delivery failed; please retry'); }
    finally { transport.close(); }
  }
}
