import { useState } from "react";
import { ContactLinks } from "./Contact";
import { Brand, Button, Icon, Badge } from "./components/UI";
import type { IconName } from "./components/UI";
import type { Area, Modal } from "./AppShell";

export default function PublicSite({ setArea, setModal }: { setArea: (a: Area) => void; setModal: (m: Modal) => void }) {
  const [mobile, setMobile] = useState(false);
  const features = [
    ["briefcase", "إدارة القضايا والملفات", "ملف قانوني موحّد يجمع الجلسات والمستندات والإجراءات والمالية."],
    ["calendar", "الجلسات والمواعيد", "تقويم ذكي مع تنبيهات التعارض والتأجيل والمواعيد القانونية."],
    ["users", "العملاء وفريق المكتب", "إدارة دقيقة للصلاحيات والحسابات مع عزل بيانات كل مكتب."],
    ["file", "المستندات والقوالب", "أرشفة آمنة وسريعة لجميع المرفقات والنماذج القانونية."],
    ["money", "الإدارة المالية", "متابعة الأتعاب والدفعات والمصروفات وسندات القبض بوضوح."],
    ["shield", "خصوصية مصممة للمحاماة", "لا تستطيع إدارة المنصة الاطلاع على ملفات القضايا أو بيانات الموكلين."],
  ] as [IconName, string, string][];
  return <div className="public-page" dir="rtl">
    <header className="public-nav">
      <Brand />
      <nav className={mobile ? "nav-open" : ""}>
        {[["الرئيسية", "s0"], ["المميزات", "s1"], ["كيف يعمل", "s2"], ["الأسئلة الشائعة", "s4"], ["تواصل معنا", "contact"]].map(([item, id]) => <a key={item} href={`#${id}`} onClick={() => setMobile(false)}>{item}</a>)}
        {mobile && <><Button onClick={() => { setMobile(false); setArea("office"); }}>تسجيل الدخول</Button><Button variant="secondary" onClick={() => { setMobile(false); setModal("trial"); }}>طلب تجربة</Button></>}
      </nav>
      <div className="nav-actions"><Button variant="ghost" onClick={() => setArea("office")}>تسجيل الدخول</Button><Button onClick={() => setModal("trial")}>جرّب مجانًا</Button></div>
      <button className="mobile-menu" onClick={() => setMobile(!mobile)}><Icon name={mobile ? "close" : "menu"} /></button>
    </header>

    <main>
      <section className="hero" id="s0">
        <div className="hero-orb orb-one" /><div className="hero-orb orb-two" />
        <div className="hero-copy">
          <div className="eyebrow"><span>منصة قانونية فلسطينية</span><i /><span>خصوصية وأمان</span></div>
          <h1>مكتب المحاماة الخاص بك،<br /><em>بنظام واحد.</em></h1>
          <p>نظّم قضاياك، جلساتك، موكليك، موظفيك ومستنداتك من مكان واحد، بكل سهولة وأمان.</p>
          <div className="hero-actions"><Button onClick={() => setModal("trial")} icon="arrow">ابدأ تجربة مجانية لمدة 7 أيام</Button><Button variant="secondary" onClick={() => document.getElementById("s1")?.scrollIntoView({ behavior: "smooth" })}>اكتشف مميزات النظام</Button></div>
          <div className="trust-row"><span><Icon name="check" size={16} /> دون بطاقة ائتمانية</span><span><Icon name="check" size={16} /> تفعيل بعد الموافقة</span><span><Icon name="check" size={16} /> بياناتك محفوظة</span></div>
        </div>
        <DashboardPreview />
      </section>

      <section className="logo-strip"><span>حلّ موثوق لإدارة مكاتب المحاماة الحديثة</span><div><b>12K+</b><small>ملف قانوني منظّم</small></div><div><b>99.9%</b><small>جاهزية النظام</small></div><div><b>24/7</b><small>وصول آمن</small></div></section>

      <section className="section" id="s1">
        <SectionTitle eyebrow="كل ما يحتاجه مكتبك" title="إدارة قانونية أكثر وضوحًا، كل يوم" text="وحدات مترابطة صُممت حول سير العمل الحقيقي للمحامي والإدارة، بعيدًا عن الأدوات المتفرقة." />
        <div className="feature-grid">{features.map(([icon, title, text]) => <article className="feature-card" key={title}><span className="feature-icon"><Icon name={icon} /></span><h3>{title}</h3><p>{text}</p><a href="#s2">اعرف المزيد <Icon name="arrow" size={16} /></a></article>)}</div>
      </section>

      <section className="section workflow-section" id="s2">
        <div className="workflow-copy"><SectionTitle eyebrow="تدفق عمل متصل" title="من استقبال القضية إلى إغلاق الملف" text="قيد يجعل كل خطوة مرئية وقابلة للمتابعة، مع سجل نشاط واضح وتنبيهات لا تدع موعدًا يفوتك." align="start" />
          <div className="steps">{[
            ["01", "سجّل القضية والموكل", "ابدأ ببحث سريع يمنع تكرار بيانات الموكل."],
            ["02", "عيّن المحامي والمواعيد", "اختر المحكمة وأدر الجلسات دون تعارض."],
            ["03", "تابع التنفيذ والتحصيل", "إجراءات، بلاغات، مستندات ودفعات في مكان واحد."],
          ].map(x => <div className="step" key={x[0]}><b>{x[0]}</b><div><h3>{x[1]}</h3><p>{x[2]}</p></div></div>)}</div>
        </div>
        <div className="case-showcase">
          <div className="showcase-top"><div><small>ملف القضية</small><h3>شركة الأفق للتجارة</h3></div><Badge tone="success">نشطة</Badge></div>
          <div className="case-number"><span><Icon name="briefcase" /></span><div><small>رقم الملف الداخلي</small><b>QYD-2025-0148</b></div></div>
          <div className="timeline">{["تم تسجيل القضية", "تم إرفاق لائحة الدعوى", "جلسة محكمة البداية", "موعد الإجراء القادم"].map((x, i) => <div className={i === 3 ? "future" : ""} key={x}><i><Icon name={i < 3 ? "check" : "clock"} size={14} /></i><span><b>{x}</b><small>{i === 3 ? "الأحد، 18 مايو · 10:30 ص" : ["12 أبريل · 09:42 ص", "13 أبريل · 11:16 ص", "28 أبريل · 10:00 ص"][i]}</small></span></div>)}</div>
        </div>
      </section>

      <section className="privacy-section">
        <div className="privacy-visual"><div className="shield-large"><Icon name="shield" size={52} /></div><span className="lock-tag tag-one"><Icon name="lock" size={16} /> تشفير الوصول</span><span className="lock-tag tag-two"><Icon name="users" size={16} /> صلاحيات دقيقة</span></div>
        <div><SectionTitle eyebrow="السرّية أولًا" title="بيانات مكتبك تبقى لمكتبك" text="بنية قائمة على العزل الصارم بين مكاتب المحاماة. إدارة منصة قيد تدير الاشتراكات فقط، ولا يمكنها الاطلاع على قضاياك أو موكليك أو مستنداتك." align="start" /><ul className="check-list"><li><Icon name="check" /> عزل كامل لبيانات كل مكتب</li><li><Icon name="check" /> صلاحيات حسب الدور الوظيفي</li><li><Icon name="check" /> سجل تدقيق لكل إجراء مهم</li></ul></div>
      </section>



      <section className="section faq" id="s4">
        <SectionTitle eyebrow="لديك سؤال؟" title="الأسئلة الشائعة" />
        {["هل تبدأ التجربة مباشرة بعد التسجيل؟", "هل تستطيع إدارة المنصة رؤية قضايا مكتبي؟", "ماذا يحدث لبياناتي عند انتهاء التجربة؟", "هل يمكنني إضافة موظفين بصلاحيات مختلفة؟"].map((q, i) => <details key={q} open={i === 0}><summary>{q}<span>+</span></summary><p>{i === 0 ? "لا. نراجع طلب المكتب أولًا، وتبدأ الأيام السبعة من لحظة الموافقة الفعلية." : i === 1 ? "لا، إدارة المنصة ترى بيانات الاشتراك والتواصل فقط، ولا تصل إلى السجلات القانونية الخاصة." : i === 2 ? "تبقى البيانات محفوظة، ويُقيّد الوصول التشغيلي حتى تجديد الاشتراك دون حذف أي ملف." : "نعم، يمكنك إضافة محامين وإداريين وتحديد صلاحيات كل حساب بدقة."}</p></details>)}
      </section>

      <section className="cta"><Brand light /><h2>جاهز لتنظيم مكتبك بطريقة أفضل؟</h2><p>انضم إلى مكاتب المحاماة التي اختارت الوضوح، السرعة، والأمان.</p><Button onClick={() => setModal("trial")}>ابدأ تجربتك المجانية</Button></section>
    </main>
    <section className="section contact-section" id="contact"><h2>تواصل معنا</h2><ContactLinks /></section><ContactLinks floating />
    <footer><div><Brand light /><p>نظام متكامل لإدارة مكاتب المحاماة</p></div><div><b>المنصة</b><a href="#s1">المميزات</a><a href="#contact">تواصل معنا</a><a href="#s4">الأسئلة الشائعة</a></div><div><b>قانوني</b><a href="#">سياسة الخصوصية</a><a href="#">الشروط والأحكام</a></div><div><b>تواصل معنا</b><ContactLinks /></div><small><span>جنين - فلسطين</span> · © 2026 قيد. جميع الحقوق محفوظة. — بنيت بواسطة eng.areen alkilani</small></footer>
  </div>;
}

function SectionTitle({ eyebrow, title, text, align = "center" }: { eyebrow: string; title: string; text?: string; align?: "center" | "start" }) {
  return <div className={`section-title ${align}`}><span>{eyebrow}</span><h2>{title}</h2>{text && <p>{text}</p>}</div>;
}

function DashboardPreview() {
  return <div className="dashboard-preview" dir="rtl">
    <div className="preview-bar"><Brand /><div className="preview-search"><Icon name="search" size={14} /> ابحث في قضاياك...</div><span><Icon name="bell" size={17} /></span><div className="avatar">أز</div></div>
    <div className="preview-body"><aside><i className="active"><Icon name="home" /></i>{["briefcase", "calendar", "users", "file", "money", "chart"].map(x => <i key={x}><Icon name={x as IconName} /></i>)}</aside>
      <div className="preview-content"><div className="preview-title"><div><small>صباح الخير، أحمد</small><b>لوحة التحكم</b></div><button>+ قضية جديدة</button></div>
        <div className="preview-stats"><div><span>إجمالي القضايا</span><b>248</b><small>+12 هذا الشهر</small></div><div><span>الجلسات القادمة</span><b>18</b><small>3 اليوم</small></div><div><span>المهام المعلقة</span><b>09</b><small>2 عاجلة</small></div></div>
        <div className="preview-panels"><div className="mini-chart"><b>نشاط القضايا</b><div className="bars">{[35, 55, 42, 75, 58, 87, 68, 92].map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</div></div><div className="mini-schedule"><b>جلسات اليوم</b>{[["10:00", "محكمة البداية"], ["12:30", "محكمة الصلح"], ["02:00", "محكمة الاستئناف"]].map((x, i) => <div key={x[0]}><span>{x[0]}</span><i /><small>{x[1]}<em>القضية 24/{124 + i}</em></small></div>)}</div></div>
      </div></div>
  </div>;
}
