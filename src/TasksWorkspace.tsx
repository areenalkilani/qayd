import { FormEvent, useEffect, useState } from "react"
import { api, Session } from "./api"
import { Badge, Button, Field, ModalShell, PageHeader } from "./components/UI"

type Person = { id: string; fullName: string }
type Task = { id: string; title: string; description: string; dueAt: string; priority: string; status: string; version: number; caseId: string | null; assigned: Person; case: { id: string; internalNumber: string } | null }
type Page<T> = { items: T[]; total: number }
type Hearing = { id: string; scheduledAt: string | null; status: string; case: { internalNumber: string }; lawyer: Person }
type Procedure = { id: string; title: string; dueAt: string; status: string; case: { internalNumber: string }; assigned: Person }
const fmt = (value: string) => new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value))
const iso = (value: string) => new Date(value).toISOString()
function useData<T>(path: string) { const [data, setData] = useState<T | null>(null); const [error, setError] = useState(""); const [key, setKey] = useState(0); useEffect(() => { let live = true; api<T>(path).then(v => live && setData(v)).catch(e => live && setError(e.message)); return () => { live = false }; }, [path, key]); return { data, error, reload: () => setKey(v => v + 1) } }

export default function TasksWorkspace({ page, session }: { page: "tasks" | "calendar"; session: Session }) {
  const tasks = useData<Page<Task>>("/tasks?status=OPEN")
  const hearings = useData<Page<Hearing>>("/legal/hearings?search=")
  const procedures = useData<Page<Procedure>>("/legal/procedures?search=")
  const [form, setForm] = useState(false); const [error, setError] = useState("")
  const writable = session.user.role === "OWNER" || session.user.permissions.includes("cases.write")
  async function complete(task: Task) { setError(""); try { await api(`/tasks/${task.id}/status`, { status: "DONE", completionNote: "", version: task.version }); tasks.reload() } catch (e) { setError((e as Error).message) } }
  const now = new Date(); const end = new Date(now.getTime() + 7 * 86400000)
  const entries = [...(hearings.data?.items || []).filter(x => x.scheduledAt && new Date(x.scheduledAt) >= now && new Date(x.scheduledAt) <= end).map(x => ({ id: `h-${x.id}`, at: x.scheduledAt!, kind: "جلسة", text: `${x.case.internalNumber} — ${x.lawyer.fullName}` })), ...(tasks.data?.items || []).filter(x => new Date(x.dueAt) <= end).map(x => ({ id: `t-${x.id}`, at: x.dueAt, kind: "مهمة", text: x.title })), ...(procedures.data?.items || []).filter(x => x.status === "OPEN" && new Date(x.dueAt) <= end).map(x => ({ id: `p-${x.id}`, at: x.dueAt, kind: "إجراء", text: x.title }))].sort((a, b) => +new Date(a.at) - +new Date(b.at))
  return <><PageHeader title={page === "tasks" ? "مهام العمل" : "التقويم والمهام"} text={page === "tasks" ? "مهام مرتبطة بالمكتب والقضايا ومحفوظة في قاعدة البيانات" : "عرض أسبوعي موحّد من الجلسات والإجراءات والمهام الفعلية"} actions={writable && <Button onClick={() => setForm(true)}>إضافة مهمة</Button>} />
    {error && <div className="alert-box warning">{error}</div>}
    {page === "calendar" && <section className="panel live-pad"><h3>الأيام السبعة القادمة</h3>{entries.length ? <div className="calendar-list">{entries.map(e => <article key={e.id}><Badge tone={e.kind === "جلسة" ? "info" : e.kind === "مهمة" ? "warning" : "neutral"}>{e.kind}</Badge><div><b>{e.text}</b><small>{fmt(e.at)}</small></div></article>)}</div> : <p>لا توجد مواعيد خلال الأسبوع القادم.</p>}</section>}
    <section className="panel table-panel"><div className="panel-head"><h3>{page === "tasks" ? "المهام المفتوحة" : "مهام الأسبوع"}</h3><Button variant="secondary" onClick={tasks.reload}>تحديث</Button></div><div className="table-wrap"><table><thead><tr><th>المهمة</th><th>القضية</th><th>المكلّف</th><th>الموعد</th><th>الأولوية</th><th>الإجراء</th></tr></thead><tbody>{(tasks.data?.items || []).filter(x => page === "tasks" || new Date(x.dueAt) <= end).map(t => <tr key={t.id}><td><b>{t.title}</b><small>{t.description}</small></td><td>{t.case?.internalNumber || "مهمة مكتب"}</td><td>{t.assigned.fullName}</td><td>{fmt(t.dueAt)}</td><td><Badge tone={t.priority === "URGENT" ? "danger" : t.priority === "HIGH" ? "warning" : "neutral"}>{t.priority === "URGENT" ? "عاجل" : t.priority === "HIGH" ? "مرتفع" : "عادي"}</Badge></td><td>{writable && <Button variant="secondary" onClick={() => void complete(t)}>إتمام</Button>}</td></tr>)}{!tasks.data?.items.length && <tr><td colSpan={6}>لا توجد مهام مفتوحة.</td></tr>}</tbody></table></div></section>
    {form && <TaskForm close={() => setForm(false)} saved={() => { setForm(false); tasks.reload() }} />}</>
}
function TaskForm({ close, saved }: { close: () => void; saved: () => void }) {
  const people = useData<Person[]>("/legal/options/employees"); const cases = useData<{ id: string; internalNumber: string }[]>("/legal/options/cases"); const [error, setError] = useState("")
  async function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const data = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>; setError(""); try { await api("/tasks", { ...data, caseId: data.caseId || null, dueAt: iso(data.dueAt) }); saved() } catch (x) { setError((x as Error).message) } }
  return <ModalShell title="إضافة مهمة" onClose={close}><form onSubmit={submit}><Field label="عنوان المهمة"><input name="title" required maxLength={250} /></Field><Field label="القضية (اختياري)"><select name="caseId"><option value="">مهمة مكتب غير مرتبطة بقضية</option>{cases.data?.map(x => <option value={x.id} key={x.id}>{x.internalNumber}</option>)}</select></Field><Field label="الموظف المكلّف"><select name="assignedId" required><option value="">اختر من القائمة</option>{people.data?.map(x => <option value={x.id} key={x.id}>{x.fullName}</option>)}</select></Field><Field label="الموعد النهائي"><input name="dueAt" type="datetime-local" required /></Field><Field label="الأولوية"><select name="priority" defaultValue="NORMAL"><option value="NORMAL">عادي</option><option value="HIGH">مرتفع</option><option value="URGENT">عاجل</option></select></Field><Field label="التفاصيل"><textarea name="description" maxLength={5000} /></Field>{error && <div className="alert-box warning">{error}</div>}<div className="modal-actions"><Button variant="secondary" onClick={close}>إلغاء</Button><Button type="submit">حفظ</Button></div></form></ModalShell>
}
