import { useEffect, useState } from 'react';
import { api } from './api';
import { Button, Field } from './components/UI';
interface ContactData { email: string; phone: string; whatsapp: string; facebook: string; instagram: string }
const empty: ContactData = { email: '', phone: '', whatsapp: '', facebook: '', instagram: '' };
export function ContactLinks({ floating = false }: { floating?: boolean }) {
  const [data, setData] = useState(empty);
  useEffect(() => { let active = true; api<ContactData>('/contact').then(v => { if (active) setData(v); }).catch(() => {}); return () => { active = false; }; }, []);
  const whatsapp = data.whatsapp ? `https://wa.me/${data.whatsapp.replace(/\D/g, '')}` : '';
  if (floating) return whatsapp ? <a className="floating-whatsapp" href={whatsapp} target="_blank" rel="noreferrer" aria-label="تواصل عبر واتساب"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-11.7 7L3 20l1.5-5.3A8 8 0 1 1 20 11.5Z"/><path d="M8 7c0 4 3 7 7 7l1-2-2-1-1 1c-1.5-.5-2.5-1.5-3-3l1-1-1-2Z"/></svg></a> : null;
  const links = [
    { key: 'email', label: 'البريد الإلكتروني', href: data.email ? `mailto:${data.email}` : '' },
    { key: 'phone', label: 'اتصل بنا', href: data.phone ? `tel:${data.phone.replace(/[ ()-]/g, '')}` : '' },
    { key: 'whatsapp', label: 'واتساب', href: whatsapp },
    { key: 'facebook', label: 'فيسبوك', href: data.facebook },
    { key: 'instagram', label: 'إنستغرام', href: data.instagram },
  ];
  return <div className="contact-links">{links.filter(link => link.href).map(link => <a key={link.key} className={`contact-icon contact-${link.key}`} href={link.href} aria-label={link.label} title={link.label} {...(link.href.startsWith('https:') ? { target: '_blank', rel: 'noreferrer' } : {})}><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {link.key === 'email' && <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 6 9 7 9-7" /></>}
    {link.key === 'phone' && <path d="M7 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-3l-5-2-2 2a14 14 0 0 1-7-7l2-2-2-5Z" />}
    {link.key === 'whatsapp' && <><path d="M20 11.5a8 8 0 0 1-11.7 7L3 20l1.5-5.3A8 8 0 1 1 20 11.5Z" /><path d="M8 7c0 4 3 7 7 7l1-2-2-1-1 1c-1.5-.5-2.5-1.5-3-3l1-1-1-2Z" /></>}
    {link.key === 'facebook' && <path d="M14 22V12h3l.5-4H14V6c0-1 .5-2 2-2h2V1h-3c-3 0-5 2-5 5v2H7v4h3v10" />}
    {link.key === 'instagram' && <><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r=".7" fill="currentColor" stroke="none" /></>}
  </svg></a>)}</div>;
}
export default function ContactSettings() {
  const [data, setData] = useState<ContactData | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<ContactData>('/contact').then(setData).catch(e => setMessage(e.message)); }, []);
  return <section className="panel live-pad"><h2>معلومات تواصل مالك المنصة</h2><p>تظهر المعلومات المحفوظة في صفحة الموقع. أضف رقم واتساب مع رمز الدولة لتفعيل زر التواصل الثابت.</p>{data && <form onSubmit={async e => { e.preventDefault(); setBusy(true); setMessage(''); try { await api('/contact', data); setMessage('تم حفظ معلومات التواصل.'); } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); } }}>
    {(Object.keys(empty) as (keyof ContactData)[]).map(key => <Field key={key} label={{ email: 'البريد الإلكتروني للتواصل', phone: 'رقم المكالمات', whatsapp: 'رقم واتساب مع رمز الدولة', facebook: 'رابط فيسبوك', instagram: 'رابط إنستغرام' }[key]}><input dir="ltr" type={key === 'email' ? 'email' : ['facebook', 'instagram'].includes(key) ? 'url' : 'tel'} value={data[key]} onChange={e => setData({ ...data, [key]: e.target.value })} maxLength={500} /></Field>)}
    <Button type="submit" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ معلومات التواصل'}</Button></form>}{message && <p role="status">{message}</p>}</section>;
}
