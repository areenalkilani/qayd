import Notifications from "./Notifications"
import PublicSite from "./PublicSite"
import AppShell from "./AppShell"
import { moduleInfo } from "./navigation"
import PlatformWorkspace from "./PlatformWorkspace"
import PasswordInput from "./PasswordInput"
import ContactSettings from "./Contact"
import { FormEvent, ReactNode, useCallback, useEffect, useState } from "react"
import { api, ApiError, Page, Session, User } from "./api"
import LegalWorkspace, { LegalDashboard } from "./LegalWorkspace"
import FilePanel from "./FilePanel"
import TasksWorkspace from "./TasksWorkspace"
import FinanceWorkspace from "./FinanceWorkspace"
import MessagesWorkspace from "./MessagesWorkspace"
import { Button, Field, ModalShell, PageHeader } from "./components/UI"

const roles: Record<string, string> = {
  OWNER: "مالك المكتب",
  SUPER_ADMIN: "مدير المنصة",
  LAWYER: "محامي",
  ADMINISTRATIVE: "موظف إداري",
}
const states: Record<string, string> = {
  PENDING_APPROVAL: "بانتظار الموافقة",
  MORE_INFO: "مطلوب معلومات إضافية",
  REJECTED: "مرفوض",
  APPROVED: "تمت الموافقة",
  SUSPENDED: "موقوف",
  TRIAL: "تجربة نشطة",
  SUBSCRIBED: "اشتراك نشط",
  EXPIRED: "انتهت صلاحية الوصول",
  ACTIVE: "نشط",
  INVITED: "بانتظار تفعيل الدعوة",
  DISABLED: "معطل",
}
const permissionNames: Record<string, string> = {
  "employees.manage": "إدارة الموظفين",
  "audit.read": "عرض سجل النشاط",
  "cases.read": "عرض القضايا",
  "cases.write": "إدارة القضايا",
  "hearings.manage": "إدارة الجلسات",
  "documents.manage": "إدارة المستندات",
  "finance.read": "عرض المالية",
  "finance.write": "إدارة المالية",
}
const date = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
const values = (form: HTMLFormElement) =>
  Object.fromEntries(new FormData(form).entries()) as Record<string, string>
function Notice({
  children,
  error = false,
}: {
  children: ReactNode
  error?: boolean
}) {
  return (
    <div
      className={`alert-box ${error ? "warning" : "info"}`}
      role={error ? "alert" : "status"}
    >
      {children}
    </div>
  )
}
function BusyForm({
  children,
  action,
  submit = "حفظ",
  onSuccess,
}: {
  children: ReactNode
  action: (v: Record<string, string>, form: HTMLFormElement) => Promise<unknown>
  submit?: string
  onSuccess?: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [done, setDone] = useState(false)
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    setBusy(true)
    setError("")
    setDone(false)
    try {
      await action(values(form), form)
      setDone(true)
      onSuccess?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر الحفظ")
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={send}>
      {children}
      {error && <Notice error>{error}</Notice>}
      {done && !onSuccess && <Notice>تم حفظ الإجراء بنجاح.</Notice>}
      <div className="modal-actions">
        <Button type="submit" disabled={busy}>
          {busy ? "جارٍ التنفيذ…" : submit}
        </Button>
      </div>
    </form>
  )
}
function Input({
  label,
  name,
  type = "text",
  value,
  required = true,
}: {
  label: string
  name: string
  type?: string
  value?: string
  required?: boolean
}) {
  const Component = type === "password" ? PasswordInput : "input"

  return (
    <Field label={label}>
      <Component
        aria-label={label}
        name={name}
        type={type}
        defaultValue={value}
        required={required}
        minLength={type === "password" ? 12 : undefined}
        maxLength={type === "password" ? 128 : 254}
        autoComplete={
          type === "password"
            ? "new-password"
            : type === "email"
              ? "email"
              : undefined
        }
        dir={type === "email" || type === "tel" ? "ltr" : undefined}
        pattern={undefined}
      />
    </Field>
  )
}

function AuthModal({
  mode,
  token,
  close,
  login,
  change,
}: {
  mode: string
  token: string
  close: () => void
  login: () => Promise<void>
  change: (s: string) => void
}) {
  const [registered, setRegistered] = useState(false)
  const [sent, setSent] = useState(false)
  const title: Record<string, string> = {
    login: "تسجيل الدخول",
    register: "طلب تجربة مكتب جديد",
    forgot: "استعادة كلمة المرور",
    reset: "تعيين كلمة مرور جديدة",
    invite: "تفعيل حساب الموظف",
    verify: "تأكيد البريد الإلكتروني",
  }
  return (
    <ModalShell title={title[mode] || title.login} onClose={close}>
      {registered ? (
        <div className="live-pad">
          <Notice>
            تم تسجيل طلب المكتب وبانتظار مراجعة الإدارة. لم تبدأ التجربة بعد.
            رقم الهاتف غير موثق.
          </Notice>
          <Button onClick={() => change("login")}>
            تسجيل الدخول ومتابعة الطلب
          </Button>
        </div>
      ) : sent ? (
        <div className="live-pad">
          <Notice>
            {mode === "forgot"
              ? "إذا كان الحساب موجودًا فسيصلك رابط الاستعادة عند نجاح إرسال البريد."
              : "تم تحديث الحساب. يمكنك تسجيل الدخول."}
          </Notice>
          <Button onClick={() => change("login")}>تسجيل الدخول</Button>
        </div>
      ) : (
        <BusyForm
          submit={
            mode === "register"
              ? "إرسال طلب التسجيل"
              : mode === "login"
                ? "تسجيل الدخول"
                : "متابعة"
          }
          action={async (v) => {
            if (mode === "register") {
              await api("/auth/register", v)
              setRegistered(true)
            } else if (mode === "login") {
              await api("/auth/login", v)
              await login()
              close()
            } else if (mode === "forgot") {
              await api("/auth/forgot-password", v)
              setSent(true)
            } else {
              await api(
                mode === "verify"
                  ? "/auth/verify-email"
                  : mode === "invite"
                    ? "/auth/activate"
                    : "/auth/reset-password",
                {
                  token,
                  ...(mode === "verify" ? {} : { password: v.password }),
                },
              )
              window.history.replaceState(null, "", window.location.pathname)
              setSent(true)
            }
          }}
        >
          {mode === "register" && (
            <>
              <Input label="اسم مكتب المحاماة" name="officeName" />
              <Input label="اسم المالك الكامل" name="fullName" />
              <Input label="رقم الهاتف" name="phone" type="tel" />
            </>
          )}
          {["register", "login", "forgot"].includes(mode) && (
            <Input label="البريد الإلكتروني" name="email" type="email" />
          )}
          {mode === "login" ? (
            <Field label="كلمة المرور">
              <PasswordInput
                aria-label="كلمة المرور"
                name="password"
                type="password"
                required
                maxLength={128}
                autoComplete="current-password"
              />
            </Field>
          ) : (
            mode !== "forgot" &&
            mode !== "verify" && (
              <Input
                label="كلمة المرور (12 حرفًا على الأقل)"
                name="password"
                type="password"
              />
            )
          )}
          {mode === "register" && (
            <>
              <Input
                label="تأكيد كلمة المرور"
                name="confirmPassword"
                type="password"
              />
              <Notice>تبدأ الأيام السبعة بعد موافقة إدارة المنصة.</Notice>
            </>
          )}
          {mode === "verify" && (
            <p>
              اضغط متابعة لتأكيد البريد الإلكتروني باستخدام الرابط الذي وصلك.
            </p>
          )}
          {mode === "login" && (
            <Button variant="ghost" onClick={() => change("forgot")}>
              نسيت كلمة المرور؟
            </Button>
          )}
        </BusyForm>
      )}
    </ModalShell>
  )
}

function usePage<T>(path: string) {
  const [data, setData] = useState<Page<T> | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(true)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    setBusy(true)
    setError("")
    api<Page<T>>(path)
      .then((x) => {
        if (active) setData(x)
      })
      .catch((e) => {
        if (active) {
          setData(null)
          setError(e.message)
        }
      })
      .finally(() => {
        if (active) setBusy(false)
      })
    return () => {
      active = false
    }
  }, [path, revision])
  return { data, error, busy, reload: () => setRevision((v) => v + 1) }
}
function Pager({
  page,
  total,
  change,
}: {
  page: number
  total: number
  change: (p: number) => void
}) {
  return (
    <div className="pagination">
      <span>
        {total} سجل — صفحة {page}
      </span>
      <div>
        <button disabled={page <= 1} onClick={() => change(page - 1)}>
          السابق
        </button>
        <button disabled={page * 20 >= total} onClick={() => change(page + 1)}>
          التالي
        </button>
      </div>
    </div>
  )
}

function Permissions({ current = [] }: { current?: string[] }) {
  return (
    <Field label="الصلاحيات">
      <div className="permission-grid">
        {Object.entries(permissionNames).map(([id, label]) => (
          <label key={id}>
            <input
              type="checkbox"
              name="permissions"
              value={id}
              defaultChecked={current.includes(id)}
            />
            {label}
          </label>
        ))}
      </div>
    </Field>
  )
}
function Employees({ session }: { session: Session }) {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [edit, setEdit] = useState<User | "new" | null>(null)
  const [notice, setNotice] = useState("")
  const result = usePage<User>(
    `/office/employees?page=${page}&search=${encodeURIComponent(search)}`,
  )
  return (
    <>
      <PageHeader
        title="الموظفون والصلاحيات"
        text="حسابات الموظفين وصلاحياتهم داخل المكتب"
        actions={<Button onClick={() => setEdit("new")}>إضافة موظف</Button>}
      />
      {notice && <Notice>{notice}</Notice>}
      <section className="panel table-panel">
        <div className="table-tools">
          <label>
            <input
              aria-label="البحث عن موظف"
              placeholder="اسم الموظف أو البريد"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
            />
          </label>
          <Button variant="secondary" onClick={result.reload}>
            تحديث
          </Button>
        </div>
        {result.error && <Notice error>{result.error}</Notice>}
        {result.busy ? (
          <Notice>جارٍ التحميل…</Notice>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>الموظف</th>
                  <th>الدور</th>
                  <th>الحالة</th>
                  <th>الهاتف</th>
                  <th>الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {result.data?.items.map((u) => (
                  <tr key={u.id}>
                    <td>
                      {u.fullName}
                      <small>{u.email}</small>
                    </td>
                    <td>{roles[u.role]}</td>
                    <td>{states[u.status]}</td>
                    <td dir="ltr">
                      {u.phone}
                      <small>{u.phoneVerifiedAt ? "موثق" : "غير موثق"}</small>
                    </td>
                    <td>
                      {u.role !== "OWNER" &&
                        u.id !== session.user.id &&
                        <Button variant="secondary" onClick={() => setEdit(u)}>تعديل</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {result.data?.total === 0 && <Notice>لا توجد نتائج.</Notice>}
          </div>
        )}
        <Pager page={page} total={result.data?.total || 0} change={setPage} />
      </section>
      {edit && (
        <ModalShell
          title={edit === "new" ? "إضافة موظف جديد" : `تعديل ${edit.fullName}`}
          onClose={() => setEdit(null)}
        >
          <BusyForm
            submit={edit === "new" ? "إنشاء الحساب" : "حفظ الصلاحيات"}
            action={async (v, form) => {
              const payload = {
                ...v,
                permissions: new FormData(form).getAll("permissions"),
              }
              await api(
                edit === "new"
                  ? "/office/employees"
                  : `/office/employees/${edit.id}`,
                payload,
              )
              setNotice(edit === "new" ? "تم إنشاء حساب الموظف، ويمكنه تسجيل الدخول الآن." : "تم حفظ بيانات الموظف.")
              setEdit(null)
              result.reload()
            }}
          >
            {edit === "new" && (
              <>
                <Input label="الاسم الكامل" name="fullName" />
                <Input label="البريد الإلكتروني" name="email" type="email" />
                <Input label="رقم الهاتف" name="phone" type="tel" />
                <Input label="كلمة المرور المؤقتة" name="password" type="password" />
                <Input label="تأكيد كلمة المرور" name="confirmPassword" type="password" />
              </>
            )}
            <Field label="الدور">
              <select
                name="role"
                defaultValue={edit === "new" ? "LAWYER" : edit.role}
              >
                <option value="LAWYER">محامي</option>
                <option value="ADMINISTRATIVE">إداري</option>
              </select>
            </Field>
            {edit !== "new" && (
              <Field label="الحالة">
                <select name="status" defaultValue={edit.status}>
                  <option value="ACTIVE">نشط</option>
                  <option value="DISABLED">معطل</option>
                </select>
              </Field>
            )}
            <Permissions
              current={edit === "new" ? ["cases.read"] : edit.permissions}
            />
          </BusyForm>
        </ModalShell>
      )}
    </>
  )
}

function Audit({ platform }: { platform: boolean }) {
  const [page, setPage] = useState(1)
  const actions: Record<string, string> = { LOGIN: "تسجيل الدخول", CASE_CREATED: "أنشأ قضية", CASE_UPDATED: "عدّل قضية", CASE_REASSIGNED: "غيّر المحامي المسؤول", CASE_ARCHIVED: "أرشف قضية", CASE_ACTIVE: "أعاد فتح قضية", HEARING_CREATED: "أضاف جلسة", HEARING_POSTPONED: "أجّل جلسة", HEARING_HELD: "سجّل انعقاد جلسة", PROCEDURE_CREATED: "أضاف إجراء", PROCEDURE_UPDATED: "حدّث إجراء", DOCUMENT_UPLOADED: "رفع مرفقًا", DOCUMENT_DOWNLOADED: "نزّل مرفقًا", DOCUMENTS_BULK_DOWNLOADED: "نزّل مرفقات القضية", DOCUMENTS_SELECTED_DOWNLOADED: "نزّل مرفقات محددة", EMPLOYEE_CREATED: "أنشأ حساب موظف", EMPLOYEE_PERMISSIONS_UPDATED: "عدّل صلاحيات موظف", FINANCE_ENTRY_CREATED: "سجّل قيدًا ماليًا", TASK_CREATED: "أنشأ مهمة", TASK_UPDATED: "عدّل مهمة", TASK_STATUS_UPDATED: "حدّث حالة مهمة" }
  const result = usePage<{ id: string; action: string; actorName: string; createdAt: string }>(`/${platform ? "platform" : "office"}/audit?page=${page}`)
  return (
    <>
      <PageHeader
        title="سجل النشاط"
        text="الإجراءات المحفوظة في قاعدة البيانات"
        actions={
          <Button variant="secondary" onClick={result.reload}>
            تحديث
          </Button>
        }
      />
      {result.error && <Notice error>{result.error}</Notice>}
      {result.busy ? (
        <Notice>جارٍ التحميل…</Notice>
      ) : (
        <section className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>الإجراء</th>
                <th>المستخدم</th>
                <th>السجل</th>
                <th>الوقت</th>
              </tr>
            </thead>
            <tbody>
              {result.data?.items.map((a) => (
                <tr key={a.id}>
                  <td>{actions[a.action] || "حدّث سجل المكتب"}</td>
                  <td>{a.actorName}</td>
                  <td>{date(a.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {result.data?.total === 0 && <Notice>لا توجد إجراءات مسجلة.</Notice>}
        </section>
      )}
      <Pager page={page} total={result.data?.total || 0} change={setPage} />
    </>
  )
}
function Settings({
  session,
  reload,
  loggedOut,
}: {
  session: Session
  reload: () => Promise<void>
  loggedOut: () => void
}) {
  return (
    <>
      <PageHeader
        title="الإعدادات"
        text={
          session.user.role === "SUPER_ADMIN"
            ? "روابط التواصل وأمان حساب مالك المنصة"
            : "الملف الشخصي وأمان الحساب"
        }
      />
      {session.user.role === "SUPER_ADMIN" && <ContactSettings />}
      <section className="panel live-pad">
        {session.user.role !== "SUPER_ADMIN" && (
          <BusyForm
            action={async (v) => {
              await api("/auth/profile", v)
              await reload()
            }}
          >
            <Input
              name="fullName"
              label="الاسم الكامل"
              value={session.user.fullName}
            />
            <Input
              name="phone"
              label="رقم الهاتف"
              type="tel"
              value={session.user.phone}
            />
            <Notice>تغيير الهاتف لا يوثق ملكيته.</Notice>
          </BusyForm>
        )}
        <BusyForm
          submit="تغيير كلمة المرور وإنهاء الجلسات"
          action={async (v) => {
            await api("/auth/change-password", v)
            loggedOut()
          }}
        >
          <Field label="كلمة المرور الحالية">
            <PasswordInput
              aria-label="كلمة المرور الحالية"
              name="currentPassword"
              type="password"
              required
              autoComplete="current-password"
              maxLength={128}
            />
          </Field>
          <Input name="password" label="كلمة المرور الجديدة" type="password" />
        </BusyForm>
        {session.user.role !== "SUPER_ADMIN" &&
          !session.user.emailVerifiedAt && (
            <BusyForm
              submit="إرسال رابط توثيق البريد"
              action={() => api("/auth/verification-email", {})}
            >
              <p>البريد الإلكتروني غير موثق.</p>
            </BusyForm>
          )}
      </section>
    </>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [page, setPage] = useState("dashboard")
  const [mode, setMode] = useState("")
  const [token, setToken] = useState("")
  const [notification, setNotification] = useState(false)
  const [now, setNow] = useState(Date.now())
  const reload = useCallback(async () => {
    try {
      const data = await api<Session>("/auth/me")
      setSession(data)

      setPage((current) =>
        current === "dashboard" && data.user.role === "SUPER_ADMIN"
          ? "offices"
          : current,
      )
      setNow(Date.now())
      setError("")
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setSession(null)
      } else throw e
    }
  }, [])
  useEffect(() => {
    reload()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
    const match = window.location.hash.match(
      /^#(reset|invite|verify)=([a-f0-9]{64})$/,
    )
    if (match) {
      setMode(match[1])
      setToken(match[2])
      window.history.replaceState(null, "", window.location.pathname)
    }
  }, [reload])
  useEffect(() => {
    if (!session) return
    const id = window.setInterval(() => {
      setNow(Date.now())
      reload().catch((e) => setError(e.message))
    }, 60000)
    return () => window.clearInterval(id)
  }, [!!session, reload])
  const refresh = async () => {
    try {
      await reload()
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const logout = async () => {
    try {
      await api("/auth/logout", {})
      setSession(null)
      setPage("dashboard")
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setSession(null)
      else setError((e as Error).message)
    }
  }
  const platform = session?.user.role === "SUPER_ADMIN"
  const allowed =
    session?.access?.active &&
    (!session.access.expiresAt ||
      new Date(session.access.expiresAt).getTime() > now) &&
    (!session.requireEmailVerification || session.user.emailVerifiedAt)
  const permitted = (p: string) =>
    session?.user.role === "OWNER" || !!session?.user.permissions.includes(p)
  let content: ReactNode
  if (loading)
    content = (
      <div className="live-loading" dir="rtl">
        <Notice>جارٍ التحقق من الجلسة…</Notice>
      </div>
    )
  else if (!session)
    content = (
      <>
        <PublicSite
          setArea={() => setMode("login")}
          setModal={(m) => {
            if (m) setMode("register")
          }}
        />
        {error && (
          <div className="live-connection">
            <Notice error>
              {error}
              <button onClick={refresh}>إعادة المحاولة</button>
            </Notice>
          </div>
        )}
      </>
    )
  else
    content = (
      <AppShell
        area={platform ? "admin" : "office"}
        setArea={() => {
          void logout()
        }}
        page={page}
        setPage={setPage}
        setModal={() => setNotification(true)}
        identity={{
          fullName: session.user.fullName,
          officeName: session.office?.name || "إدارة منصة قيد",
          roleName: roles[session.user.role],
        }}
      >
        {error && <Notice error>{error}</Notice>}
        {!platform && (
          <div className="trial-banner">
            <div>
              <span>
                <b>{states[session.access?.reason || ""] || "حالة الاشتراك"}</b>
                <small>
                  {session.access?.expiresAt
                    ? `نهاية الوصول: ${date(session.access.expiresAt)} — متبقي ${Math.max(0, Math.ceil((new Date(session.access.expiresAt).getTime() - now) / 86400000))} يوم`
                    : "تبدأ التجربة بعد الموافقة على الطلب."}
                </small>
              </span>
            </div>
            <Button variant="secondary" onClick={refresh}>
              تحديث الحالة
            </Button>
          </div>
        )}
        {page === "settings" || page === "admin-settings" ? (
          <Settings
            session={session}
            reload={reload}
            loggedOut={() => {
              setSession(null)
              setMode("login")
            }}
          />
        ) : platform ? (
          <PlatformWorkspace key={page} page={page} />
        ) : !allowed ? (
          <>
            <PageHeader
              title="حالة طلب المكتب"
              text={session.office?.name || ""}
            />
            <Notice>
              {!session.user.emailVerifiedAt && session.requireEmailVerification
                ? "يجب توثيق البريد قبل الوصول التشغيلي. استخدم إعدادات الحساب."
                : states[session.access?.reason || "EXPIRED"]}
            </Notice>
            {session.office?.registration?.reviewNote && (
              <Notice>{session.office.registration.reviewNote}</Notice>
            )}
            {session.office?.status === "MORE_INFO" &&
              session.user.role === "OWNER" && (
                <section className="panel live-pad">
                  <BusyForm
                    submit="إرسال المعلومات وإعادة الطلب للمراجعة"
                    action={async (v) => {
                      await api("/office/registration-response", v)
                      await reload()
                    }}
                  >
                    <Field label="المعلومات المطلوبة">
                      <textarea
                        name="note"
                        required
                        minLength={5}
                        maxLength={2000}
                      />
                    </Field>
                  </BusyForm>
                </section>
              )}
            <Button onClick={() => setPage("settings")}>إعدادات الحساب</Button>
          </>
        ) : page === "employees" ? (
          permitted("employees.manage") ? (
            <Employees session={session} />
          ) : (
            <Notice error>ليس لديك صلاحية إدارة الموظفين.</Notice>
          )
        ) : page === "activity" ? (
          permitted("audit.read") ? (
            <Audit platform={false} />
          ) : (
            <Notice error>ليس لديك صلاحية عرض السجل.</Notice>
          )
        ) : page === "documents" ? (
          permitted("cases.read") ? (
            <FilePanel canUpload={session.user.role === "OWNER" || session.user.permissions.includes("documents.manage")} />
          ) : (
            <Notice error>ليس لديك صلاحية عرض المرفقات.</Notice>
          )
        ) : page === "messages" ? (
          permitted("cases.read") ? <MessagesWorkspace /> : <Notice error>ليس لديك صلاحية التواصل الداخلي.</Notice>
        ) : page === "finance" ? (
          permitted("finance.read") ? <FinanceWorkspace /> : <Notice error>ليس لديك صلاحية عرض البيانات المالية.</Notice>
        ) : page === "calendar" || page === "tasks" ? (
          permitted("cases.read") ? <TasksWorkspace page={page === "calendar" ? "calendar" : "tasks"} session={session} /> : <Notice error>ليس لديك صلاحية عرض المهام.</Notice>
        ) : [
            "clients",
            "courts",
            "cases",
            "archive",
            "hearings",
            "postponed",
            "deadlines",
          ].includes(page) ? (
          permitted("cases.read") ? (
            <LegalWorkspace key={page} page={page} session={session} />
          ) : (
            <Notice error>ليس لديك صلاحية عرض السجلات القانونية.</Notice>
          )
        ) : page === "dashboard" && permitted("cases.read") ? (
          <LegalDashboard session={session} />
        ) : page === "dashboard" ? (
          <>
            <PageHeader
              title={`مرحبًا، ${session.user.fullName}`}
              text={session.office?.name || ""}
            />
            <section className="panel live-pad">
              <h3>حساب المكتب متاح</h3>
              <p>يمكنك إدارة الحساب والموظفين والصلاحيات وسجل النشاط.</p>
              <Notice>
                وحدات القضايا والجلسات والمالية قيد التنفيذ. لن تُعرض أرقام أو
                سجلات تجريبية كبيانات فعلية.
              </Notice>
              <div className="page-actions">
                {permitted("employees.manage") && (
                  <Button onClick={() => setPage("employees")}>الموظفون</Button>
                )}
                <Button variant="secondary" onClick={() => setPage("settings")}>
                  إعدادات الحساب
                </Button>
              </div>
            </section>
          </>
        ) : (
          <>
            <PageHeader
              title={moduleInfo[page]?.[0] || "الوحدة"}
              text={moduleInfo[page]?.[1] || ""}
            />
            <Notice>
              هذه الوحدة لم تُربط بقاعدة البيانات بعد. ستتاح بعد إكمال المرحلة
              المخصصة لها.
            </Notice>
          </>
        )}
      </AppShell>
    )
  return (
    <div dir="rtl">
      {content}
      {mode && (
        <AuthModal
          key={mode}
          mode={mode}
          token={token}
          close={() => setMode("")}
          change={setMode}
          login={reload}
        />
      )}
      {notification && <Notifications close={() => setNotification(false)} />}
    </div>
  )
}
