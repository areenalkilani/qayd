import PhoneLinks from './PhoneLinks';
import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { api, Office, Page } from './api';
import { Badge, Button, Field, ModalShell, PageHeader } from './components/UI';
import PasswordInput from './PasswordInput';
const date = (v: string) => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(v));
const states: Record<string, string> = { PENDING_APPROVAL: 'بانتظار الموافقة', MORE_INFO: 'مطلوب معلومات', REJECTED: 'مرفوض', SUSPENDED: 'موقوف', APPROVED: 'مفعّل' };
interface Payment { id: string; officeName: string; amount: string; currency: string; method: string; reference: string; cardLast4: string; paidAt: string }
function ActionForm({ children, label, save, done }: { children?: ReactNode; label: string; save: (v: Record<string, string>) => Promise<unknown>; done: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError('');
    try { await save(Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>); done(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <form onSubmit={submit}>{children}{error && <p role="alert" className="alert-box warning">{error}</p>}<div className="modal-actions"><Button type="submit" disabled={busy}>{busy ? 'جارٍ التنفيذ…' : label}</Button></div></form>;
}
function Text({ name, label, type = 'text', required = true }: { name: string; label: string; type?: string; required?: boolean }) {
  return <Field label={label}><input name={name} type={type} required={required} maxLength={120} /></Field>;
}
export default function PlatformWorkspace({ page: section }: { page: string }) {
  const payments = section === 'platform-payments';
  const subscribers = section !== 'trials' && !payments;
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [version, setVersion] = useState(0);
  const [data, setData] = useState<Page<Office | Payment> | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [selected, setSelected] = useState<Office | null>(null);
  const [action, setAction] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true; setBusy(true); setError('');
    const endpoint = payments ? 'payments' : `offices?group=${subscribers ? 'SUBSCRIBERS' : 'TRIALS'}`;
    api<Page<Office | Payment>>(`/platform/${endpoint}${payments ? '?' : '&'}page=${page}&search=${encodeURIComponent(search)}`).then(v => { if (active) setData(v); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [page, search, version, payments, subscribers]);
  const open = (office: Office, next: string) => { setSelected(office); setAction(next); setMessage(''); };
  const done = () => { setSelected(null); setAction(''); setVersion(v => v + 1); setMessage(action === 'approve' ? 'تم قبول التجربة ونقل الحساب إلى حسابات المشتركين.' : action === 'subscribe' ? 'تم تسجيل الدفعة وتثبيت الاشتراك. الحساب موجود الآن في حسابات المشتركين.' : action === 'delete' ? 'تم حذف الحساب وبياناته من النظام. تُستكمل إزالة أي مرفقات متبقية تلقائيًا.' : 'تم حفظ الإجراء بنجاح.'); };
  return <><PageHeader title={payments ? 'الدفعات' : subscribers ? 'حسابات المشتركين' : 'طلبات التجربة'} text={payments ? '' : subscribers ? 'المشتركون الحاليون والسابقون؛ انتهاء الاشتراك أو إيقافه لا يحذف البيانات' : 'طلبات الحسابات التي لم تبدأ تجربتها أو اشتراكها بعد'} />
    {message && <p className="alert-box info" role="status">{message}</p>}
    <section className="panel table-panel"><div className="table-tools"><input aria-label="بحث في الحسابات والدفعات" placeholder="ابحث باسم المكتب أو مرجع الدفعة" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /><Button variant="secondary" onClick={() => setVersion(v => v + 1)}>تحديث</Button></div>
      {error && <p className="alert-box warning" role="alert">{error}</p>}{busy ? <p className="live-pad">جارٍ التحميل…</p> : <div className="table-wrap"><table><thead><tr>{(payments ? ['المكتب', 'المبلغ', 'طريقة الدفع', 'المرجع', 'التاريخ'] : ['المكتب وصاحبه', 'الحالة', 'نهاية التجربة / الاشتراك', 'التواصل', 'الإجراءات']).map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{data?.items.map(item => {
        if (payments) { const p = item as Payment; return <tr key={p.id}><td>{p.officeName}</td><td>{p.amount} {p.currency}</td><td>{p.method === 'CASH' ? 'كاش' : `فيزا •••• ${p.cardLast4}`}</td><td>{p.reference}</td><td>{date(p.paidAt)}</td></tr>; }
        const o = item as Office; const owner = o.users?.[0]; const expiry = o.subscriptions[0]?.expiresAt || o.trial?.expiresAt;
        return <tr key={o.id}><td><b>{o.name}</b><small>{owner?.fullName}</small><small dir="ltr">{owner?.email}</small></td><td><Badge>{o.status === 'APPROVED' && expiry && new Date(expiry) <= new Date() ? 'منتهي' : o.status === 'APPROVED' ? (o.subscriptions.length ? 'اشتراك' : 'تجربة') : states[o.status]}</Badge></td><td>{expiry ? date(expiry) : 'لم تبدأ'}</td><td>{owner?.phone ? <PhoneLinks phone={owner.phone} /> : '—'}</td><td><div className="platform-actions">
          {!o.trial && !o.subscriptions.length && ['PENDING_APPROVAL', 'MORE_INFO'].includes(o.status) && <Button onClick={() => open(o, 'approve')}>قبول التجربة</Button>}
          {!!o.trial && !o.subscriptions.length && ['APPROVED', 'SUSPENDED'].includes(o.status) && <Button variant="secondary" onClick={() => open(o, 'extend')}>تمديد التجربة</Button>}
          <Button variant="secondary" onClick={() => open(o, 'subscribe')}>{o.subscriptions.length ? 'تجديد الاشتراك وتسجيل دفعة' : 'تثبيت الاشتراك'}</Button>
          {['APPROVED', 'SUSPENDED'].includes(o.status) && <Button variant="secondary" onClick={() => open(o, 'status')}>{o.status === 'SUSPENDED' ? 'إعادة التفعيل' : o.subscriptions.length ? 'إيقاف الاشتراك' : 'إيقاف التجربة'}</Button>}
          <Button variant="ghost" onClick={() => open(o, 'delete')}>حذف الحساب</Button>
        </div></td></tr>;
      })}</tbody></table>{data?.total === 0 && <p className="live-pad">لا توجد سجلات مطابقة.</p>}</div>}
      <div className="pagination"><span>{data?.total || 0} سجل — صفحة {page}</span><div><button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>السابق</button><button disabled={!data || page * 20 >= data.total} onClick={() => setPage(p => p + 1)}>التالي</button></div></div>
    </section>
    {selected && <ModalShell title={`${({ approve: 'قبول التجربة', extend: 'تمديد التجربة', subscribe: 'تثبيت الاشتراك وتسجيل الدفعة', status: 'تغيير حالة الوصول', delete: 'حذف الحساب نهائيًا' } as Record<string, string>)[action]} — ${selected.name}`} onClose={() => setSelected(null)}>
      {action === 'approve' && <ActionForm label="قبول وبدء تجربة 7 أيام" save={() => api(`/platform/offices/${selected.id}/review`, { decision: 'APPROVE', note: '' })} done={done}><p>تبدأ التجربة الآن، وتبقى جميع بيانات المكتب محفوظة عند انتهائها.</p></ActionForm>}
      {action === 'extend' && <ActionForm label="تأكيد تمديد التجربة" save={v => api(`/platform/offices/${selected.id}/extend-trial`, { days: Number(v.days), reason: v.reason })} done={done}><Field label="عدد الأيام الإضافية"><input name="days" type="number" min="1" max="365" defaultValue="7" required /></Field><Text name="reason" label="سبب التمديد" /><p>يُضاف التمديد لنهاية التجربة أو يبدأ من اليوم إن انتهت. الحساب الموقوف يبقى موقوفًا حتى إعادة تفعيله.</p></ActionForm>}
      {action === 'status' && <ActionForm label={selected.status === 'SUSPENDED' ? 'إعادة التفعيل' : 'تأكيد الإيقاف دون حذف البيانات'} save={v => api(`/platform/offices/${selected.id}/status`, { reason: v.reason, suspended: selected.status !== 'SUSPENDED' })} done={done}><p>الإيقاف يمنع استخدام خدمات المكتب ويحافظ على كل البيانات. إعادة التفعيل لا تمدد مدة الاشتراك أو التجربة.</p><Text name="reason" label="السبب" /></ActionForm>}
      {action === 'subscribe' && <PaymentForm office={selected} done={done} />}
      {action === 'delete' && <DeleteForm office={selected} done={done} />}
    </ModalShell>}
  </>;
}
function PaymentForm({ office, done }: { office: Office; done: () => void }) {
  const [method, setMethod] = useState('CASH');
  return <ActionForm label="تأكيد الدفعة وتثبيت الاشتراك السنوي" done={done} save={v => api(`/platform/offices/${office.id}/subscriptions`, { ...v, method, cardLast4: method === 'VISA' ? v.cardLast4 : '', paidAt: new Date(`${v.paidAt}T00:00:00`).toISOString() })}>
    <p>اشتراك لمدة سنة من الآن أو من نهاية الاشتراك الحالي. يُعاد تفعيل الحساب الموقوف عند التأكيد.</p>
    <Field label="المبلغ المدفوع"><input name="amount" type="number" min="0.01" max="999999999.99" step="0.01" required /></Field><Field label="العملة"><select name="currency"><option value="ILS">شيكل</option><option value="USD">دولار</option><option value="JOD">دينار أردني</option></select></Field>
    <Field label="طريقة الدفع"><select value={method} onChange={e => setMethod(e.target.value)}><option value="CASH">كاش</option><option value="VISA">فيزا</option></select></Field>
    <Text name="reference" label={method === 'VISA' ? 'مرجع عملية الفيزا' : 'رقم إيصال الكاش / مرجع الدفعة'} />
    {method === 'VISA' && <><Field label="آخر أربعة أرقام من البطاقة"><input name="cardLast4" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} required /></Field><p>تسجيل عملية دُفعت مسبقًا؛ لا تُدخل رقم البطاقة الكامل أو رمز الأمان.</p></>}
    <Field label="تاريخ الدفع"><input name="paidAt" type="date" required defaultValue={new Date().toLocaleDateString('en-CA')} max={new Date().toLocaleDateString('en-CA')} /></Field>
  </ActionForm>;
}
function DeleteForm({ office, done }: { office: Office; done: () => void }) {
  const [step, setStep] = useState(1);
  return step === 1 ? <><div className="alert-box warning"><b>الحذف نهائي ولا يمكن التراجع عنه من الواجهة.</b><p>سيُحذف المكتب وحسابات موظفيه وقضاياه وموكلوه ومرفقاته وتجربته واشتراكاته ودفعاته. إن أردت منع الوصول فقط استخدم الإيقاف.</p><p>النسخ الاحتياطية السابقة تخضع لدورة الاحتفاظ الخاصة بالنسخ.</p></div><Button variant="secondary" onClick={() => setStep(2)}>فهمت، انتقل لتأكيد الحذف</Button></> : <ActionForm label="حذف الحساب وكل بياناته نهائيًا" done={done} save={v => api(`/platform/offices/${office.id}/delete`, { password: v.password, officeName: v.officeName, confirmation: v.confirmation, acknowledge: v.acknowledge === 'on' })}>
    <Text name="officeName" label={`اكتب اسم المكتب للتأكيد: ${office.name}`} /><Text name="confirmation" label="اكتب DELETE للتأكيد" /><Field label="كلمة مرور مالك المنصة"><PasswordInput name="password" autoComplete="current-password" required maxLength={128} /></Field><label className="checkbox"><input type="checkbox" name="acknowledge" required /><span>أؤكد حذف هذا المكتب وجميع بياناته نهائيًا.</span></label>
  </ActionForm>;
}
