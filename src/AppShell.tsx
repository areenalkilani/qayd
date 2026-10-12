import { NotificationBell } from './Notifications';
import { ReactNode, useState } from "react";
import { Brand, Icon } from "./components/UI";
import type { IconName } from "./components/UI";

type Area = "public" | "admin" | "office";

type Modal = null | "trial" | "notifications";

const officeNav: [string, IconName, string][] = [
  ["الرئيسية", "home", "dashboard"], ["القضايا والملفات", "briefcase", "cases"], ["الجلسات", "calendar", "hearings"], ["القضايا المؤجلة", "clock", "postponed"], ["المحاكم", "court", "courts"], ["العملاء والموكلون", "users", "clients"], ["مرفقات القضايا", "file", "documents"], ["الإجراءات والمواعيد", "check", "deadlines"], ["طلبات البلاغات", "file", "filings"], ["التقويم والمهام", "calendar", "calendar"], ["مهام العمل", "check", "tasks"], ["الموظفون", "users", "employees"], ["حركات الموظفين", "chart", "activity"], ["التواصل الداخلي", "message", "messages"], ["الإدارة المالية", "money", "finance"], ["سندات القبض", "file", "receipts"], ["الأرشيف", "briefcase", "archive"], ["التقارير", "chart", "reports"], ["الإعدادات", "settings", "settings"],
];

export default function AppShell({ area, setArea, page, setPage, setModal, children, identity }: { area: Area; setArea: (a: Area) => void; page: string; setPage: (p: string) => void; setModal: (m: Modal) => void; children: ReactNode; identity?: { fullName: string; officeName: string; roleName: string } }) {
  const [collapsed, setCollapsed] = useState(false);
  const nav = area === "admin" ? [
    ["حسابات المشتركين", "users", "offices"], ["طلبات التجربة", "clock", "trials"], ["الدفعات", "money", "platform-payments"], ["الإعدادات", "settings", "admin-settings"],
  ] as [string, IconName, string][] : officeNav;
  return <div className={`app-shell ${collapsed ? "collapsed" : ""}`} dir="rtl">
    <aside className="sidebar">
      <div className="sidebar-brand"><Brand light /><button onClick={() => setCollapsed(!collapsed)}><Icon name="menu" /></button></div>
      <div className="workspace-switch"><span className="avatar">ق</span><div><small>{area === "admin" ? "إدارة المنصة" : "مساحة العمل"}</small><b>{identity?.officeName || "قيد"}</b></div></div>
      <nav>{nav.map(([name, icon, id]) => <button key={id} className={page === id ? "active" : ""} onClick={() => setPage(id)} title={name}><Icon name={icon} /><span>{name}</span></button>)}</nav>
      <div className="sidebar-bottom"><button onClick={() => setArea("public")}><Icon name="logout" /><span>تسجيل الخروج</span></button></div>
    </aside>
    <div className="app-main">
      <header className="topbar"><label className="live-mobile-nav">الصفحة<select value={page} onChange={e => setPage(e.target.value)}>{nav.map(([title, , id]) => <option key={id} value={id}>{title}</option>)}</select></label><span>قيد | مساحة عمل آمنة</span><div className="top-actions"><NotificationBell open={() => setModal("notifications")} /><button className="user-chip" onClick={() => setPage(area === "admin" ? "admin-settings" : "settings")}><span className="avatar">{identity?.fullName.slice(0, 2) || "ق"}</span><div><b>{identity?.fullName || "حساب المستخدم"}</b><small>{identity?.roleName || ""}</small></div></button><button className="icon-btn" aria-label="تسجيل الخروج" onClick={() => setArea("public")}><Icon name="logout" /></button></div></header>
      <main className="app-content">{children}</main>
    </div>
  </div>;
}
export type { Area, Modal };
