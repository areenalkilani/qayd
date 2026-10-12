import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { Button, Icon, ModalShell } from './components/UI';
interface Notification { key: string; title: string; message: string; at: string; read: boolean }
interface Result { items: Notification[]; unread: number }
export function NotificationBell({ open }: { open: () => void }) {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let active = true;
    const refresh = () => { void api<Result>('/notifications').then(result => { if (active) setUnread(result.unread); }).catch(() => {}); };
    refresh(); const timer = setInterval(refresh, 30000);
    window.addEventListener('notifications-read', refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener('notifications-read', refresh); };
  }, []);
  return <button className="icon-btn notification-bell" aria-label="الإشعارات" onClick={open}><Icon name="bell" />{unread > 0 && <span className="notification-count" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}</button>;
}
export default function Notifications({ close }: { close: () => void }) {
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const reload = useCallback(async () => {
    try { const result = await api<Result>('/notifications'); setData(result); setError(''); }
    catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { void reload(); const timer = setInterval(() => { void reload(); }, 30000); return () => clearInterval(timer); }, [reload]);
  return <ModalShell title="الإشعارات" onClose={close}><div className="live-pad">
    <div className="notification-toolbar"><span>{data ? `${data.unread} غير مقروء` : 'جارٍ تحميل الإشعارات…'}</span><Button variant="secondary" onClick={() => { void reload(); }}>تحديث</Button></div>
    {error && <p className="alert-box warning" role="alert">{error}</p>}
    {data?.items.length === 0 && <p>لا توجد إشعارات حاليًا.</p>}
    {data?.items.map(item => <article className={`notification-card ${item.read ? '' : 'unread'}`} key={item.key}><h3>{item.title}</h3><p>{item.message}</p><time dir="ltr" dateTime={item.at}>{new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(item.at))}</time>{!item.read && <Button variant="ghost" disabled={busy === item.key} onClick={() => { setBusy(item.key); void api('/notifications/read', { key: item.key }).then(async () => { await reload(); window.dispatchEvent(new Event('notifications-read')); }).catch(e => setError(e.message)).finally(() => setBusy('')); }}>تحديد كمقروء</Button>}</article>)}
  </div></ModalShell>;
}
