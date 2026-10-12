export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}
export async function api<T = { ok: boolean }>(
  path: string,
  body?: unknown,
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      headers:
        body === undefined || body instanceof FormData
          ? undefined
          : { "Content-Type": "application/json" },
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
            ? body
            : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(
      0,
      "تعذر الاتصال بالخادم. تحقق من الاتصال ثم أعد المحاولة.",
    )
  }
  const result = await response.json().catch(() => null)
  if (!result && response.status >= 500)
    throw new ApiError(
      response.status,
      "خادم تسجيل الدخول غير متاح حاليًا. تأكد من تشغيل API وقاعدة البيانات ثم أعد المحاولة.",
    )
  if (!response.ok) {
    const error = result?.error
    const detail = typeof error === "string" ? error : error?.message
    const messages: Record<number, string> = {
      400: "راجع البيانات المدخلة.",
      401: "بيانات الدخول غير صحيحة أو انتهت الجلسة.",
      403: "لا يسمح حسابك أو حالة اشتراكك بهذا الإجراء.",
      404: "السجل غير موجود.",
      409: "السجل موجود أو تغيّر أثناء العمل. حدّث الصفحة.",
      429: "محاولات كثيرة؛ يرجى الانتظار قبل المحاولة مجددًا.",
      503: "الخدمة أو إرسال البريد غير متاح حاليًا.",
    }
    throw new ApiError(
      response.status,
      `${messages[response.status] || "تعذر إتمام الطلب."}${
        detail ? ` (${detail})` : ""
      }`,
    )
  }
  if (!result)
    throw new ApiError(502, "الخادم لم يُرجع استجابة صحيحة. تحقق من تشغيل API.")
  return result as T
}
export type User = {
  id: string
  fullName: string
  email: string
  phone: string
  role: "OWNER" | "LAWYER" | "ADMINISTRATIVE" | "SUPER_ADMIN"
  officeId: string | null
  permissions: string[]
  status: string
  emailVerifiedAt: string | null
  phoneVerifiedAt: string | null
}
export type Office = {
  id: string
  name: string
  status: string
  registration: { reviewNote: string | null } | null
  trial: TimeRange | null
  subscriptions: {
    id: string
    startsAt: string
    expiresAt: string
    reference: string
  }[]
  users?: Pick<User, "fullName" | "email" | "phone">[]
}
export type Session = {
  user: User
  office: Office | null
  access: OfficeAccess | null
  emailConfigured: boolean
  requireEmailVerification: boolean
}
export interface TimeRange {
  startsAt: string
  expiresAt: string
}
export interface OfficeAccess {
  active: boolean
  reason: string
  expiresAt: string | null
}
export interface Page<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}
