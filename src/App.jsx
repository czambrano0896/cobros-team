import { useState, useEffect, useCallback, useRef } from "react";

// ─── SUPABASE ────────────────────────────────────────────────────────────
const SUPA_URL = "https://glwjigzgsrmaqkfnnvve.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdsd2ppZ3pnc3JtYXFrZm5udnZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMzQzNzksImV4cCI6MjA4ODgxMDM3OX0.Nl7ZNlxUSHDui_P_XDO9JckHqjKkgaVycb7Yl-7pz2Q";

const db = {
  async get(table, query = "") {
    const r = await fetch(`${SUPA_URL}/rest/v1/${table}?${query}&order=created_at.desc`, {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }
    });
    return r.json();
  },
  async insert(table, data) {
    const r = await fetch(`${SUPA_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(data)
    });
    return r.json();
  },
  async update(table, id, data) {
    const r = await fetch(`${SUPA_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: "PATCH",
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(data)
    });
    return r.json();
  },
  async delete(table, id) {
    await fetch(`${SUPA_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: "DELETE",
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }
    });
  },
  // Upsert config — operación atómica, nunca borra sin reemplazar
  async setConfig(key, value) {
    const r = await fetch(`${SUPA_URL}/rest/v1/config`, {
      method: "POST",
      headers: {
        apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify({ key, value: JSON.stringify(value) })
    });
    return r.ok;
  },
  async getConfig(key) {
    const r = await fetch(`${SUPA_URL}/rest/v1/config?key=eq.${key}&select=value`, {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }
    });
    const d = await r.json();
    if (Array.isArray(d) && d[0]) { try { return JSON.parse(d[0].value); } catch { return null; } }
    return null;
  }
};

// ─── CONSTANTES ──────────────────────────────────────────────────────────
const PRIORITIES = [
  { value: "urgente", label: "Urgente", color: "#FF4D4D", bg: "rgba(255,77,77,0.12)" },
  { value: "alta",    label: "Alta",    color: "#FF9500", bg: "rgba(255,149,0,0.12)" },
  { value: "media",   label: "Media",   color: "#0A84FF", bg: "rgba(10,132,255,0.12)" },
  { value: "baja",    label: "Baja",    color: "#30D158", bg: "rgba(48,209,88,0.12)" },
];
const PRIO_ORDER  = { urgente:0, alta:1, media:2, baja:3 };
const STATUS_NEXT = { "pendiente":"en-proceso", "en-proceso":"completado" };
const STATUS_PREV = { "en-proceso":"pendiente", "completado":"en-proceso" };
const DEFAULT_CARTERAS = ["Cartera Vencida","Cartera Corriente","Cartera Judicial","Cartera Empresarial","Cartera Pequeñas Cuentas"];
const DEFAULT_ROLES    = [
  { key:"gerente",    label:"Gerente",    color:"#FF4D4D" },
  { key:"supervisor", label:"Supervisor", color:"#FF9500" },
  { key:"analista",   label:"Analista",   color:"#0A84FF" },
];
const MEET_TYPES  = {
  seguimiento:  { label:"Seguimiento",  color:"#0A84FF", icon:"📋" },
  estrategia:   { label:"Estrategia",   color:"#BF5AF2", icon:"🎯" },
  capacitacion: { label:"Capacitación", color:"#30D158", icon:"📚" },
  otro:         { label:"Otro",         color:"#FF9500", icon:"💬" },
};
const WEEKDAYS   = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
const MONTHS     = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

// ─── HELPERS ─────────────────────────────────────────────────────────────
const fmtDate  = d => { if(!d) return ""; return new Date(d+"T00:00:00").toLocaleDateString("es-ES",{day:"2-digit",month:"short",year:"numeric"}); };
const fmtShort = d => { if(!d) return ""; return new Date(d+"T00:00:00").toLocaleDateString("es-ES",{day:"2-digit",month:"short"}); };
const daysLeft = d => { if(!d) return null; const t=new Date(); t.setHours(0,0,0,0); return Math.ceil((new Date(d+"T00:00:00")-t)/86400000); };

// Una tarea está vencida solo si ya pasó su fecha/hora exacta
const isOverdue = (task) => {
  if (!task.due_date) return false;
  if (task.status === "completado") return false;
  const now = new Date();
  if (task.task_time) {
    // Tiene hora — vencida solo si ya pasó fecha+hora
    const [h, m] = task.task_time.split(":").map(Number);
    const deadline = new Date(task.due_date + "T00:00:00");
    deadline.setHours(h, m, 0, 0);
    return now > deadline;
  } else {
    // Sin hora — vencida si la fecha ya pasó (no hoy, sino días anteriores)
    const today = new Date(); today.setHours(0,0,0,0);
    const deadline = new Date(task.due_date + "T00:00:00");
    return deadline < today;
  }
};
const todayStr = () => new Date().toISOString().split("T")[0];

// ─── EXPAND RECURRING EVENTS ─────────────────────────────────────────────
// Returns all dates a recurring task/meeting appears on, within a date range
function expandRecurring(item, rangeStart, rangeEnd) {
  const dates = [];
  // For recurring items: start from start_date (or date/due_date as fallback)
  // recurrence_end is when repetitions stop
  const baseStr = item.start_date || item.date || item.due_date;
  if (!baseStr) return [];
  const base = new Date(baseStr + "T00:00:00");
  if (isNaN(base)) return [baseStr];

  if (!item.recurrence) {
    // Not recurring — just return the single date
    return [item.date || item.due_date].filter(Boolean);
  }

  // End: recurrence_end if set, otherwise cap at rangeEnd
  const endStr = item.recurrence_end || rangeEnd;
  const rEnd   = new Date(endStr + "T00:00:00");
  const rCap   = new Date(rangeEnd + "T00:00:00");
  const effectiveEnd = rEnd < rCap ? rEnd : rCap;
  const rStart = new Date(rangeStart + "T00:00:00");

  let cur = new Date(base);
  let safetyLimit = 0;
  while (cur <= effectiveEnd && safetyLimit < 500) {
    safetyLimit++;
    if (cur >= rStart) {
      const ds = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,"0")}-${String(cur.getDate()).padStart(2,"0")}`;
      if (item.recurrence !== "semanal" || !item.recurrence_days?.length || item.recurrence_days.includes(cur.getDay())) {
        dates.push(ds);
      }
    }
    if      (item.recurrence === "diaria")    cur.setDate(cur.getDate() + 1);
    else if (item.recurrence === "semanal")   cur.setDate(cur.getDate() + 1);
    else if (item.recurrence === "quincenal") cur.setDate(cur.getDate() + 14);
    else if (item.recurrence === "mensual")   cur.setMonth(cur.getMonth() + 1);
    else break;
  }
  return dates;
}

// ─── CONFLICT DETECTION ──────────────────────────────────────────────────
// Returns list of conflict descriptions for given people + date + time
// Checks ±60 min window around the proposed time
function detectConflicts({ date, time, excludeId, excludeType, userIds, tasks, meetings, users }) {
  if (!date || !time || !userIds || userIds.length === 0) return [];
  const getUser = id => users.find(u => u.id === id);

  const [hh, mm] = time.split(":").map(Number);
  const proposedMins = hh * 60 + mm;
  const WINDOW = 60; // minutes — events within 60 min are flagged

  const conflicts = [];

  userIds.forEach(uid => {
    const person = getUser(uid);
    if (!person) return;

    // Check against meetings
    meetings.forEach(m => {
      if (excludeType === "meeting" && m.id === excludeId) return;
      if (m.date !== date) return;
      if (!(m.participants || []).includes(uid)) return;
      const [mh, mmin] = m.time.split(":").map(Number);
      const meetMins = mh * 60 + mmin;
      if (Math.abs(proposedMins - meetMins) < WINDOW) {
        conflicts.push({
          person: person.name.split(" ")[0],
          personColor: person.color,
          personAvatar: person.avatar,
          type: "reunión",
          icon: "🤝",
          title: m.title,
          time: m.time,
          color: "#BF5AF2"
        });
      }
    });

    // Check against tasks with time
    tasks.forEach(t => {
      if (excludeType === "task" && t.id === excludeId) return;
      if (t.due_date !== date) return;
      if (!t.task_time) return;
      const taskAssignees = Array.isArray(t.assigned_to) ? t.assigned_to : (t.assigned_to ? [t.assigned_to] : []);
      if (!taskAssignees.includes(uid)) return;
      const [th, tmin] = t.task_time.split(":").map(Number);
      const taskMins = th * 60 + tmin;
      if (Math.abs(proposedMins - taskMins) < WINDOW) {
        const prio = PRIORITIES.find(p => p.value === t.priority);
        conflicts.push({
          person: person.name.split(" ")[0],
          personColor: person.color,
          personAvatar: person.avatar,
          type: "tarea",
          icon: "📋",
          title: t.title,
          time: t.task_time,
          color: prio?.color || "#8891B0"
        });
      }
    });
  });

  return conflicts;
}

// ─── CSS ──────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Cal+Sans&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
html,body{background:#08090E;overscroll-behavior:none;}
::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#2A2D3E;border-radius:4px}

/* TOKENS */
:root{
  --bg:#08090E;
  --surface:#0F1117;
  --surface2:#161820;
  --border:#1E2130;
  --border2:#252838;
  --text:#F0F2FF;
  --text2:#8891B0;
  --text3:#4A5178;
  --accent:#FF4D4D;
  --accent2:#FF7A7A;
  --green:#30D158;
  --orange:#FF9500;
  --blue:#0A84FF;
  --purple:#BF5AF2;
  --radius:14px;
  --radius-sm:8px;
  --radius-xs:6px;
}

/* TYPOGRAPHY */
.font-display{font-family:'Outfit',sans-serif;font-weight:800;}
.font-body{font-family:'Outfit',sans-serif;}

/* COMPONENTS */
.surface{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);}
.surface2{background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);}

.btn{display:inline-flex;align-items:center;gap:6px;border:none;border-radius:var(--radius-sm);padding:9px 16px;font-family:'Outfit',sans-serif;font-weight:600;font-size:13px;cursor:pointer;transition:all .18s;white-space:nowrap;}
.btn-red{background:linear-gradient(135deg,#FF4D4D,#FF7A3D);color:#fff;box-shadow:0 4px 16px rgba(255,77,77,.25);}
.btn-red:hover{transform:translateY(-1px);box-shadow:0 6px 20px rgba(255,77,77,.35);}
.btn-red:active{transform:translateY(0);}
.btn-glass{background:var(--surface2);color:var(--text2);border:1px solid var(--border2);}
.btn-glass:hover{color:var(--text);background:var(--border2);}
.btn-ghost{background:transparent;color:var(--text3);border:1px solid var(--border);}
.btn-ghost:hover{color:var(--text2);border-color:var(--border2);}
.btn-icon{background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-xs);width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:all .15s;font-size:13px;}
.btn-icon:hover{border-color:var(--border2);color:var(--text);}
.btn-danger-icon{background:rgba(255,77,77,.08);border:1px solid rgba(255,77,77,.2);border-radius:var(--radius-xs);width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;color:#FF4D4D;font-size:12px;transition:all .15s;}
.btn-danger-icon:hover{background:rgba(255,77,77,.15);}

.input{background:var(--surface2);border:1.5px solid var(--border2);border-radius:var(--radius-sm);padding:10px 14px;color:var(--text);font-family:'Outfit',sans-serif;font-size:14px;width:100%;outline:none;transition:border-color .18s;}
.input:focus{border-color:var(--accent);}
.input::placeholder{color:var(--text3);}
.input option{background:var(--surface);}

.badge{display:inline-flex;align-items:center;padding:3px 9px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:.3px;}
.pill{display:inline-flex;align-items:center;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:800;letter-spacing:.3px;}

.label{font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px;display:block;}

.avatar{border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:'Outfit',sans-serif;font-weight:800;flex-shrink:0;}

.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.75);backdrop-filter:blur(8px);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px;}
.modal{background:var(--surface);border:1px solid var(--border2);border-radius:20px;padding:24px;width:100%;max-width:560px;max-height:94vh;overflow-y:auto;}

.toast-wrap{position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:9999;pointer-events:none;}
@media(min-width:768px){.toast-wrap{bottom:24px;right:24px;left:auto;transform:none;}}
.toast{padding:12px 20px;border-radius:12px;font-size:13px;font-weight:600;font-family:'Outfit',sans-serif;box-shadow:0 8px 32px rgba(0,0,0,.4);white-space:nowrap;}
@keyframes slideUp{from{transform:translateY(12px);opacity:0}to{transform:translateY(0);opacity:1}}
.slide-up{animation:slideUp .22s ease;}

/* TASK ROW */
.task-row{border-radius:12px;padding:14px 16px;border:1px solid var(--border);background:var(--surface);transition:border-color .18s,background .18s;margin-bottom:6px;}
.task-row:hover{border-color:var(--border2);background:var(--surface2);}

/* NAV */
.nav-item{display:flex;flex-direction:column;align-items:center;gap:3px;padding:8px 16px;border-radius:10px;cursor:pointer;transition:all .18s;border:none;background:none;color:var(--text3);font-family:'Outfit',sans-serif;font-size:10px;font-weight:600;}
.nav-item.active{color:var(--accent);}
.nav-icon{font-size:20px;line-height:1;}

/* TOP NAV DESKTOP */
.top-nav-btn{background:none;border:none;cursor:pointer;padding:7px 14px;border-radius:var(--radius-sm);font-family:'Outfit',sans-serif;font-size:13px;font-weight:600;transition:all .18s;color:var(--text3);}
.top-nav-btn:hover{background:var(--surface2);color:var(--text);}
.top-nav-btn.active{background:var(--surface2);color:var(--accent);}

/* STAT CARD */
.stat-card{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px 18px;cursor:pointer;transition:all .2s;position:relative;overflow:hidden;}
.stat-card:hover{border-color:var(--border2);transform:translateY(-1px);}
.stat-card.active-stat{border-color:rgba(255,77,77,.4);background:rgba(255,77,77,.04);}
.stat-glow{position:absolute;top:-20px;right:-20px;width:80px;height:80px;border-radius:50%;opacity:.06;filter:blur(20px);}

/* CALENDAR */
.cal-day{border-radius:10px;padding:6px;min-height:80px;border:1px solid var(--border);transition:all .18s;cursor:default;background:var(--surface);}
.cal-day.has-items{cursor:pointer;}
.cal-day.has-items:hover{border-color:var(--border2);background:var(--surface2);}
.cal-day.is-today{border-color:rgba(255,77,77,.4);background:rgba(255,77,77,.04);}
.cal-day.other-month{opacity:.25;}
.cal-event{font-size:9px;font-weight:700;border-radius:3px;padding:2px 5px;margin-bottom:2px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;}

/* TOGGLE */
.seg-control{display:flex;background:var(--surface2);border-radius:var(--radius-sm);padding:3px;gap:2px;border:1px solid var(--border);}
.seg-btn{background:none;border:none;cursor:pointer;padding:6px 12px;border-radius:6px;font-family:'Outfit',sans-serif;font-size:12px;font-weight:600;color:var(--text3);transition:all .15s;}
.seg-btn.active{background:var(--surface);color:var(--text);box-shadow:0 1px 4px rgba(0,0,0,.3);}

/* CHECKBOX */
.check-row{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:var(--radius-sm);cursor:pointer;transition:background .15s;}
.check-row:hover{background:var(--border);}

/* MOBILE */
@media(max-width:767px){
  .desktop-only{display:none!important;}
  .modal{padding:18px;border-radius:18px 18px 0 0;position:fixed;bottom:0;left:0;right:0;max-width:100%;max-height:88vh;margin:0;}
  .modal-overlay{align-items:flex-end;padding:0;}
  .task-row{padding:12px 14px;}
}
@media(min-width:768px){
  .mobile-only{display:none!important;}
}

/* SPIN */
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
.spin{animation:spin .8s linear infinite;display:inline-block;}
@keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
.fade-in{animation:fadeIn .3s ease;}

/* HISTORY */
.history-item{padding:10px 0;border-bottom:1px solid var(--border);font-size:12px;}
.history-item:last-child{border-bottom:none;}

/* CONFLICT */
.conflict-banner{background:rgba(255,149,0,.07);border:1.5px solid rgba(255,149,0,.3);border-radius:10px;padding:12px 14px;margin-bottom:4px;}
.conflict-item{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,149,0,.1);}
.conflict-item:last-child{border-bottom:none;}
@keyframes conflictPulse{0%,100%{opacity:1}50%{opacity:.6}}
.conflict-dot{width:7px;height:7px;border-radius:50%;background:#FF9500;animation:conflictPulse 1.4s ease infinite;flex-shrink:0;}

/* MEETING CARD */
.meeting-card{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px;transition:border-color .18s;margin-bottom:8px;}
.meeting-card:hover{border-color:var(--border2);}

/* COMMENT */
.comment-bubble{background:var(--surface2);border-radius:10px;padding:10px 12px;margin-bottom:6px;}
`;

// ══════════════════════════════════════════════════════════════════════════
export default function App() {
  const [user,     setUser]     = useState(() => {
    try { const s = localStorage.getItem("ct_session"); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [users,    setUsers]    = useState([]);

  const login  = u => { setUser(u); localStorage.setItem("ct_session", JSON.stringify(u)); };
  const logout = () => { setUser(null); localStorage.removeItem("ct_session"); };
  const [loading,  setLoading]  = useState(true);
  const [carteras, setCarteras] = useState(DEFAULT_CARTERAS);
  const [roles,    setRoles]    = useState(DEFAULT_ROLES);

  const saveCarteras = async list => {
    setCarteras(list);
    await db.setConfig("carteras", list);
  };
  const saveRoles = async list => {
    setRoles(list);
    await db.setConfig("roles", list);
  };

  const getRoleLabel = key => roles.find(r=>r.key===key)?.label || key;
  const getRoleColor = key => roles.find(r=>r.key===key)?.color || "#8891B0";

  useEffect(() => {
    Promise.all([
      db.get("users", "select=*"),
      db.getConfig("carteras"),
      db.getConfig("roles"),
    ]).then(async ([u, c, r]) => {
      setUsers(Array.isArray(u) ? u : []);

      // Carteras: si hay en Supabase las usa, si no migra desde localStorage
      if (Array.isArray(c) && c.length > 0) {
        setCarteras(c);
      } else {
        try {
          const local = localStorage.getItem("ct_carteras");
          const toSave = local ? JSON.parse(local) : DEFAULT_CARTERAS;
          setCarteras(toSave);
          await db.setConfig("carteras", toSave);
        } catch { setCarteras(DEFAULT_CARTERAS); }
      }

      // Roles: igual
      if (Array.isArray(r) && r.length > 0) {
        setRoles(r);
      } else {
        try {
          const local = localStorage.getItem("ct_roles");
          const toSave = local ? JSON.parse(local) : DEFAULT_ROLES;
          setRoles(toSave);
          await db.setConfig("roles", toSave);
        } catch { setRoles(DEFAULT_ROLES); }
      }

      setLoading(false);
    });
  }, []);

  const refreshUsers = () => db.get("users","select=*").then(d => setUsers(Array.isArray(d)?d:[]));

  if (loading) return (
    <div style={{minHeight:"100vh",background:"#08090E",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Outfit',sans-serif"}}>
      <style>{CSS}</style>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:36,marginBottom:12}} className="spin">⚡</div>
        <div style={{color:"#4A5178",fontSize:13,fontWeight:600}}>Conectando...</div>
      </div>
    </div>
  );

  if (!user) return <LoginScreen users={users} onLogin={login} getRoleLabel={getRoleLabel} getRoleColor={getRoleColor} />;
  return <Dashboard currentUser={user} users={users} refreshUsers={refreshUsers} onLogout={logout}
    carteras={carteras} saveCarteras={saveCarteras}
    roles={roles} saveRoles={saveRoles}
    getRoleLabel={getRoleLabel} getRoleColor={getRoleColor}
  />;
}

// ══════════════════════════════════════════════════════════════════════════
// LOGIN
// ══════════════════════════════════════════════════════════════════════════
function LoginScreen({ users, onLogin, getRoleLabel, getRoleColor }) {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [showPass, setShowPass] = useState(false);
  const [shake,    setShake]    = useState(false);

  const handleLogin = () => {
    const u = users.find(u =>
      (u.email?.toLowerCase() === email.trim().toLowerCase() || u.username === email.trim().toLowerCase()) && u.password === password
    );
    if (u) onLogin(u);
    else { setError("Correo o contraseña incorrectos"); setShake(true); setTimeout(() => setShake(false), 500); }
  };

  return (
    <div style={{minHeight:"100vh",background:"#08090E",display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"'Outfit',sans-serif"}}>
      <style>{CSS}</style>
      <div className="fade-in" style={{width:"100%",maxWidth:380}}>
        {/* Logo */}
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{width:64,height:64,background:"linear-gradient(135deg,#FF4D4D,#FF9500)",borderRadius:20,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:30,marginBottom:16,boxShadow:"0 12px 40px rgba(255,77,77,.3)"}}>⚡</div>
          <div className="font-display" style={{fontSize:26,color:"#F0F2FF",letterSpacing:"-0.5px"}}>CobrosTeam</div>
          <div style={{color:"#4A5178",fontSize:13,marginTop:4,fontWeight:500}}>Gestión de equipos de cobros</div>
        </div>

        <div className={shake?"shake":""} style={{background:"#0F1117",border:"1px solid #1E2130",borderRadius:20,padding:28}}>
          <div className="font-display" style={{fontSize:17,color:"#F0F2FF",marginBottom:20}}>Iniciar sesión</div>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div>
              <label className="label">Correo o usuario</label>
              <input className="input" type="text" placeholder="correo@empresa.com" value={email} onChange={e=>{setEmail(e.target.value);setError("");}} onKeyDown={e=>e.key==="Enter"&&handleLogin()} />
            </div>
            <div>
              <label className="label">Contraseña</label>
              <div style={{position:"relative"}}>
                <input className="input" type={showPass?"text":"password"} placeholder="••••••••" value={password} onChange={e=>{setPassword(e.target.value);setError("");}} onKeyDown={e=>e.key==="Enter"&&handleLogin()} style={{paddingRight:44}} />
                <button onClick={()=>setShowPass(!showPass)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"#4A5178",fontSize:16,lineHeight:1}}>{showPass?"🙈":"👁"}</button>
              </div>
            </div>
            {error && <div style={{background:"rgba(255,77,77,.08)",border:"1px solid rgba(255,77,77,.2)",borderRadius:8,padding:"10px 14px",color:"#FF4D4D",fontSize:12,fontWeight:600}}>⚠ {error}</div>}
            <button className="btn btn-red" style={{width:"100%",justifyContent:"center",padding:13,fontSize:15}} onClick={handleLogin}>Entrar</button>
          </div>
        </div>

        {/* Users list */}
        <div style={{marginTop:16,background:"#0F1117",border:"1px solid #1E2130",borderRadius:14,padding:"12px 16px"}}>
          <div style={{fontSize:10,color:"#4A5178",fontWeight:700,textTransform:"uppercase",letterSpacing:".8px",marginBottom:10}}>Equipo</div>
          {users.map(u => (
            <div key={u.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:"1px solid #1E213044"}}>
              <div className="avatar" style={{width:22,height:22,background:u.color+"22",color:u.color,fontSize:8}}>{u.avatar}</div>
              <span style={{color:"#F0F2FF",fontWeight:600,fontSize:12,flex:1}}>{u.name.split(" ")[0]}</span>
              <span style={{color:"#0A84FF",fontFamily:"monospace",fontSize:11}}>{u.email||u.username}</span>
              <span style={{color:getRoleColor(u.role),fontSize:10,fontWeight:700}}>{getRoleLabel(u.role)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════════════════
function Dashboard({ currentUser, users, refreshUsers, onLogout, carteras, saveCarteras, roles, saveRoles, getRoleLabel, getRoleColor }) {
  const [view,           setView]          = useState("tablero");
  const [tasks,          setTasks]         = useState([]);
  const [meetings,       setMeetings]      = useState([]);
  const [comments,       setComments]      = useState([]);
  const [history,        setHistory]       = useState([]);
  const [loading,        setLoading]       = useState(true);
  const [taskScope,      setTaskScope]     = useState("all");
  const [filterPriority, setFilterPriority]= useState("all");
  const [filterStatus,   setFilterStatus]  = useState("all");
  const [filterCartera,  setFilterCartera] = useState("all");
  const [activeStat,     setActiveStat]    = useState(null);
  const [showNewTask,    setShowNewTask]   = useState(false);
  const [showNewMeeting, setShowNewMeeting]= useState(false);
  const [editingMeeting, setEditingMeeting]= useState(null);
  const [editingTask,    setEditingTask]   = useState(null);
  const [expandedTask,   setExpandedTask]  = useState(null);
  const [showVisibility, setShowVisibility]= useState(null);
  const [showHistory,    setShowHistory]   = useState(null);
  const [confirmDelete,  setConfirmDelete] = useState(null);
  const [showNotif,      setShowNotif]     = useState(false);
  const [calDate,        setCalDate]       = useState(new Date());
  const [calView,        setCalView]       = useState("mes");
  const [calScope,       setCalScope]      = useState("todos"); // todos | mine
  const [toast,          setToast]         = useState(null);
  const [selectedMember, setSelectedMember]= useState(null); // for team click-through
  const [calSelectedItem,setCalSelectedItem]=useState(null); // for calendar click detail
  const [showSettings,   setShowSettings]  = useState(false);// carteras/roles settings
  const isGerente = currentUser.role === "gerente";

  const showToast = (msg, type="success") => { setToast({msg,type}); setTimeout(()=>setToast(null),3000); };

  // ── NORMALIZADORES — garantizan que todos los campos existan sin importar
  //    cuándo fue creado el registro. Compatibilidad con versiones anteriores.
  const normalizeTask = t => ({
    title:           t.title           || "",
    description:     t.description     || "",
    priority:        t.priority        || "media",
    status:          t.status          || "pendiente",
    cartera:         t.cartera         || "",
    due_date:        t.due_date        || null,
    start_date:      t.start_date      || null,
    task_time:       t.task_time       || null,
    recurrence:      t.recurrence      || null,
    recurrence_days: t.recurrence_days || null,
    recurrence_end:  t.recurrence_end  || null,
    notify_before:   t.notify_before   || null,
    is_published:    t.is_published    ?? true,
    visible_to:      t.visible_to      || null,
    assigned_to:     Array.isArray(t.assigned_to) ? t.assigned_to : (t.assigned_to ? [t.assigned_to] : []),
    assigned_by:     t.assigned_by     || null,
    ...t // keep id, created_at and any future fields
  });

  const normalizeMeeting = m => ({
    title:           m.title           || "",
    date:            m.date            || null,
    time:            m.time            || "",
    type:            m.type            || "otro",
    notes:           m.notes           || "",
    participants:    Array.isArray(m.participants) ? m.participants : [],
    notify_before:   Array.isArray(m.notify_before) ? m.notify_before : [],
    recurrence:      m.recurrence      || null,
    recurrence_days: m.recurrence_days || null,
    recurrence_end:  m.recurrence_end  || null,
    acta:            m.acta            || null,
    acta_updated_by: m.acta_updated_by || null,
    created_by:      m.created_by      || null,
    ...m
  });

  const loadAll = useCallback(async () => {
    const [t,m,c,h] = await Promise.all([
      db.get("tasks","select=*"),
      db.get("meetings","select=*"),
      db.get("task_comments","select=*"),
      db.get("task_history","select=*")
    ]);
    setTasks(Array.isArray(t) ? t.map(normalizeTask) : []);
    setMeetings(Array.isArray(m) ? m.map(normalizeMeeting) : []);
    setComments(Array.isArray(c)?c:[]);
    setHistory(Array.isArray(h)?h:[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Auto-refresh cada 30 segundos para ver cambios de otros usuarios
  useEffect(() => {
    const interval = setInterval(() => { loadAll(); }, 30000);
    return () => clearInterval(interval);
  }, [loadAll]);

  const refreshTasks    = useCallback(async () => {
    const t = await db.get("tasks","select=*");
    if (Array.isArray(t)) setTasks(t.map(normalizeTask));
  }, []);

  const refreshMeetings = useCallback(async () => {
    const m = await db.get("meetings","select=*");
    if (Array.isArray(m)) setMeetings(m.map(normalizeMeeting));
  }, []);

  const [filterPerson,   setFilterPerson]  = useState("all");

  const getUser = id => users.find(u => u.id === id);

  // Helper: get assignees array from task (supports both old int and new array)
  const getAssignees = task => {
    if (Array.isArray(task.assigned_to)) return task.assigned_to;
    if (task.assigned_to) return [task.assigned_to];
    return [];
  };

  const logHistory = async (taskId, action, oldVal, newVal) => {
    const res = await db.insert("task_history", {task_id:taskId,user_id:currentUser.id,action,old_value:String(oldVal),new_value:String(newVal)});
    if (Array.isArray(res)&&res[0]) setHistory(p=>[res[0],...p]);
  };

  function isTaskVisible(task) {
    const creator = getUser(task.assigned_by);
    const assignees = getAssignees(task);
    if (creator?.role==="gerente" && !task.is_published && task.assigned_by!==currentUser.id && !assignees.includes(currentUser.id)) return false;
    if (task.visible_to?.length>0 && !task.visible_to.includes(currentUser.id)) return false;
    return true;
  }

  function canDelete(item) {
    if (isGerente) return true;
    return item.assigned_by===currentUser.id||item.created_by===currentUser.id;
  }

  function canUpdateStatus(task) {
    const assignees = getAssignees(task);
    return assignees.includes(currentUser.id)||task.assigned_by===currentUser.id||isGerente;
  }

  // Notificaciones
  const notifications = [];
  tasks.forEach(t => {
    if (!isTaskVisible(t)) return;
    const assignees = getAssignees(t);
    if (!assignees.includes(currentUser.id) && t.assigned_by!==currentUser.id && !isGerente) return;
    const dl = daysLeft(t.due_date);
    if (t.status!=="completado") {
      if (isOverdue(t))  notifications.push({id:`ov-${t.id}`,type:"error",  msg:`"${t.title}" está VENCIDA`});
      else if (dl===1)   notifications.push({id:`d1-${t.id}`,type:"warning",msg:`"${t.title}" vence mañana`});
      else if (dl===2)   notifications.push({id:`d2-${t.id}`,type:"info",   msg:`"${t.title}" vence en 2 días`});
    }
  });
  meetings.forEach(m => {
    const dl = daysLeft(m.date);
    if (dl===0) notifications.push({id:`mt-${m.id}`,type:"warning",msg:`Reunión "${m.title}" HOY ${m.time}`});
    if (dl===1) notifications.push({id:`mm-${m.id}`,type:"info",   msg:`Reunión "${m.title}" mañana ${m.time}`});
  });

  // CRUD
  const updateStatus = async (id, newStatus) => {
    const task = tasks.find(t=>t.id===id);
    await db.update("tasks",id,{status:newStatus});
    await logHistory(id,"status_change",task.status,newStatus);
    setTasks(p=>p.map(t=>t.id===id?{...t,status:newStatus}:t));
    showToast(newStatus==="completado"?"¡Completada! ✓":"Estado actualizado");
  };

  const deleteTask = async id => {
    await db.delete("tasks",id);
    setTasks(p=>p.filter(t=>t.id!==id));
    setConfirmDelete(null); showToast("Tarea eliminada"); refreshTasks();
  };

  const deleteMeeting = async id => {
    await db.delete("meetings",id);
    setMeetings(p=>p.filter(m=>m.id!==id));
    setConfirmDelete(null); showToast("Reunión eliminada"); refreshMeetings();
  };

  const togglePublish = async task => {
    const val = !task.is_published;
    await db.update("tasks",task.id,{is_published:val});
    setTasks(p=>p.map(t=>t.id===task.id?{...t,is_published:val}:t));
    showToast(val?"Publicada ✓":"Ocultada");
  };

  const saveVisibility = async (taskId, visibleTo) => {
    await db.update("tasks",taskId,{visible_to:visibleTo.length>0?visibleTo:null});
    setTasks(p=>p.map(t=>t.id===taskId?{...t,visible_to:visibleTo.length>0?visibleTo:null}:t));
    setShowVisibility(null); showToast("Acceso actualizado ✓");
  };

  const addComment = async (taskId, comment) => {
    const res = await db.insert("task_comments",{task_id:taskId,user_id:currentUser.id,comment});
    if (Array.isArray(res)&&res[0]) { setComments(p=>[...p,res[0]]); showToast("Nota agregada ✓"); }
  };

  // Filtros
  const visibleTasks = tasks.filter(t => isTaskVisible(t));
  const filteredTasks = [...visibleTasks].filter(t => {
    const assignees = getAssignees(t);
    if (taskScope==="mine" && !assignees.includes(currentUser.id) && t.assigned_by!==currentUser.id) return false;
    if (filterPerson!=="all" && !assignees.includes(parseInt(filterPerson))) return false;
    if (activeStat==="pendiente"  && t.status!=="pendiente") return false;
    if (activeStat==="en-proceso" && t.status!=="en-proceso") return false;
    if (activeStat==="completado" && t.status!=="completado") return false;
    if (activeStat==="vencidas"   && !(isOverdue(t))) return false;
    if (filterPriority!=="all" && t.priority!==filterPriority) return false;
    if (filterStatus!=="all"   && t.status!==filterStatus) return false;
    if (filterCartera!=="all"  && t.cartera!==filterCartera) return false;
    return true;
  }).sort((a,b)=>PRIO_ORDER[a.priority]-PRIO_ORDER[b.priority]);

  const stats = {
    total:     visibleTasks.length,
    pendiente: visibleTasks.filter(t=>t.status==="pendiente").length,
    enProceso: visibleTasks.filter(t=>t.status==="en-proceso").length,
    completado:visibleTasks.filter(t=>t.status==="completado").length,
    vencidas:  visibleTasks.filter(t=>isOverdue(t)).length,
  };

  // Export
  const exportCSV = () => {
    const rows = [["Título","Asignado a","Asignado por","Prioridad","Estado","Cartera","Fecha límite"]];
    filteredTasks.forEach(t=>rows.push([t.title,getUser(t.assigned_to)?.name||"",getUser(t.assigned_by)?.name||"",t.priority,t.status,t.cartera||"",t.due_date||""]));
    const csv = rows.map(r=>r.map(c=>`"${c}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8;"})); a.download="cobros_tareas.csv"; a.click();
    showToast("Excel descargado ✓");
  };

  const exportPDF = () => {
    const win = window.open("","_blank");
    const rows = filteredTasks.map(t=>`<tr><td>${t.title}</td><td>${getUser(t.assigned_to)?.name||""}</td><td>${t.priority}</td><td>${t.status}</td><td>${t.cartera||""}</td><td>${t.due_date||""}</td></tr>`).join("");
    win.document.write(`<!DOCTYPE html><html><head><title>Reporte CobrosTeam</title><style>body{font-family:Arial;padding:24px;color:#111;}h1{color:#FF4D4D;font-size:20px;margin-bottom:4px;}p{color:#666;font-size:12px;margin-bottom:16px;}table{width:100%;border-collapse:collapse;font-size:12px;}th{background:#f5f5f5;padding:8px 10px;text-align:left;border-bottom:2px solid #ddd;font-weight:700;}td{padding:8px 10px;border-bottom:1px solid #eee;}</style></head><body><h1>⚡ Reporte de Tareas — CobrosTeam</h1><p>Generado: ${new Date().toLocaleDateString("es-ES")} · ${filteredTasks.length} tareas</p><table><tr><th>Título</th><th>Asignado a</th><th>Prioridad</th><th>Estado</th><th>Cartera</th><th>Fecha límite</th></tr>${rows}</table></body></html>`);
    win.document.close(); win.print(); showToast("PDF listo ✓");
  };

  if (loading) return (
    <div style={{minHeight:"100vh",background:"#08090E",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Outfit',sans-serif"}}>
      <style>{CSS}</style>
      <div style={{textAlign:"center",color:"#4A5178"}}>
        <div style={{fontSize:32,marginBottom:10}} className="spin">⚡</div>
        <div style={{fontSize:13,fontWeight:600}}>Cargando...</div>
      </div>
    </div>
  );

  const navItems = [
    {v:"tablero",   icon:"▦",  label:"Tablero"},
    {v:"calendario",icon:"◫",  label:"Calendario"},
    {v:"reuniones", icon:"◑",  label:"Reuniones"},
    {v:"equipo",    icon:"◎",  label:"Equipo"},
    {v:"metricas",  icon:"◈",  label:"Métricas"},
  ];

  return (
    <div style={{fontFamily:"'Outfit',sans-serif",background:"#08090E",minHeight:"100vh",color:"#F0F2FF",paddingBottom:70}}>
      <style>{CSS}</style>

      {/* ── HEADER DESKTOP ── */}
      <div className="desktop-only" style={{background:"rgba(8,9,14,.9)",backdropFilter:"blur(20px)",borderBottom:"1px solid #1E2130",padding:"0 24px",position:"sticky",top:0,zIndex:50}}>
        <div style={{maxWidth:1280,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",height:56}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:30,height:30,background:"linear-gradient(135deg,#FF4D4D,#FF9500)",borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,boxShadow:"0 4px 12px rgba(255,77,77,.3)"}}>⚡</div>
            <span className="font-display" style={{fontSize:16,color:"#F0F2FF",letterSpacing:"-0.3px"}}>CobrosTeam</span>
          </div>
          <div style={{display:"flex",gap:2}}>
            {navItems.map(({v,label})=>(
              <button key={v} className={`top-nav-btn ${view===v?"active":""}`} onClick={()=>setView(v)}>{label}</button>
            ))}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {/* Notif */}
            <div style={{position:"relative"}}>
              <button onClick={()=>setShowNotif(!showNotif)} className="btn-icon" style={{position:"relative",fontSize:16}}>
                🔔
                {notifications.length>0&&<span style={{position:"absolute",top:2,right:2,width:7,height:7,background:"#FF4D4D",borderRadius:"50%",border:"1.5px solid #08090E"}}/>}
              </button>
              {showNotif&&(
                <div style={{position:"absolute",right:0,top:42,width:300,background:"#0F1117",border:"1px solid #1E2130",borderRadius:14,padding:14,zIndex:300,boxShadow:"0 20px 60px rgba(0,0,0,.7)"}}>
                  <div style={{fontSize:10,fontWeight:700,color:"#4A5178",textTransform:"uppercase",letterSpacing:".8px",marginBottom:10}}>Alertas · {notifications.length}</div>
                  {notifications.length===0
                    ? <div style={{color:"#4A5178",textAlign:"center",padding:"16px 0",fontSize:12,fontWeight:600}}>Sin alertas ✓</div>
                    : notifications.map(n=>(
                        <div key={n.id} style={{padding:"8px 10px",borderRadius:8,marginBottom:4,background:n.type==="error"?"rgba(255,77,77,.08)":n.type==="warning"?"rgba(255,149,0,.08)":"rgba(10,132,255,.08)",borderLeft:`2px solid ${n.type==="error"?"#FF4D4D":n.type==="warning"?"#FF9500":"#0A84FF"}`,fontSize:12,fontWeight:600,color:"#F0F2FF"}}>
                          {n.msg}
                        </div>
                      ))
                  }
                </div>
              )}
            </div>
            {/* User */}
            <div style={{display:"flex",alignItems:"center",gap:8,background:"#0F1117",border:"1px solid #1E2130",borderRadius:10,padding:"6px 12px"}}>
              <div className="avatar" style={{width:26,height:26,background:currentUser.color+"22",color:currentUser.color,fontSize:9}}>{currentUser.avatar}</div>
              <div>
                <div style={{fontSize:12,fontWeight:700,lineHeight:1.2}}>{currentUser.name.split(" ")[0]}</div>
                <div style={{fontSize:9,color:getRoleColor(currentUser.role),fontWeight:700}}>{getRoleLabel(currentUser.role)}</div>
              </div>
              <button onClick={onLogout} className="btn-icon" style={{marginLeft:2,fontSize:12}} title="Salir">⏏</button>
            </div>
          </div>
        </div>
      </div>

      {/* ── HEADER MOBILE ── */}
      <div className="mobile-only" style={{background:"rgba(8,9,14,.95)",backdropFilter:"blur(20px)",borderBottom:"1px solid #1E2130",padding:"12px 16px",position:"sticky",top:0,zIndex:50,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:28,height:28,background:"linear-gradient(135deg,#FF4D4D,#FF9500)",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>⚡</div>
          <span className="font-display" style={{fontSize:15,color:"#F0F2FF"}}>{navItems.find(n=>n.v===view)?.label}</span>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <div style={{position:"relative"}}>
            <button onClick={()=>setShowNotif(!showNotif)} className="btn-icon" style={{fontSize:15}}>
              🔔{notifications.length>0&&<span style={{position:"absolute",top:2,right:2,width:6,height:6,background:"#FF4D4D",borderRadius:"50%",border:"1.5px solid #08090E"}}/>}
            </button>
            {showNotif&&(
              <div style={{position:"absolute",right:0,top:42,width:280,background:"#0F1117",border:"1px solid #1E2130",borderRadius:14,padding:12,zIndex:300,boxShadow:"0 16px 48px rgba(0,0,0,.8)"}}>
                {notifications.length===0
                  ? <div style={{color:"#4A5178",textAlign:"center",padding:"12px 0",fontSize:12,fontWeight:600}}>Sin alertas ✓</div>
                  : notifications.map(n=>(
                      <div key={n.id} style={{padding:"7px 9px",borderRadius:7,marginBottom:3,background:n.type==="error"?"rgba(255,77,77,.08)":n.type==="warning"?"rgba(255,149,0,.08)":"rgba(10,132,255,.08)",borderLeft:`2px solid ${n.type==="error"?"#FF4D4D":n.type==="warning"?"#FF9500":"#0A84FF"}`,fontSize:11,fontWeight:600,color:"#F0F2FF"}}>
                        {n.msg}
                      </div>
                    ))
                }
              </div>
            )}
          </div>
          <div className="avatar" style={{width:28,height:28,background:currentUser.color+"22",color:currentUser.color,fontSize:9,cursor:"pointer"}} onClick={onLogout} title="Salir">{currentUser.avatar}</div>
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div style={{maxWidth:1280,margin:"0 auto",padding:"20px 16px"}}>

        {/* ══ TABLERO ══ */}
        {view==="tablero"&&(
          <>
            {/* Stats */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8,marginBottom:18}}>
              {[
                {key:null,        l:"Total",      v:stats.total,     c:"#0A84FF"},
                {key:"pendiente", l:"Pendientes", v:stats.pendiente, c:"#8891B0"},
                {key:"en-proceso",l:"En proceso", v:stats.enProceso, c:"#FF9500"},
                {key:"completado",l:"Completadas",v:stats.completado,c:"#30D158"},
                {key:"vencidas",  l:"Vencidas",   v:stats.vencidas,  c:"#FF4D4D"},
              ].map((s,i)=>(
                <div key={i} className={`stat-card ${activeStat===s.key&&s.key?"active-stat":""}`}
                  onClick={()=>{setActiveStat(activeStat===s.key?null:s.key);if(s.key)setFilterStatus("all");}}>
                  <div style={{position:"absolute",top:-10,right:-10,width:60,height:60,background:s.c,borderRadius:"50%",opacity:.08,filter:"blur(16px)"}}/>
                  <div style={{fontSize:10,fontWeight:700,color:"#4A5178",textTransform:"uppercase",letterSpacing:".6px",marginBottom:8}}>{s.l}</div>
                  <div className="font-display" style={{fontSize:32,color:s.c,lineHeight:1,letterSpacing:"-1px"}}>{s.v}</div>
                  <div style={{height:3,background:"#1E2130",borderRadius:2,marginTop:10,overflow:"hidden"}}>
                    <div style={{height:"100%",background:s.c,borderRadius:2,width:`${stats.total>0?(s.v/stats.total)*100:0}%`,transition:"width .6s ease",opacity:.7}}/>
                  </div>
                </div>
              ))}
            </div>

            {/* Controls */}
            <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
              <div className="font-display" style={{fontSize:18,color:"#F0F2FF",marginRight:"auto",letterSpacing:"-0.3px"}}>Tareas</div>
              <div className="seg-control">
                <button className={`seg-btn ${taskScope==="all"?"active":""}`} onClick={()=>setTaskScope("all")}>Todas</button>
                <button className={`seg-btn ${taskScope==="mine"?"active":""}`} onClick={()=>setTaskScope("mine")}>Mis tareas</button>
              </div>
              <select className="input" style={{width:"auto",fontSize:12,padding:"7px 12px"}} value={filterCartera} onChange={e=>setFilterCartera(e.target.value)}>
                <option value="all">Cartera</option>
                {carteras.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
              <select className="input" style={{width:"auto",fontSize:12,padding:"7px 12px"}} value={filterPerson} onChange={e=>setFilterPerson(e.target.value)}>
                <option value="all">Persona</option>
                {users.map(u=><option key={u.id} value={u.id}>{u.name.split(" ")[0]}</option>)}
              </select>
              <select className="input" style={{width:"auto",fontSize:12,padding:"7px 12px"}} value={filterPriority} onChange={e=>setFilterPriority(e.target.value)}>
                <option value="all">Prioridad</option>
                {PRIORITIES.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
              <select className="input" style={{width:"auto",fontSize:12,padding:"7px 12px"}} value={filterStatus} onChange={e=>{setFilterStatus(e.target.value);setActiveStat(null);}}>
                <option value="all">Estado</option>
                <option value="pendiente">Pendiente</option>
                <option value="en-proceso">En proceso</option>
                <option value="completado">Completado</option>
              </select>
              <button className="btn btn-glass" style={{fontSize:12}} onClick={exportCSV}>↓ Excel</button>
              <button className="btn btn-glass" style={{fontSize:12}} onClick={exportPDF}>⎙ PDF</button>
              <button className="btn btn-red" onClick={()=>setShowNewTask(true)}>+ Tarea</button>
            </div>

            {/* Task list */}
            {filteredTasks.length===0&&(
              <div style={{textAlign:"center",color:"#4A5178",padding:"48px 0",fontSize:14,fontWeight:600}}>
                <div style={{fontSize:32,marginBottom:8}}>📭</div>
                No hay tareas con esos filtros
              </div>
            )}
            {filteredTasks.map(task=>{
              const assignees   = getAssignees(task).map(id=>getUser(id)).filter(Boolean);
              const assigner    = getUser(task.assigned_by);
              const prio        = PRIORITIES.find(p=>p.value===task.priority);
              const dl          = daysLeft(task.due_date);
              const isOver      = isOverdue(task);
              const taskComments= comments.filter(c=>c.task_id===task.id);
              const taskHistory = history.filter(h=>h.task_id===task.id);
              const isExpanded  = expandedTask===task.id;
              const isGerenteTask = getUser(task.assigned_by)?.role==="gerente";

              return (
                <div key={task.id} className="task-row" style={{borderLeft:`3px solid ${isOver?"#FF4D4D":task.status==="completado"?"#30D15844":"transparent"}`}}>
                  <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
                    {/* Avatars — show up to 3 */}
                    <div style={{display:"flex",flexDirection:"column",gap:2,flexShrink:0,marginTop:2}}>
                      {assignees.slice(0,3).map(u=>(
                        <div key={u.id} className="avatar" style={{width:28,height:28,background:u.color+"22",color:u.color,fontSize:9}}>{u.avatar}</div>
                      ))}
                      {assignees.length>3&&<div style={{width:28,height:18,background:"#1E2130",borderRadius:4,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#4A5178",fontWeight:700}}>+{assignees.length-3}</div>}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      {/* Title row */}
                      <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:4}}>
                        <span style={{fontWeight:700,fontSize:14,color:task.status==="completado"?"#4A5178":"#F0F2FF",textDecoration:task.status==="completado"?"line-through":"none",lineHeight:1.3}}>{task.title}</span>
                        {prio&&<span className="badge" style={{color:prio.color,background:prio.bg,fontSize:10}}>{prio.label}</span>}
                        {task.cartera&&<span className="badge" style={{color:"#8891B0",background:"rgba(136,145,176,.1)",fontSize:10}}>{task.cartera.replace("Cartera ","")}</span>}
                        {task.status!=="completado"&&dl!==null&&(
                          <span className="pill" style={{background:isOver?"rgba(255,77,77,.15)":dl!==null&&dl<=2?"rgba(255,149,0,.15)":"rgba(136,145,176,.1)",color:isOver?"#FF4D4D":dl!==null&&dl<=2?"#FF9500":"#8891B0"}}>
                            {isOver?"VENCIDA":dl===1?"Mañana":dl===0?"Hoy":`${dl}d`}
                          </span>
                        )}
                        {isGerenteTask&&!task.is_published&&<span className="pill" style={{background:"rgba(74,81,120,.2)",color:"#4A5178"}}>🔒 Privada</span>}
                        {task.recurrence&&<span className="pill" style={{background:"rgba(191,90,242,.12)",color:"#BF5AF2"}}>↻ {task.recurrence}</span>}
                        {taskComments.length>0&&<span style={{fontSize:10,color:"#4A5178",fontWeight:700}}>💬 {taskComments.length}</span>}
                      </div>

                      {task.description&&<div style={{fontSize:12,color:"#8891B0",marginBottom:6,lineHeight:1.5}}>{task.description}</div>}

                      <div style={{display:"flex",gap:12,fontSize:11,color:"#4A5178",flexWrap:"wrap",fontWeight:600}}>
                        {task.start_date&&<span style={{color:"#30D158"}}>● {fmtShort(task.start_date)}</span>}
                        {task.due_date&&<span style={{color:isOver?"#FF4D4D":"#4A5178"}}>◎ {fmtDate(task.due_date)}{task.task_time&&<span style={{color:"#8891B0"}}> {task.task_time}</span>}</span>}
                        {assigner&&<span>↑ <span style={{color:assigner.color}}>{assigner.role==="gerente"?"Gte":assigner.name.split(" ")[0]}</span></span>}
                        {assignees.length>0&&<span>→ {assignees.map((u,i)=><span key={u.id}>{i>0?", ":""}<span style={{color:u.color}}>{u.name.split(" ")[0]}</span></span>)}</span>}
                        {/* Conflict indicator on row */}
                        {task.task_time&&(()=>{
                          const rowConflicts = detectConflicts({date:task.due_date,time:task.task_time,excludeId:task.id,excludeType:"task",userIds:getAssignees(task),tasks,meetings,users});
                          return rowConflicts.length>0?(
                            <span style={{color:"#FF9500",fontWeight:800,fontSize:10,background:"rgba(255,149,0,.1)",border:"1px solid rgba(255,149,0,.3)",borderRadius:4,padding:"1px 6px"}}>
                              ⚠ Conflicto
                            </span>
                          ):null;
                        })()}
                      </div>

                      {/* Expanded: comments + history */}
                      {isExpanded&&(
                        <div style={{marginTop:12,background:"#0A0B10",borderRadius:10,padding:12,border:"1px solid #1E2130"}}>
                          <div style={{fontSize:11,fontWeight:700,color:"#4A5178",textTransform:"uppercase",letterSpacing:".6px",marginBottom:10}}>Notas de avance · {taskComments.length}</div>
                          {taskComments.length===0&&<div style={{color:"#4A5178",fontSize:12,fontWeight:600,padding:"8px 0"}}>Sin notas aún</div>}
                          {taskComments.map(c=>{
                            const cu = getUser(c.user_id);
                            return (
                              <div key={c.id} className="comment-bubble">
                                <div style={{display:"flex",gap:7,alignItems:"flex-start"}}>
                                  {cu&&<div className="avatar" style={{width:22,height:22,background:cu.color+"22",color:cu.color,fontSize:8,marginTop:1,flexShrink:0}}>{cu.avatar}</div>}
                                  <div style={{flex:1}}>
                                    <div style={{fontSize:10,fontWeight:700,color:cu?.color||"#F0F2FF",marginBottom:2}}>{cu?.name.split(" ")[0]||"?"} <span style={{color:"#4A5178",fontWeight:400}}>{new Date(c.created_at).toLocaleDateString("es-ES",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</span></div>
                                    <div style={{fontSize:12,color:"#C8CAD8",lineHeight:1.5}}>{c.comment}</div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          <CommentInput onAdd={txt=>addComment(task.id,txt)} />
                          {taskHistory.length>0&&(
                            <button className="btn btn-ghost" style={{marginTop:8,fontSize:11,width:"100%",justifyContent:"center"}} onClick={()=>setShowHistory(taskHistory)}>
                              📋 Ver historial ({taskHistory.length} cambios)
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div style={{display:"flex",gap:4,alignItems:"flex-start",flexShrink:0,flexWrap:"wrap",justifyContent:"flex-end"}}>
                      {/* Status badge */}
                      <span style={{background:task.status==="completado"?"rgba(48,209,88,.12)":task.status==="en-proceso"?"rgba(255,149,0,.12)":"rgba(136,145,176,.08)",color:task.status==="completado"?"#30D158":task.status==="en-proceso"?"#FF9500":"#8891B0",padding:"4px 10px",borderRadius:6,fontSize:10,fontWeight:800,textTransform:"uppercase",letterSpacing:".3px"}}>
                        {task.status==="completado"?"✓ Hecho":task.status==="en-proceso"?"● Proceso":"○ Pend."}
                      </span>
                      {/* Advance */}
                      {canUpdateStatus(task)&&STATUS_NEXT[task.status]&&(
                        <button onClick={()=>updateStatus(task.id,STATUS_NEXT[task.status])} style={{background:task.status==="pendiente"?"rgba(255,149,0,.12)":"rgba(48,209,88,.12)",color:task.status==="pendiente"?"#FF9500":"#30D158",border:"none",borderRadius:6,padding:"4px 10px",fontSize:10,fontWeight:800,cursor:"pointer"}}>
                          {task.status==="pendiente"?"▶ Iniciar":"✓ Listo"}
                        </button>
                      )}
                      {/* Revert */}
                      {canUpdateStatus(task)&&STATUS_PREV[task.status]&&(
                        <button title="Revertir" onClick={()=>updateStatus(task.id,STATUS_PREV[task.status])} style={{background:"rgba(255,149,0,.08)",color:"#FF9500",border:"1px solid rgba(255,149,0,.2)",borderRadius:6,padding:"4px 8px",fontSize:11,cursor:"pointer",fontWeight:700}}>↩</button>
                      )}
                      <button className="btn-icon" onClick={()=>setExpandedTask(isExpanded?null:task.id)} title="Notas">💬</button>
                      <button className="btn-icon" onClick={()=>setEditingTask(task)} title="Editar">✏</button>
                      {isGerente&&isGerenteTask&&<button className="btn-icon" onClick={()=>togglePublish(task)} title={task.is_published?"Ocultar":"Publicar"}>{task.is_published?"🔒":"👁"}</button>}
                      {isGerente&&<button className="btn-icon" onClick={()=>setShowVisibility(task)} title="Control de acceso">⚙</button>}
                      {canDelete(task)&&<button className="btn-danger-icon" onClick={()=>setConfirmDelete({type:"task",id:task.id,name:task.title})} title="Eliminar">🗑</button>}
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* ══ CALENDARIO ══ */}
        {view==="calendario"&&(
          <CalendarView
            tasks={visibleTasks} meetings={meetings} users={users}
            currentUser={currentUser}
            calScope={calScope} setCalScope={setCalScope}
            isTaskVisible={isTaskVisible} calDate={calDate} setCalDate={setCalDate}
            calView={calView} setCalView={setCalView}
            onItemClick={item=>setCalSelectedItem(item)}
          />
        )}

        {/* ══ REUNIONES ══ */}
        {view==="reuniones"&&(
          <>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
              <div>
                <div className="font-display" style={{fontSize:18,color:"#F0F2FF",letterSpacing:"-0.3px"}}>Reuniones</div>
                <div style={{color:"#4A5178",fontSize:12,marginTop:2,fontWeight:600}}>{meetings.length} agendadas</div>
              </div>
              <button className="btn btn-red" onClick={()=>setShowNewMeeting(true)}>+ Reunión</button>
            </div>
            {[...meetings].sort((a,b)=>new Date(a.date+"T"+a.time)-new Date(b.date+"T"+b.time)).map(m=>{
              const mt      = MEET_TYPES[m.type]||MEET_TYPES.otro;
              const dl      = daysLeft(m.date);
              const creator = getUser(m.created_by);
              return (
                <div key={m.id} className="meeting-card">
                  <div style={{display:"flex",gap:14,alignItems:"flex-start"}}>
                    {/* Date block */}
                    <div style={{background:mt.color+"15",border:`1px solid ${mt.color}33`,borderRadius:12,padding:"10px 12px",textAlign:"center",minWidth:52,flexShrink:0}}>
                      <div style={{fontSize:9,fontWeight:800,color:mt.color,textTransform:"uppercase",letterSpacing:".5px"}}>{new Date(m.date+"T00:00:00").toLocaleDateString("es-ES",{month:"short"})}</div>
                      <div className="font-display" style={{fontSize:24,color:"#F0F2FF",lineHeight:1,letterSpacing:"-1px"}}>{new Date(m.date+"T00:00:00").getDate()}</div>
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",marginBottom:4}}>
                        <span style={{fontWeight:700,fontSize:14}}>{m.title}</span>
                        <span className="badge" style={{color:mt.color,background:mt.color+"15",fontSize:10}}>{mt.icon} {mt.label}</span>
                        {dl===0&&<span className="badge" style={{color:"#FF4D4D",background:"rgba(255,77,77,.1)",fontSize:10}}>HOY</span>}
                        {dl===1&&<span className="badge" style={{color:"#FF9500",background:"rgba(255,149,0,.1)",fontSize:10}}>Mañana</span>}
                        {(()=>{
                          const mc=detectConflicts({date:m.date,time:m.time,excludeId:m.id,excludeType:"meeting",userIds:m.participants||[],tasks:visibleTasks,meetings,users});
                          return mc.length>0?<span style={{color:"#FF9500",fontWeight:800,fontSize:10,background:"rgba(255,149,0,.1)",border:"1px solid rgba(255,149,0,.3)",borderRadius:4,padding:"1px 6px"}}>⚠ {mc.length} conflicto{mc.length>1?"s":""}</span>:null;
                        })()}
                      </div>
                      <div style={{fontSize:11,color:"#4A5178",marginBottom:10,fontWeight:600}}>
                        🕐 {m.time}{m.notes?` · ${m.notes}`:""}{creator?` · Por ${creator.role==="gerente"?"Gerente":creator.name.split(" ")[0]}`:""}</div>
                      <div style={{display:"flex",gap:3,flexWrap:"wrap",alignItems:"center",marginBottom:8}}>
                        {(m.participants||[]).map(pid=>{const u=getUser(pid);return u?<div key={pid} className="avatar" style={{width:22,height:22,background:u.color+"22",color:u.color,fontSize:8,border:`1px solid ${u.color}33`}} title={u.name}>{u.avatar}</div>:null;})}
                        <span style={{fontSize:10,color:"#4A5178",fontWeight:600,paddingLeft:4}}>{(m.participants||[]).length} participantes</span>
                      </div>
                      <ActaSection meeting={m} currentUser={currentUser} onSave={async acta=>{
                        await db.update("meetings",m.id,{acta,acta_updated_by:currentUser.id,acta_updated_at:new Date().toISOString()});
                        setMeetings(p=>p.map(x=>x.id===m.id?{...x,acta,acta_updated_by:currentUser.id}:x));
                        showToast("Acta guardada ✓");
                      }} updatedBy={getUser(m.acta_updated_by)} />
                    </div>
                    <div style={{display:"flex",gap:6}}>
                      {canDelete(m)&&<button className="btn btn-glass" style={{fontSize:11,padding:"5px 10px"}} onClick={()=>setEditingMeeting(m)}>✏ Editar</button>}
                      {canDelete(m)&&<button className="btn-danger-icon" onClick={()=>setConfirmDelete({type:"meeting",id:m.id,name:m.title})}>🗑</button>}
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* ══ EQUIPO ══ */}
        {view==="equipo"&&(
          <>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
              <div className="font-display" style={{fontSize:18,color:"#F0F2FF",letterSpacing:"-0.3px"}}>Equipo</div>
              {selectedMember&&(
                <button className="btn btn-glass" style={{fontSize:12}} onClick={()=>setSelectedMember(null)}>← Ver todos</button>
              )}
            </div>
            <div style={{color:"#4A5178",fontSize:12,marginBottom:18,fontWeight:600}}>
              {selectedMember ? `Tareas de ${selectedMember.name.split(" ")[0]}` : "Carga y progreso · clic en una persona para ver sus tareas"}
            </div>

            {/* Member tasks drill-down */}
            {selectedMember ? (
              <div>
                <div style={{display:"flex",alignItems:"center",gap:10,background:"#0F1117",border:"1px solid #1E2130",borderRadius:12,padding:"12px 16px",marginBottom:14}}>
                  <div className="avatar" style={{width:40,height:40,background:selectedMember.color+"22",color:selectedMember.color,fontSize:13,border:`2px solid ${selectedMember.color}33`}}>{selectedMember.avatar}</div>
                  <div>
                    <div style={{fontWeight:700,fontSize:14}}>{selectedMember.name}</div>
                    <span className="badge" style={{color:getRoleColor(selectedMember.role),background:getRoleColor(selectedMember.role)+"15",fontSize:10}}>{getRoleLabel(selectedMember.role)}</span>
                  </div>
                </div>
                {tasks.filter(t=>(Array.isArray(t.assigned_to)?t.assigned_to:[t.assigned_to]).includes(selectedMember.id)).length===0
                  ? <div style={{textAlign:"center",color:"#4A5178",padding:"32px 0",fontSize:13,fontWeight:600}}>📭 Sin tareas asignadas</div>
                  : [...tasks.filter(t=>(Array.isArray(t.assigned_to)?t.assigned_to:[t.assigned_to]).includes(selectedMember.id))].sort((a,b)=>PRIO_ORDER[a.priority]-PRIO_ORDER[b.priority]).map(task=>{
                      const prio=PRIORITIES.find(p=>p.value===task.priority);
                      const dl=daysLeft(task.due_date);
                      const isOver=isOverdue(task);
                      return (
                        <div key={task.id} className="task-row" style={{borderLeft:`3px solid ${isOver?"#FF4D4D":task.status==="completado"?"#30D15844":"transparent"}`}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10}}>
                            <div style={{flex:1}}>
                              <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",marginBottom:3}}>
                                <span style={{fontWeight:700,fontSize:13,color:task.status==="completado"?"#4A5178":"#F0F2FF",textDecoration:task.status==="completado"?"line-through":"none"}}>{task.title}</span>
                                {prio&&<span className="badge" style={{color:prio.color,background:prio.bg,fontSize:10}}>{prio.label}</span>}
                                {task.cartera&&<span className="badge" style={{color:"#8891B0",background:"rgba(136,145,176,.1)",fontSize:10}}>{task.cartera.replace("Cartera ","")}</span>}
                              </div>
                              <div style={{fontSize:11,color:"#4A5178",fontWeight:600,display:"flex",gap:10,flexWrap:"wrap"}}>
                                {task.due_date&&<span style={{color:isOver?"#FF4D4D":"#4A5178"}}>◎ {fmtDate(task.due_date)}</span>}
                                {task.task_time&&<span>🕐 {task.task_time}</span>}
                              </div>
                            </div>
                            <span style={{background:task.status==="completado"?"rgba(48,209,88,.12)":task.status==="en-proceso"?"rgba(255,149,0,.12)":"rgba(136,145,176,.08)",color:task.status==="completado"?"#30D158":task.status==="en-proceso"?"#FF9500":"#8891B0",padding:"4px 10px",borderRadius:6,fontSize:10,fontWeight:800,textTransform:"uppercase",flexShrink:0}}>
                              {task.status==="completado"?"✓ Hecho":task.status==="en-proceso"?"● Proceso":"○ Pend."}
                            </span>
                          </div>
                        </div>
                      );
                    })
                }
              </div>
            ) : (
              <>
                {isGerente&&<ManageUsers users={users} onRefresh={refreshUsers} showToast={showToast} roles={roles} saveRoles={saveRoles} carteras={carteras} saveCarteras={saveCarteras} getRoleLabel={getRoleLabel} getRoleColor={getRoleColor} />}
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(250px,1fr))",gap:10,marginTop:isGerente?0:0}}>
                  {users.filter(u=>u.role!=="gerente").map(member=>{
                  const mt   = tasks.filter(t=>(Array.isArray(t.assigned_to)?t.assigned_to:[t.assigned_to]).includes(member.id));
                    const done = mt.filter(t=>t.status==="completado").length;
                    const ov   = mt.filter(t=>isOverdue(t)).length;
                    const pct  = mt.length>0?Math.round((done/mt.length)*100):0;
                    return (
                      <div key={member.id} onClick={()=>setSelectedMember(member)} style={{background:"#0F1117",border:"1px solid #1E2130",borderRadius:14,padding:16,cursor:"pointer",transition:"all .18s"}}
                        onMouseEnter={e=>e.currentTarget.style.borderColor="#2A2D3E"}
                        onMouseLeave={e=>e.currentTarget.style.borderColor="#1E2130"}>
                        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                          <div className="avatar" style={{width:42,height:42,background:member.color+"22",color:member.color,fontSize:13,border:`2px solid ${member.color}33`}}>{member.avatar}</div>
                          <div style={{flex:1}}>
                            <div style={{fontWeight:700,fontSize:13}}>{member.name}</div>
                            <span className="badge" style={{color:getRoleColor(member.role),background:getRoleColor(member.role)+"15",fontSize:10}}>{getRoleLabel(member.role)}</span>
                          </div>
                          {ov>0&&<span className="badge" style={{color:"#FF4D4D",background:"rgba(255,77,77,.1)",fontSize:10}}>⚠ {ov}</span>}
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:5,marginBottom:10}}>
                          {[["Pend.",mt.filter(t=>t.status==="pendiente").length,"#8891B0"],["Proceso",mt.filter(t=>t.status==="en-proceso").length,"#FF9500"],["Listo",done,"#30D158"],["Vencidas",ov,"#FF4D4D"]].map(([l,v,c])=>(
                            <div key={l} style={{background:l==="Vencidas"&&v>0?"rgba(255,77,77,.06)":"#0A0B10",borderRadius:8,padding:"8px 4px",textAlign:"center",border:`1px solid ${l==="Vencidas"&&v>0?"rgba(255,77,77,.25)":"#1E2130"}`}}>
                              <div className="font-display" style={{fontSize:20,color:l==="Vencidas"&&v===0?"#2A2D3E":c,lineHeight:1,letterSpacing:"-0.5px"}}>{v}</div>
                              <div style={{fontSize:8,color:l==="Vencidas"&&v>0?c:"#4A5178",textTransform:"uppercase",letterSpacing:".4px",fontWeight:700,marginTop:2}}>{l}</div>
                            </div>
                          ))}
                        </div>
                        <div style={{height:4,background:"#1E2130",borderRadius:2,overflow:"hidden"}}>
                          <div style={{height:"100%",background:`linear-gradient(90deg,${member.color},${member.color}88)`,borderRadius:2,width:`${pct}%`,transition:"width .6s ease"}}/>
                        </div>
                        <div style={{fontSize:10,color:"#4A5178",marginTop:5,textAlign:"right",fontWeight:700}}>{pct}% completado · {mt.length} tareas</div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
        {view==="metricas"&&(
          <MetricasView tasks={tasks} meetings={meetings} users={users} getAssignees={getAssignees} getRoleLabel={getRoleLabel} getRoleColor={getRoleColor} />
        )}

      </div>

      {/* ── BOTTOM NAV MOBILE ── */}
      <div className="mobile-only" style={{position:"fixed",bottom:0,left:0,right:0,background:"rgba(8,9,14,.95)",backdropFilter:"blur(20px)",borderTop:"1px solid #1E2130",display:"flex",justifyContent:"space-around",padding:"8px 0 12px",zIndex:50}}>
        {navItems.map(({v,icon,label})=>(
          <button key={v} className={`nav-item ${view===v?"active":""}`} onClick={()=>setView(v)}>
            <span className="nav-icon">{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* ── MODALES ── */}
      {showNewTask&&(
        <TaskModal mode="create" currentUser={currentUser} users={users} tasks={tasks} meetings={meetings} carteras={carteras} getRoleLabel={getRoleLabel} getRoleColor={getRoleColor} onClose={()=>setShowNewTask(false)}
          onSave={async form=>{
            const assignees = Array.isArray(form.assignedTo)?form.assignedTo:[form.assignedTo];
            const data={title:form.title,description:form.description,assigned_to:assignees,assigned_by:currentUser.id,priority:form.priority,status:"pendiente",due_date:form.due_date,start_date:form.start_date||null,task_time:form.task_time||null,cartera:form.cartera,is_published:currentUser.role!=="gerente"?true:(form.is_published??true),recurrence:form.recurrence||null,recurrence_days:form.recurrence_days||null,recurrence_end:form.recurrence_end||null,notify_before:form.notify_before||null};
            const res=await db.insert("tasks",data);
            if(Array.isArray(res)&&res[0]){ setTasks(p=>[normalizeTask(res[0]),...p]); await logHistory(res[0].id,"created","",form.title); }
            setShowNewTask(false); showToast("Tarea creada ✓"); refreshTasks();
          }}
        />
      )}

      {editingTask&&(
        <TaskModal mode="edit" task={editingTask} currentUser={currentUser} users={users} tasks={tasks} meetings={meetings} carteras={carteras} getRoleLabel={getRoleLabel} getRoleColor={getRoleColor} onClose={()=>setEditingTask(null)}
          onSave={async form=>{
            const assignees = Array.isArray(form.assignedTo)?form.assignedTo:[form.assignedTo];
            const data={title:form.title,description:form.description,assigned_to:assignees,priority:form.priority,due_date:form.due_date,start_date:form.start_date||null,task_time:form.task_time||null,cartera:form.cartera,recurrence:form.recurrence||null,recurrence_days:form.recurrence_days||null,recurrence_end:form.recurrence_end||null,notify_before:form.notify_before||null};
            await db.update("tasks",editingTask.id,data);
            await logHistory(editingTask.id,"edit","","Editada");
            setTasks(p=>p.map(t=>t.id===editingTask.id?normalizeTask({...t,...data}):t));
            setEditingTask(null); showToast("Tarea actualizada ✓"); refreshTasks();
          }}
        />
      )}

      {showNewMeeting&&(
        <NewMeetingModal currentUser={currentUser} users={users} tasks={tasks} meetings={meetings} getRoleLabel={getRoleLabel} getRoleColor={getRoleColor} onClose={()=>setShowNewMeeting(false)}
          onSave={async form=>{
            const clean = {...form,
              recurrence:      form.recurrence      || null,
              recurrence_days: form.recurrence_days?.length ? form.recurrence_days : null,
              recurrence_end:  form.recurrence_end  || null,
              notify_before:   form.notify_before?.length   ? form.notify_before   : null,
            };
            const res=await db.insert("meetings",{...clean,created_by:currentUser.id});
            if(Array.isArray(res)&&res[0]) setMeetings(p=>[normalizeMeeting(res[0]),...p]);
            setShowNewMeeting(false); showToast("Reunión agendada ✓"); refreshMeetings();
          }}
        />
      )}

      {editingMeeting&&(
        <NewMeetingModal editingMeeting={editingMeeting} currentUser={currentUser} users={users} tasks={tasks} meetings={meetings} getRoleLabel={getRoleLabel} getRoleColor={getRoleColor} onClose={()=>setEditingMeeting(null)}
          onSave={async form=>{
            const clean = {...form,
              recurrence:      form.recurrence      || null,
              recurrence_days: form.recurrence_days?.length ? form.recurrence_days : null,
              recurrence_end:  form.recurrence_end  || null,
              notify_before:   form.notify_before?.length   ? form.notify_before   : null,
            };
            await db.update("meetings",editingMeeting.id,clean);
            setMeetings(p=>p.map(m=>m.id===editingMeeting.id?normalizeMeeting({...m,...clean}):m));
            setEditingMeeting(null); showToast("Reunión actualizada ✓"); refreshMeetings();
          }}
        />
      )}

      {showVisibility&&<VisibilityModal task={showVisibility} users={users} getRoleLabel={getRoleLabel} getRoleColor={getRoleColor} onClose={()=>setShowVisibility(null)} onSave={saveVisibility}/>}

      {showHistory&&(
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowHistory(null)}>
          <div className="modal" style={{maxWidth:420}}>
            <div className="font-display" style={{fontSize:17,marginBottom:16}}>📋 Historial de cambios</div>
            {showHistory.length===0&&<div style={{color:"#4A5178",textAlign:"center",padding:"20px 0",fontWeight:600}}>Sin historial</div>}
            {showHistory.map(h=>{
              const u=getUser(h.user_id);
              return (
                <div key={h.id} className="history-item">
                  <div style={{display:"flex",gap:8,alignItems:"flex-start"}}>
                    {u&&<div className="avatar" style={{width:22,height:22,background:u.color+"22",color:u.color,fontSize:8,marginTop:1,flexShrink:0}}>{u.avatar}</div>}
                    <div>
                      <span style={{fontWeight:700,color:"#F0F2FF"}}>{u?.name.split(" ")[0]||"?"}</span>
                      <span style={{color:"#4A5178"}}> · {h.action==="status_change"?`${h.old_value} → ${h.new_value}`:h.action==="created"?"Creó la tarea":"Editó la tarea"}</span>
                      <div style={{fontSize:10,color:"#4A5178",marginTop:2,fontWeight:600}}>{new Date(h.created_at).toLocaleDateString("es-ES",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</div>
                    </div>
                  </div>
                </div>
              );
            })}
            <button className="btn btn-glass" style={{width:"100%",justifyContent:"center",marginTop:14}} onClick={()=>setShowHistory(null)}>Cerrar</button>
          </div>
        </div>
      )}

      {confirmDelete&&(
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setConfirmDelete(null)}>
          <div className="modal" style={{maxWidth:320,textAlign:"center"}}>
            <div style={{fontSize:36,marginBottom:10}}>🗑</div>
            <div className="font-display" style={{fontSize:16,marginBottom:8}}>¿Eliminar?</div>
            <div style={{color:"#8891B0",fontSize:13,marginBottom:20,fontWeight:500}}>"{confirmDelete.name}"</div>
            <div style={{display:"flex",gap:8}}>
              <button className="btn btn-glass" style={{flex:1,justifyContent:"center"}} onClick={()=>setConfirmDelete(null)}>Cancelar</button>
              <button className="btn btn-red" style={{flex:1,justifyContent:"center",background:"linear-gradient(135deg,#FF4D4D,#c0392b)",boxShadow:"none"}} onClick={()=>confirmDelete.type==="task"?deleteTask(confirmDelete.id):deleteMeeting(confirmDelete.id)}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* CALENDAR ITEM DETAIL */}
      {calSelectedItem&&(
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setCalSelectedItem(null)}>
          <div className="modal" style={{maxWidth:420}}>
            {calSelectedItem.type==="task"?(()=>{
              const t=calSelectedItem;
              const prio=PRIORITIES.find(p=>p.value===t.priority);
              const assignees=(Array.isArray(t.assigned_to)?t.assigned_to:(t.assigned_to?[t.assigned_to]:[])).map(id=>users.find(u=>u.id===id)).filter(Boolean);
              const assigner=users.find(u=>u.id===t.assigned_by);
              const dl=daysLeft(t.due_date);
              return (
                <>
                  <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:4}}>
                    <span style={{fontSize:18}}>📋</span>
                    <div className="font-display" style={{fontSize:16,flex:1}}>{t.title}</div>
                    {prio&&<span className="badge" style={{color:prio.color,background:prio.bg}}>{prio.label}</span>}
                  </div>
                  {t.description&&<div style={{fontSize:13,color:"#8891B0",marginBottom:12,lineHeight:1.6}}>{t.description}</div>}
                  <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:16}}>
                    {assignees.length>0&&<div style={{fontSize:12}}><span style={{color:"#4A5178",fontWeight:700}}>Responsables: </span>{assignees.map((u,i)=><span key={u.id}>{i>0?", ":""}<span style={{color:u.color}}>{u.name.split(" ")[0]}</span></span>)}</div>}
                    {assigner&&<div style={{fontSize:12,color:"#4A5178"}}><span style={{fontWeight:700}}>Asignado por: </span><span style={{color:assigner.color}}>{assigner.name.split(" ")[0]}</span></div>}
                    {t.due_date&&<div style={{fontSize:12,color:isOverdue(t)?"#FF4D4D":"#8891B0"}}><span style={{fontWeight:700,color:"#4A5178"}}>Vence: </span>{fmtDate(t.due_date)}{t.task_time&&` a las ${t.task_time}`}{isOverdue(t)&&" · VENCIDA"}</div>}
                    {t.cartera&&<div style={{fontSize:12,color:"#8891B0"}}><span style={{fontWeight:700,color:"#4A5178"}}>Cartera: </span>{t.cartera}</div>}
                    {t.recurrence&&<div style={{fontSize:12,color:"#BF5AF2"}}><span style={{fontWeight:700,color:"#4A5178"}}>Recurrencia: </span>🔁 {t.recurrence}{t.recurrence_end&&` hasta ${fmtDate(t.recurrence_end)}`}</div>}
                    <div style={{fontSize:12}}><span style={{fontWeight:700,color:"#4A5178"}}>Estado: </span><span style={{color:t.status==="completado"?"#30D158":t.status==="en-proceso"?"#FF9500":"#8891B0",fontWeight:700}}>{t.status}</span></div>
                  </div>
                  <button className="btn btn-glass" style={{width:"100%",justifyContent:"center"}} onClick={()=>setCalSelectedItem(null)}>Cerrar</button>
                </>
              );
            })():(()=>{
              const m=calSelectedItem;
              const mt=MEET_TYPES[m.type]||MEET_TYPES.otro;
              const creator=users.find(u=>u.id===m.created_by);
              return (
                <>
                  <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:4}}>
                    <span style={{fontSize:18}}>{mt.icon}</span>
                    <div className="font-display" style={{fontSize:16,flex:1}}>{m.title}</div>
                    <span className="badge" style={{color:mt.color,background:mt.color+"15"}}>{mt.label}</span>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:14}}>
                    <div style={{fontSize:12,color:"#8891B0"}}><span style={{fontWeight:700,color:"#4A5178"}}>Fecha: </span>{fmtDate(m.date)} a las {m.time}</div>
                    {creator&&<div style={{fontSize:12,color:"#8891B0"}}><span style={{fontWeight:700,color:"#4A5178"}}>Creada por: </span>{creator.name.split(" ")[0]}</div>}
                    {m.notes&&<div style={{fontSize:12,color:"#8891B0"}}><span style={{fontWeight:700,color:"#4A5178"}}>Agenda: </span>{m.notes}</div>}
                    <div style={{fontSize:12,color:"#4A5178",fontWeight:700,marginTop:4}}>Participantes</div>
                    <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                      {(m.participants||[]).map(pid=>{const u=users.find(x=>x.id===pid);return u?<div key={pid} style={{display:"flex",alignItems:"center",gap:5,background:"#0A0B10",borderRadius:6,padding:"4px 8px"}}><div className="avatar" style={{width:18,height:18,background:u.color+"22",color:u.color,fontSize:7}}>{u.avatar}</div><span style={{fontSize:11,fontWeight:600}}>{u.name.split(" ")[0]}</span></div>:null;})}
                    </div>
                    {m.acta&&<div style={{marginTop:6}}><div style={{fontSize:11,fontWeight:700,color:"#4A5178",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Acta</div><div style={{fontSize:12,color:"#C8CAD8",lineHeight:1.6,background:"#0A0B10",borderRadius:8,padding:10,whiteSpace:"pre-wrap"}}>{m.acta}</div></div>}
                  </div>
                  <button className="btn btn-glass" style={{width:"100%",justifyContent:"center"}} onClick={()=>setCalSelectedItem(null)}>Cerrar</button>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast&&(
        <div className="toast-wrap">
          <div className="toast slide-up" style={{background:toast.type==="error"?"rgba(255,77,77,.15)":"rgba(48,209,88,.12)",border:`1px solid ${toast.type==="error"?"rgba(255,77,77,.3)":"rgba(48,209,88,.3)"}`,color:toast.type==="error"?"#FF4D4D":"#30D158"}}>{toast.msg}</div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// MÉTRICAS VIEW
// ══════════════════════════════════════════════════════════════════════════
function MetricasView({ tasks, meetings, users, getAssignees, getRoleLabel, getRoleColor }) {
  const today = new Date();
  const [periodo, setPeriodo] = useState("mes"); // mes | semana | todo | custom
  const [customFrom, setCustomFrom] = useState("");
  const [customTo,   setCustomTo]   = useState("");
  const [rankMetric, setRankMetric] = useState("cumplimiento"); // cumplimiento | carga | reuniones | vencidas | tiempo

  // ── Calcular rango de fechas ──
  const getRange = () => {
    if (periodo === "todo") return { from: null, to: null };
    if (periodo === "custom") {
      return { from: customFrom || null, to: customTo || null };
    }
    const to = today.toISOString().split("T")[0];
    if (periodo === "semana") {
      const d = new Date(today); d.setDate(d.getDate() - 7);
      return { from: d.toISOString().split("T")[0], to };
    }
    if (periodo === "mes") {
      const d = new Date(today); d.setMonth(d.getMonth() - 1);
      return { from: d.toISOString().split("T")[0], to };
    }
    return { from: null, to: null };
  };
  const { from, to } = getRange();

  const inRange = dateStr => {
    if (!dateStr) return false;
    if (from && dateStr < from) return false;
    if (to   && dateStr > to)   return false;
    return true;
  };

  // Filtrar tareas y reuniones por período
  // Para tareas: incluye si due_date O created_at cae en el rango (así no se pierden completadas)
  const periodTasks = tasks.filter(t => {
    if (periodo === "todo") return true;
    return inRange(t.due_date) || inRange(t.created_at?.split("T")[0]);
  });
  const periodMeetings = meetings.filter(m => periodo === "todo" ? true : inRange(m.date));

  // ── Métricas por persona ──
  const todayStr2 = today.toISOString().split("T")[0];
  const memberStats = users.map(u => {
    const myTasks     = periodTasks.filter(t => getAssignees(t).includes(u.id));
    const total       = myTasks.length;
    const completadas = myTasks.filter(t => t.status === "completado").length;
    const activas     = myTasks.filter(t => t.status !== "completado").length;
    const vencidas    = myTasks.filter(t => isOverdue(t)).length;
    const cumplimiento = total > 0 ? Math.round((completadas / total) * 100) : null;

    // Tiempo promedio en completar (días entre created_at y última actualización — approx usando due_date vs created_at)
    const completadasConFecha = myTasks.filter(t => t.status === "completado" && t.created_at && t.due_date);
    const tiempoPromedio = completadasConFecha.length > 0
      ? Math.round(completadasConFecha.reduce((acc, t) => {
          const created = new Date(t.created_at);
          const due     = new Date(t.due_date);
          return acc + Math.max(0, (due - created) / (1000 * 60 * 60 * 24));
        }, 0) / completadasConFecha.length)
      : null;

    const myMeetings = periodMeetings.filter(m => (m.participants || []).includes(u.id));

    return { user: u, total, completadas, activas, vencidas, cumplimiento, tiempoPromedio, reuniones: myMeetings.length };
  });

  // ── Ordenar según métrica seleccionada ──
  const sorted = [...memberStats].sort((a, b) => {
    if (rankMetric === "cumplimiento") return (b.cumplimiento ?? -1) - (a.cumplimiento ?? -1);
    if (rankMetric === "carga")        return b.activas     - a.activas;
    if (rankMetric === "reuniones")    return b.reuniones   - a.reuniones;
    if (rankMetric === "vencidas")     return b.vencidas    - a.vencidas;
    if (rankMetric === "tiempo")       return (a.tiempoPromedio ?? 999) - (b.tiempoPromedio ?? 999);
    return 0;
  });

  // ── Totales globales ──
  const totalTareas      = periodTasks.length;
  const totalCompletadas = periodTasks.filter(t=>t.status==="completado").length;
  const totalVencidas    = periodTasks.filter(t=>isOverdue(t)).length;
  const cumplimientoGlobal = totalTareas > 0 ? Math.round((totalCompletadas / totalTareas) * 100) : 0;

  // ── Max values for bar scaling ──
  const maxCarga    = Math.max(1, ...memberStats.map(m => m.activas));
  const maxReuniones= Math.max(1, ...memberStats.map(m => m.reuniones));
  const maxVencidas = Math.max(1, ...memberStats.map(m => m.vencidas));

  const metricOpts = [
    { key:"cumplimiento", label:"% Cumplimiento", icon:"🏆", color:"#30D158" },
    { key:"carga",        label:"Más carga",       icon:"📋", color:"#FF9500" },
    { key:"reuniones",    label:"Más reuniones",   icon:"👥", color:"#0A84FF" },
    { key:"vencidas",     label:"Más vencidas",    icon:"⚠",  color:"#FF4D4D" },
    { key:"tiempo",       label:"Más rápido",      icon:"⚡", color:"#BF5AF2" },
  ];

  const getBarValue = s => {
    if (rankMetric==="cumplimiento") return s.cumplimiento ?? 0;
    if (rankMetric==="carga")        return maxCarga > 0 ? Math.round((s.activas / maxCarga) * 100) : 0;
    if (rankMetric==="reuniones")    return maxReuniones > 0 ? Math.round((s.reuniones / maxReuniones) * 100) : 0;
    if (rankMetric==="vencidas")     return maxVencidas > 0 ? Math.round((s.vencidas / maxVencidas) * 100) : 0;
    if (rankMetric==="tiempo")       return s.tiempoPromedio !== null ? Math.max(0, 100 - s.tiempoPromedio * 3) : 0;
    return 0;
  };

  const getDisplayValue = s => {
    if (rankMetric==="cumplimiento") return s.cumplimiento !== null ? `${s.cumplimiento}%` : "—";
    if (rankMetric==="carga")        return `${s.activas} act.`;
    if (rankMetric==="reuniones")    return `${s.reuniones}`;
    if (rankMetric==="vencidas")     return s.vencidas > 0 ? `${s.vencidas}` : "✓";
    if (rankMetric==="tiempo")       return s.tiempoPromedio !== null ? `${s.tiempoPromedio}d` : "—";
    return "—";
  };

  const getValueColor = s => {
    const m = metricOpts.find(x=>x.key===rankMetric);
    if (rankMetric==="cumplimiento") {
      if (s.cumplimiento === null) return "#4A5178";
      return s.cumplimiento >= 80 ? "#30D158" : s.cumplimiento >= 50 ? "#FF9500" : "#FF4D4D";
    }
    if (rankMetric==="vencidas") return s.vencidas === 0 ? "#30D158" : "#FF4D4D";
    return m?.color || "#F0F2FF";
  };

  return (
    <div>
      {/* Header */}
      <div className="font-display" style={{fontSize:22,marginBottom:4,letterSpacing:"-0.5px"}}>Métricas</div>
      <div style={{color:"#4A5178",fontSize:12,fontWeight:600,marginBottom:20}}>Rendimiento del equipo de cobros</div>

      {/* Período selector */}
      <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap",alignItems:"center"}}>
        <div className="seg-control">
          {[["semana","Semana"],["mes","Mes"],["todo","Todo"],["custom","Rango"]].map(([k,l])=>(
            <button key={k} className={`seg-btn ${periodo===k?"active":""}`} onClick={()=>setPeriodo(k)}>{l}</button>
          ))}
        </div>
        {periodo==="custom"&&(
          <>
            <input type="date" className="input" style={{width:"auto",fontSize:12,padding:"7px 10px"}} value={customFrom} onChange={e=>setCustomFrom(e.target.value)} />
            <span style={{color:"#4A5178",fontSize:12,fontWeight:600}}>→</span>
            <input type="date" className="input" style={{width:"auto",fontSize:12,padding:"7px 10px"}} value={customTo} onChange={e=>setCustomTo(e.target.value)} />
          </>
        )}
      </div>

      {/* KPI global cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:24}}>
        {[
          {l:"Cumplimiento global", v:`${cumplimientoGlobal}%`, c:"#30D158", sub:`${totalCompletadas} de ${totalTareas} tareas`},
          {l:"Tareas activas",      v:totalTareas-totalCompletadas, c:"#FF9500", sub:"en proceso o pendientes"},
          {l:"Tareas vencidas",     v:totalVencidas, c:totalVencidas>0?"#FF4D4D":"#30D158", sub:"sin completar fuera de plazo"},
          {l:"Reuniones",           v:periodMeetings.length, c:"#0A84FF", sub:"en el período"},
        ].map((k,i)=>(
          <div key={i} className="stat-card" style={{position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",top:-10,right:-10,width:50,height:50,background:k.c,borderRadius:"50%",opacity:.1,filter:"blur(12px)"}}/>
            <div style={{fontSize:10,fontWeight:700,color:"#4A5178",textTransform:"uppercase",letterSpacing:".6px",marginBottom:6}}>{k.l}</div>
            <div className="font-display" style={{fontSize:30,color:k.c,lineHeight:1,letterSpacing:"-1px"}}>{k.v}</div>
            <div style={{fontSize:10,color:"#4A5178",fontWeight:600,marginTop:6}}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Ranking metric selector */}
      <div style={{marginBottom:16}}>
        <div style={{fontSize:11,fontWeight:700,color:"#4A5178",textTransform:"uppercase",letterSpacing:".6px",marginBottom:8}}>Ranking por</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {metricOpts.map(m=>(
            <button key={m.key} onClick={()=>setRankMetric(m.key)}
              style={{padding:"7px 14px",borderRadius:20,border:`1.5px solid`,fontSize:12,fontWeight:700,cursor:"pointer",transition:"all .15s",
                background:rankMetric===m.key ? m.color+"22" : "#0F1117",
                color:rankMetric===m.key ? m.color : "#4A5178",
                borderColor:rankMetric===m.key ? m.color+"55" : "#1E2130"}}>
              {m.icon} {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Ranking list */}
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {sorted.map((s, idx) => {
          const barW   = getBarValue(s);
          const dispV  = getDisplayValue(s);
          const valCol = getValueColor(s);
          const metCol = metricOpts.find(x=>x.key===rankMetric)?.color || "#F0F2FF";
          const medals = ["🥇","🥈","🥉"];

          return (
            <div key={s.user.id} style={{background:"#0F1117",border:"1px solid #1E2130",borderRadius:12,padding:"12px 16px",transition:"border-color .15s"}}
              onMouseEnter={e=>e.currentTarget.style.borderColor="#2A2D3E"}
              onMouseLeave={e=>e.currentTarget.style.borderColor="#1E2130"}>

              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
                {/* Rank */}
                <div style={{width:26,textAlign:"center",fontSize:idx<3?18:13,lineHeight:1}}>
                  {idx < 3 ? medals[idx] : <span style={{fontWeight:800,color:"#4A5178"}}>#{idx+1}</span>}
                </div>

                {/* Avatar */}
                <div className="avatar" style={{width:36,height:36,background:s.user.color+"22",color:s.user.color,fontSize:11,border:`2px solid ${s.user.color}33`,flexShrink:0}}>
                  {s.user.avatar}
                </div>

                {/* Name + role */}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:13,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.user.name}</div>
                  <span style={{fontSize:10,fontWeight:700,color:getRoleColor(s.user.role)}}>{getRoleLabel(s.user.role)}</span>
                </div>

                {/* Main value */}
                <div style={{fontSize:20,fontWeight:800,color:valCol,letterSpacing:"-0.5px",minWidth:48,textAlign:"right"}} className="font-display">
                  {dispV}
                </div>
              </div>

              {/* Progress bar */}
              <div style={{height:5,background:"#1E2130",borderRadius:3,overflow:"hidden",marginBottom:8}}>
                <div style={{height:"100%",borderRadius:3,width:`${barW}%`,background:`linear-gradient(90deg,${metCol},${metCol}88)`,transition:"width .6s ease"}}/>
              </div>

              {/* Mini stats row */}
              <div style={{display:"flex",gap:14,fontSize:10,fontWeight:700,color:"#4A5178",flexWrap:"wrap"}}>
                <span style={{color:s.total===0?"#2A2D3E":"#8891B0"}}>📋 {s.total} tareas</span>
                <span style={{color:s.completadas>0?"#30D158":"#2A2D3E"}}>✓ {s.completadas}</span>
                <span style={{color:s.activas>0?"#FF9500":"#2A2D3E"}}>● {s.activas} activas</span>
                {s.vencidas>0&&<span style={{color:"#FF4D4D"}}>⚠ {s.vencidas} venc.</span>}
                <span style={{color:s.reuniones>0?"#0A84FF":"#2A2D3E"}}>👥 {s.reuniones} reun.</span>
                {s.tiempoPromedio!==null&&<span style={{color:"#BF5AF2"}}>⚡ ~{s.tiempoPromedio}d</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// CALENDAR VIEW
// ══════════════════════════════════════════════════════════════════════════
function CalendarView({ tasks, meetings, users, currentUser, calScope, setCalScope, calDate, setCalDate, calView, setCalView, onItemClick }) {
  const year     = calDate.getFullYear();
  const month    = calDate.getMonth();
  const today    = todayStr();
  const getUser  = id => users.find(u=>u.id===id);
  const [selectedDay, setSelectedDay] = useState(null);

  // Filter by scope
  const filteredTasks = calScope === "mine"
    ? tasks.filter(t => (Array.isArray(t.assigned_to)?t.assigned_to:[t.assigned_to]).includes(currentUser.id) || t.assigned_by===currentUser.id)
    : tasks;
  const filteredMeetings = calScope === "mine"
    ? meetings.filter(m => (m.participants||[]).includes(currentUser.id) || m.created_by===currentUser.id)
    : meetings;

  const dayStr = (y,m,d) => `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;

  // ── MES ──
  const renderMonth = () => {
    const firstDay    = new Date(year,month,1).getDay();
    const daysInMonth = new Date(year,month+1,0).getDate();
    const cells = [];
    for(let i=0;i<firstDay;i++) cells.push(null);
    for(let d=1;d<=daysInMonth;d++) cells.push(d);

    const rangeStart = dayStr(year,month,1);
    const rangeEnd   = dayStr(year,month,daysInMonth);

    // Expand recurring into day map
    const tasksByDay = {}, meetsByDay = {};
    filteredTasks.forEach(t => {
      const dates = expandRecurring({recurrence:t.recurrence,recurrence_days:t.recurrence_days,recurrence_end:t.recurrence_end,start_date:t.start_date,date:t.due_date}, rangeStart, rangeEnd);
      dates.forEach(ds => { if(!tasksByDay[ds]) tasksByDay[ds]=[]; tasksByDay[ds].push(t); });
    });
    filteredMeetings.forEach(m => {
      const dates = expandRecurring({recurrence:m.recurrence,recurrence_days:m.recurrence_days,recurrence_end:m.recurrence_end,date:m.date}, rangeStart, rangeEnd);
      dates.forEach(ds => { if(!meetsByDay[ds]) meetsByDay[ds]=[]; meetsByDay[ds].push(m); });
    });

    return (
      <>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:6}}>
          {WEEKDAYS.map(d=><div key={d} style={{textAlign:"center",fontSize:11,fontWeight:700,color:"#4A5178",padding:"4px 0"}}>{d}</div>)}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
          {cells.map((d,i)=>{
            if(!d) return <div key={i}/>;
            const ds       = dayStr(year,month,d);
            const dayTasks = tasksByDay[ds]||[];
            const dayMeets = meetsByDay[ds]||[];
            const total    = dayTasks.length+dayMeets.length;
            const isToday  = ds===today;
            return (
              <div key={i} className={`cal-day ${isToday?"is-today":""} ${total>0?"has-items":""}`}
                onClick={()=>total>0&&setSelectedDay({ds,tasks:dayTasks,meetings:dayMeets})}>
                <div style={{fontSize:12,fontWeight:isToday?800:600,color:isToday?"#FF4D4D":"#8891B0",marginBottom:4,lineHeight:1}}>{d}</div>
                {dayTasks.slice(0,2).map(t=>{
                  const prio=PRIORITIES.find(p=>p.value===t.priority);
                  return <div key={t.id+ds} className="cal-event" style={{background:prio?prio.bg:"#1E2130",color:prio?prio.color:"#8891B0",cursor:"pointer",pointerEvents:"none"}}>{t.recurrence&&"🔁 "}{t.title}</div>;
                })}
                {dayMeets.slice(0,1).map(m=>{
                  const mt=MEET_TYPES[m.type]||MEET_TYPES.otro;
                  return <div key={m.id+ds} className="cal-event" style={{background:mt.color+"18",color:mt.color,cursor:"pointer",pointerEvents:"none"}}>{mt.icon}{m.recurrence&&"🔁"} {m.title}</div>;
                })}
                {total>3&&<div style={{fontSize:9,color:"#FF9500",fontWeight:800,marginTop:2}}>+{total-3} más</div>}
                {total>0&&total<=3&&<div style={{fontSize:8,color:"#4A5178",fontWeight:600,marginTop:2}}>ver detalle</div>}
              </div>
            );
          })}
        </div>

        {/* Day detail panel */}
        {selectedDay&&(
          <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setSelectedDay(null)}>
            <div className="modal" style={{maxWidth:440}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <div className="font-display" style={{fontSize:16}}>📅 {new Date(selectedDay.ds+"T00:00:00").toLocaleDateString("es-ES",{weekday:"long",day:"numeric",month:"long"})}</div>
                <button onClick={()=>setSelectedDay(null)} style={{background:"none",border:"none",color:"#4A5178",fontSize:18,cursor:"pointer",lineHeight:1}}>×</button>
              </div>
              {selectedDay.meetings.length>0&&(
                <div style={{marginBottom:12}}>
                  <div style={{fontSize:10,fontWeight:700,color:"#4A5178",textTransform:"uppercase",letterSpacing:".6px",marginBottom:6}}>Reuniones</div>
                  {selectedDay.meetings.map(m=>{
                    const mt=MEET_TYPES[m.type]||MEET_TYPES.otro;
                    return (
                      <div key={m.id} onClick={()=>{setSelectedDay(null);onItemClick({type:"meeting",...m});}} style={{display:"flex",gap:8,alignItems:"center",padding:"8px 10px",background:"#0A0B10",border:`1px solid ${mt.color}33`,borderRadius:8,marginBottom:4,cursor:"pointer"}}>
                        <span style={{fontSize:16}}>{mt.icon}</span>
                        <div style={{flex:1}}>
                          <div style={{fontWeight:700,fontSize:12,color:"#F0F2FF"}}>{m.title}</div>
                          <div style={{fontSize:10,color:mt.color,fontWeight:600}}>{m.time} · {mt.label}{m.recurrence&&" 🔁"}</div>
                        </div>
                        <span style={{color:"#4A5178",fontSize:12}}>›</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {selectedDay.tasks.length>0&&(
                <div>
                  <div style={{fontSize:10,fontWeight:700,color:"#4A5178",textTransform:"uppercase",letterSpacing:".6px",marginBottom:6}}>Tareas</div>
                  {selectedDay.tasks.map(t=>{
                    const prio=PRIORITIES.find(p=>p.value===t.priority);
                    const assignees=(Array.isArray(t.assigned_to)?t.assigned_to:[t.assigned_to]).map(id=>users.find(u=>u.id===id)).filter(Boolean);
                    return (
                      <div key={t.id} onClick={()=>{setSelectedDay(null);onItemClick({type:"task",...t});}} style={{display:"flex",gap:8,alignItems:"center",padding:"8px 10px",background:"#0A0B10",border:`1px solid ${prio?prio.color+"33":"#1E2130"}`,borderRadius:8,marginBottom:4,cursor:"pointer"}}>
                        <div style={{flex:1}}>
                          <div style={{fontWeight:700,fontSize:12,color:t.status==="completado"?"#4A5178":"#F0F2FF",textDecoration:t.status==="completado"?"line-through":"none"}}>{t.recurrence&&"🔁 "}{t.title}</div>
                          <div style={{fontSize:10,color:"#4A5178",fontWeight:600,display:"flex",gap:6,flexWrap:"wrap",marginTop:2}}>
                            {prio&&<span style={{color:prio.color}}>{prio.label}</span>}
                            {t.task_time&&<span>🕐 {t.task_time}</span>}
                            {assignees.map(u=><span key={u.id} style={{color:u.color}}>{u.name.split(" ")[0]}</span>)}
                          </div>
                        </div>
                        <span style={{background:t.status==="completado"?"rgba(48,209,88,.12)":t.status==="en-proceso"?"rgba(255,149,0,.12)":"rgba(136,145,176,.08)",color:t.status==="completado"?"#30D158":t.status==="en-proceso"?"#FF9500":"#8891B0",padding:"3px 7px",borderRadius:5,fontSize:9,fontWeight:800}}>
                          {t.status==="completado"?"✓":t.status==="en-proceso"?"●":"○"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </>
    );
  };

  // ── SEMANA ──
  const renderWeek = () => {
    const startOfWeek = new Date(calDate);
    startOfWeek.setDate(calDate.getDate()-calDate.getDay());
    const days = Array.from({length:7},(_,i)=>{ const d=new Date(startOfWeek); d.setDate(startOfWeek.getDate()+i); return d; });
    return (
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:6}}>
        {days.map((d,i)=>{
          const ds       = d.toISOString().split("T")[0];
          const dayTasks = filteredTasks.filter(t=>t.due_date===ds);
          const dayMeets = filteredMeetings.filter(m=>m.date===ds);
          const isToday  = ds===today;
          return (
            <div key={i} style={{background:isToday?"rgba(255,77,77,.04)":"#0F1117",border:`1px solid ${isToday?"rgba(255,77,77,.3)":"#1E2130"}`,borderRadius:12,padding:10,minHeight:200}}>
              <div style={{fontSize:11,fontWeight:700,color:"#4A5178",marginBottom:2}}>{WEEKDAYS[d.getDay()]}</div>
              <div className="font-display" style={{fontSize:22,color:isToday?"#FF4D4D":"#F0F2FF",marginBottom:8,lineHeight:1}}>{d.getDate()}</div>
              {dayTasks.map(t=>{
                const prio=PRIORITIES.find(p=>p.value===t.priority);
                const u=getUser(t.assigned_to);
                return <div key={t.id} style={{background:prio?prio.bg:"#1E2130",color:prio?prio.color:"#8891B0",borderRadius:6,padding:"5px 7px",marginBottom:4,fontSize:11,fontWeight:600}}>{u?.avatar} {t.title}</div>;
              })}
              {dayMeets.map(m=>{
                const mt=MEET_TYPES[m.type]||MEET_TYPES.otro;
                return <div key={m.id} style={{background:mt.color+"18",color:mt.color,borderRadius:6,padding:"5px 7px",marginBottom:4,fontSize:11,fontWeight:600}}>{mt.icon} {m.time} {m.title}</div>;
              })}
            </div>
          );
        })}
      </div>
    );
  };

  // ── DÍA ──
  const renderDay = () => {
    const ds       = calDate.toISOString().split("T")[0];
    const dayTasks = filteredTasks.filter(t=>t.due_date===ds);
    const dayMeets = filteredMeetings.filter(m=>m.date===ds).sort((a,b)=>a.time.localeCompare(b.time));
    const isToday  = ds===today;
    return (
      <div style={{maxWidth:600,margin:"0 auto"}}>
        <div style={{background:"#0F1117",border:`1px solid ${isToday?"rgba(255,77,77,.3)":"#1E2130"}`,borderRadius:16,padding:24,marginBottom:16}}>
          <div className="font-display" style={{fontSize:28,color:isToday?"#FF4D4D":"#F0F2FF",letterSpacing:"-1px"}}>{calDate.toLocaleDateString("es-ES",{weekday:"long",day:"numeric",month:"long"})}</div>
          {isToday&&<span className="badge" style={{color:"#FF4D4D",background:"rgba(255,77,77,.1)",marginTop:4}}>Hoy</span>}
        </div>
        {dayMeets.length>0&&(
          <div style={{marginBottom:16}}>
            <div style={{fontSize:11,fontWeight:700,color:"#4A5178",textTransform:"uppercase",letterSpacing:".6px",marginBottom:8}}>Reuniones</div>
            {dayMeets.map(m=>{
              const mt=MEET_TYPES[m.type]||MEET_TYPES.otro;
              return <div key={m.id} style={{background:"#0F1117",border:`1px solid ${mt.color}33`,borderRadius:10,padding:"12px 14px",marginBottom:6,display:"flex",gap:10,alignItems:"center"}}>
                <span style={{fontSize:18}}>{mt.icon}</span>
                <div><div style={{fontWeight:700,fontSize:13}}>{m.title}</div><div style={{fontSize:11,color:"#4A5178",fontWeight:600}}>🕐 {m.time}</div></div>
              </div>;
            })}
          </div>
        )}
        {dayTasks.length>0&&(
          <div>
            <div style={{fontSize:11,fontWeight:700,color:"#4A5178",textTransform:"uppercase",letterSpacing:".6px",marginBottom:8}}>Tareas vencen hoy</div>
            {dayTasks.map(t=>{
              const prio=PRIORITIES.find(p=>p.value===t.priority);
              const u=getUser(t.assigned_to);
              return <div key={t.id} style={{background:"#0F1117",border:`1px solid ${prio?prio.color+"33":"#1E2130"}`,borderRadius:10,padding:"12px 14px",marginBottom:6,display:"flex",gap:10,alignItems:"center"}}>
                {u&&<div className="avatar" style={{width:30,height:30,background:u.color+"22",color:u.color,fontSize:10}}>{u.avatar}</div>}
                <div style={{flex:1}}><div style={{fontWeight:700,fontSize:13}}>{t.title}</div><div style={{fontSize:11,color:prio?.color||"#4A5178",fontWeight:700}}>{prio?.label}</div></div>
                <span style={{fontSize:11,fontWeight:800,color:t.status==="completado"?"#30D158":t.status==="en-proceso"?"#FF9500":"#8891B0",background:t.status==="completado"?"rgba(48,209,88,.1)":t.status==="en-proceso"?"rgba(255,149,0,.1)":"rgba(136,145,176,.08)",padding:"3px 9px",borderRadius:5}}>{t.status}</span>
              </div>;
            })}
          </div>
        )}
        {dayTasks.length===0&&dayMeets.length===0&&<div style={{textAlign:"center",color:"#4A5178",padding:"40px 0",fontSize:13,fontWeight:600}}>📭 Sin eventos este día</div>}
      </div>
    );
  };

  // ── AGENDA ──
  const renderAgenda = () => {
    const upcoming = [];
    for(let i=0;i<30;i++){
      const d = new Date(); d.setDate(d.getDate()+i);
      const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      const dayTasks = filteredTasks.filter(t=>t.due_date===ds);
      const dayMeets = filteredMeetings.filter(m=>m.date===ds);
      if(dayTasks.length>0||dayMeets.length>0) upcoming.push({date:d,ds,dayTasks,dayMeets});
    }
    if(upcoming.length===0) return <div style={{textAlign:"center",color:"#4A5178",padding:"48px 0",fontSize:13,fontWeight:600}}>📭 Sin eventos en los próximos 30 días</div>;
    return upcoming.map(({date,ds,dayTasks,dayMeets})=>(
      <div key={ds} style={{marginBottom:16}}>
        <div style={{fontSize:12,fontWeight:800,color:"#4A5178",textTransform:"uppercase",letterSpacing:".6px",marginBottom:6,paddingLeft:4}}>{date.toLocaleDateString("es-ES",{weekday:"long",day:"numeric",month:"long"})}{ds===today&&<span className="badge" style={{color:"#FF4D4D",background:"rgba(255,77,77,.1)",marginLeft:8,fontSize:9}}>HOY</span>}</div>
        {dayMeets.map(m=>{const mt=MEET_TYPES[m.type]||MEET_TYPES.otro;return <div key={m.id} onClick={()=>onItemClick({type:"meeting",...m})} style={{background:"#0F1117",border:`1px solid ${mt.color}33`,borderRadius:10,padding:"10px 14px",marginBottom:4,display:"flex",gap:10,alignItems:"center",cursor:"pointer"}}><span>{mt.icon}</span><div><span style={{fontWeight:700,fontSize:13}}>{m.title}</span><span style={{fontSize:11,color:"#4A5178",fontWeight:600,marginLeft:8}}>🕐 {m.time}</span></div></div>;})}
        {dayTasks.map(t=>{const prio=PRIORITIES.find(p=>p.value===t.priority);const assignees=(Array.isArray(t.assigned_to)?t.assigned_to:[t.assigned_to]).map(id=>users.find(u=>u.id===id)).filter(Boolean);return <div key={t.id} onClick={()=>onItemClick({type:"task",...t})} style={{background:"#0F1117",border:`1px solid ${prio?prio.color+"22":"#1E2130"}`,borderRadius:10,padding:"10px 14px",marginBottom:4,display:"flex",gap:8,alignItems:"center",cursor:"pointer"}}>{assignees.slice(0,2).map(u=><div key={u.id} className="avatar" style={{width:24,height:24,background:u.color+"22",color:u.color,fontSize:8}}>{u.avatar}</div>)}<span style={{fontWeight:600,fontSize:13,flex:1}}>{t.title}</span>{prio&&<span className="badge" style={{color:prio.color,background:prio.bg,fontSize:10}}>{prio.label}</span>}</div>;})}
      </div>
    ));
  };

  const prevPeriod = () => {
    const d=new Date(calDate);
    if(calView==="mes") d.setMonth(d.getMonth()-1);
    else if(calView==="semana") d.setDate(d.getDate()-7);
    else if(calView==="dia") d.setDate(d.getDate()-1);
    setCalDate(d);
  };
  const nextPeriod = () => {
    const d=new Date(calDate);
    if(calView==="mes") d.setMonth(d.getMonth()+1);
    else if(calView==="semana") d.setDate(d.getDate()+7);
    else if(calView==="dia") d.setDate(d.getDate()+1);
    setCalDate(d);
  };

  const title = calView==="mes"?`${MONTHS[month]} ${year}`:calView==="semana"?`Semana del ${calDate.toLocaleDateString("es-ES",{day:"numeric",month:"short"})}`:calView==="agenda"?"Agenda 30 días":calDate.toLocaleDateString("es-ES",{weekday:"long",day:"numeric",month:"long"});

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,flexWrap:"wrap",gap:10}}>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <div className="font-display" style={{fontSize:18,color:"#F0F2FF",letterSpacing:"-0.3px"}}>{title}</div>
          <div className="seg-control">
            <button className={`seg-btn ${calScope==="todos"?"active":""}`} onClick={()=>setCalScope("todos")}>Todos</button>
            <button className={`seg-btn ${calScope==="mine"?"active":""}`} onClick={()=>setCalScope("mine")}>Mis cosas</button>
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <div className="seg-control">
            {[["mes","Mes"],["semana","Semana"],["dia","Día"],["agenda","Agenda"]].map(([v,l])=>(
              <button key={v} className={`seg-btn ${calView===v?"active":""}`} onClick={()=>setCalView(v)}>{l}</button>
            ))}
          </div>
          {calView!=="agenda"&&<>
            <button className="btn btn-glass" style={{padding:"7px 12px",fontSize:13}} onClick={prevPeriod}>◀</button>
            <button className="btn btn-glass" style={{padding:"7px 12px",fontSize:12}} onClick={()=>setCalDate(new Date())}>Hoy</button>
            <button className="btn btn-glass" style={{padding:"7px 12px",fontSize:13}} onClick={nextPeriod}>▶</button>
          </>}
        </div>
      </div>
      {calView==="mes"    && renderMonth()}
      {calView==="semana" && renderWeek()}
      {calView==="dia"    && renderDay()}
      {calView==="agenda" && renderAgenda()}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// TASK MODAL — with task_time + live conflict detection
// ══════════════════════════════════════════════════════════════════════════
function TaskModal({ mode, task, currentUser, users, tasks, meetings, carteras, getRoleLabel, getRoleColor, onClose, onSave }) {
  const init = task ? {
    title:task.title||"", description:task.description||"",
    assignedTo: Array.isArray(task.assigned_to) ? task.assigned_to : (task.assigned_to ? [task.assigned_to] : []),
    priority:task.priority||"media",
    due_date:task.due_date||"", start_date:task.start_date||"",
    task_time:task.task_time||"",
    cartera:task.cartera||carteras[0]||"", is_published:task.is_published??true,
    recurrence:task.recurrence||"", recurrence_days:task.recurrence_days||[], recurrence_end:task.recurrence_end||"",
    notify_before:task.notify_before||""
  } : {
    title:"", description:"", assignedTo:[], priority:"media",
    due_date:"", start_date:"", task_time:"", cartera:carteras[0]||"", is_published:true,
    recurrence:"", recurrence_days:[], recurrence_end:"", notify_before:""
  };
  const [form,      setForm]      = useState(init);
  const [conflicts, setConflicts] = useState([]);
  const [showConflictDetail, setShowConflictDetail] = useState(false);
  const isGerente = currentUser.role==="gerente";

  // Live conflict detection whenever date/time/assignees change
  useEffect(() => {
    if (!form.due_date || !form.task_time || form.assignedTo.length === 0) { setConflicts([]); return; }
    const found = detectConflicts({
      date: form.due_date,
      time: form.task_time,
      excludeId: task?.id,
      excludeType: "task",
      userIds: form.assignedTo,
      tasks,
      meetings,
      users
    });
    setConflicts(found);
  }, [form.due_date, form.task_time, JSON.stringify(form.assignedTo)]);

  const toggleA = id => setForm(f=>({...f,assignedTo:f.assignedTo.includes(id)?f.assignedTo.filter(x=>x!==id):[...f.assignedTo,id]}));
  const toggleD = d => setForm(f=>({...f,recurrence_days:f.recurrence_days.includes(d)?f.recurrence_days.filter(x=>x!==d):[...f.recurrence_days,d]}));

  const handleSave = () => {
    if (!form.title.trim() || !form.due_date) { alert("Completa título y fecha límite"); return; }
    if (mode==="create" && form.assignedTo.length===0) { alert("Selecciona al menos un responsable"); return; }
    onSave(form);
  };

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="font-display" style={{fontSize:17,marginBottom:18}}>{mode==="edit"?"✏ Editar Tarea":"+ Nueva Tarea"}</div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div><label className="label">Título *</label><input className="input" placeholder="¿Qué hay que hacer?" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} /></div>
          <div><label className="label">Descripción</label><textarea className="input" rows={2} placeholder="Contexto y expectativas..." value={form.description} onChange={e=>setForm({...form,description:e.target.value})} style={{resize:"vertical"}} /></div>

          {/* Asignación múltiple */}
          <div>
            <label className="label">Asignar a {form.assignedTo.length>0&&<span style={{color:"#FF4D4D"}}>({form.assignedTo.length})</span>}</label>
            <div style={{background:"#0A0B10",borderRadius:10,padding:8,display:"grid",gridTemplateColumns:"1fr 1fr",gap:2,maxHeight:150,overflowY:"auto",border:"1.5px solid #1E2130"}}>
              {users.map(u=>(
                <label key={u.id} className="check-row">
                  <input type="checkbox" checked={form.assignedTo.includes(u.id)} onChange={()=>toggleA(u.id)} style={{accentColor:u.color}} />
                  <div className="avatar" style={{width:20,height:20,background:u.color+"22",color:u.color,fontSize:7}}>{u.avatar}</div>
                  <span style={{fontSize:12,flex:1,fontWeight:600}}>{u.role==="gerente"?"Gerente":u.name.split(" ")[0]}</span>
                  <span style={{fontSize:9,color:getRoleColor(u.role),fontWeight:700}}>{getRoleLabel(u.role)}</span>
                </label>
              ))}
            </div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div><label className="label">Prioridad</label><select className="input" value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}>{PRIORITIES.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}</select></div>
            <div><label className="label">Cartera</label><select className="input" value={form.cartera} onChange={e=>setForm({...form,cartera:e.target.value})}>{carteras.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div><label className="label">Fecha inicio</label><input type="date" className="input" value={form.start_date} onChange={e=>setForm({...form,start_date:e.target.value})} /></div>
            <div><label className="label">{form.recurrence ? "Fecha inicio recurrencia *" : "Fecha límite *"}</label><input type="date" className="input" value={form.due_date} onChange={e=>setForm({...form,due_date:e.target.value})} /></div>
          </div>

          {/* HORA — triggers conflict check */}
          <div>
            <label className="label">Hora de la tarea <span style={{color:"#4A5178",fontWeight:400,textTransform:"none",letterSpacing:0}}>(opcional — para detectar conflictos)</span></label>
            <input type="time" className="input" value={form.task_time} onChange={e=>setForm({...form,task_time:e.target.value})} />
          </div>

          {/* CONFLICT BANNER — shown live */}
          {conflicts.length > 0 && (
            <div className="conflict-banner">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{display:"flex",alignItems:"center",gap:7}}>
                  <div className="conflict-dot"/>
                  <span style={{fontSize:12,fontWeight:800,color:"#FF9500"}}>
                    ⚠ {conflicts.length === 1 ? "Conflicto detectado" : `${conflicts.length} conflictos detectados`}
                  </span>
                </div>
                <button onClick={()=>setShowConflictDetail(!showConflictDetail)} style={{background:"none",border:"none",cursor:"pointer",color:"#FF9500",fontSize:11,fontWeight:700}}>
                  {showConflictDetail?"Ocultar ▲":"Ver detalle ▼"}
                </button>
              </div>
              {showConflictDetail && conflicts.map((c,i)=>(
                <div key={i} className="conflict-item">
                  <div className="avatar" style={{width:24,height:24,background:c.personColor+"22",color:c.personColor,fontSize:8,flexShrink:0}}>{c.personAvatar}</div>
                  <div style={{flex:1}}>
                    <span style={{fontWeight:700,color:c.personColor,fontSize:12}}>{c.person}</span>
                    <span style={{color:"#8891B0",fontSize:12}}> tiene {c.type} </span>
                    <span style={{fontWeight:700,color:"#F0F2FF",fontSize:12}}>"{c.title}"</span>
                    <span style={{color:"#4A5178",fontSize:11}}> a las {c.time}</span>
                  </div>
                  <span style={{fontSize:14}}>{c.icon}</span>
                </div>
              ))}
              <div style={{fontSize:10,color:"#FF9500",marginTop:conflicts.length>0&&showConflictDetail?8:0,fontWeight:600,opacity:.8}}>
                Puedes guardar igual — es solo un aviso
              </div>
            </div>
          )}

          {/* Notificación */}
          <div>
            <label className="label">🔔 Notificar al responsable</label>
            <select className="input" value={form.notify_before} onChange={e=>setForm({...form,notify_before:e.target.value})}>
              <option value="">Sin notificación por correo</option>
              <option value="1440">1 día antes</option>
              <option value="480">8 horas antes</option>
              <option value="120">2 horas antes</option>
              <option value="60">1 hora antes</option>
              <option value="30">30 minutos antes</option>
              <option value="15">15 minutos antes</option>
            </select>
            <div style={{fontSize:10,color:"#4A5178",marginTop:4,fontWeight:600}}>⚡ Activo cuando conectes Resend</div>
          </div>

          {/* Recurrencia */}
          <div><label className="label">Recurrencia</label>
            <select className="input" value={form.recurrence} onChange={e=>setForm({...form,recurrence:e.target.value})}>
              <option value="">Sin recurrencia</option>
              <option value="diaria">Diaria</option>
              <option value="semanal">Semanal</option>
              <option value="quincenal">Quincenal</option>
              <option value="mensual">Mensual</option>
            </select>
          </div>
          {form.recurrence==="semanal"&&(
            <div>
              <label className="label">Días</label>
              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                {[["L",1],["M",2],["X",3],["J",4],["V",5],["S",6],["D",0]].map(([l,d])=>(
                  <button key={d} onClick={()=>toggleD(d)} style={{width:34,height:34,borderRadius:8,border:"1.5px solid",fontSize:12,fontWeight:800,cursor:"pointer",background:form.recurrence_days.includes(d)?"rgba(255,77,77,.15)":"#0A0B10",color:form.recurrence_days.includes(d)?"#FF4D4D":"#4A5178",borderColor:form.recurrence_days.includes(d)?"rgba(255,77,77,.4)":"#1E2130"}}>{l}</button>
                ))}
              </div>
            </div>
          )}
          {form.recurrence&&<div><label className="label">Repetir hasta</label><input type="date" className="input" value={form.recurrence_end} onChange={e=>setForm({...form,recurrence_end:e.target.value})} /></div>}

          {isGerente&&mode==="create"&&(
            <label className="check-row" style={{background:"#0A0B10",borderRadius:8,padding:"9px 12px",border:"1.5px solid #1E2130"}}>
              <input type="checkbox" checked={form.is_published} onChange={e=>setForm({...form,is_published:e.target.checked})} style={{accentColor:"#FF4D4D"}} />
              <span style={{fontSize:12,color:"#F0F2FF",fontWeight:600}}>Publicar al equipo (si no, solo la ves tú)</span>
            </label>
          )}

          <div style={{display:"flex",gap:8,marginTop:4}}>
            <button className="btn btn-glass" style={{flex:1,justifyContent:"center"}} onClick={onClose}>Cancelar</button>
            <button className="btn btn-red" style={{flex:2,justifyContent:"center",position:"relative"}} onClick={handleSave}>
              {conflicts.length>0&&<span style={{position:"absolute",top:-6,right:-6,background:"#FF9500",color:"#000",borderRadius:"50%",width:16,height:16,fontSize:9,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center"}}>!</span>}
              {mode==="edit"?"Guardar ✓":"Crear ✓"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ACTA SECTION
// ══════════════════════════════════════════════════════════════════════════
function ActaSection({ meeting, currentUser, onSave, updatedBy }) {
  const [editing, setEditing] = useState(false);
  const [text,    setText]    = useState(meeting.acta||"");
  if (!editing&&!meeting.acta) return (
    <button className="btn btn-ghost" style={{fontSize:11,padding:"5px 10px"}} onClick={()=>setEditing(true)}>📝 Agregar acta</button>
  );
  if (!editing) return (
    <div style={{background:"#0A0B10",borderRadius:8,padding:10,marginTop:4}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <span style={{fontSize:10,fontWeight:700,color:"#4A5178",textTransform:"uppercase",letterSpacing:".5px"}}>Acta</span>
        <button className="btn-icon" style={{width:22,height:22,fontSize:10}} onClick={()=>setEditing(true)}>✏</button>
      </div>
      <div style={{fontSize:12,color:"#C8CAD8",lineHeight:1.6,whiteSpace:"pre-wrap"}}>{meeting.acta}</div>
      {updatedBy&&<div style={{fontSize:10,color:"#4A5178",marginTop:4,fontWeight:600}}>Por {updatedBy.name.split(" ")[0]}</div>}
    </div>
  );
  return (
    <div style={{marginTop:6}}>
      <textarea className="input" rows={3} placeholder="¿Qué se decidió? ¿Próximos pasos?" value={text} onChange={e=>setText(e.target.value)} style={{resize:"vertical",fontSize:12}} />
      <div style={{display:"flex",gap:6,marginTop:6}}>
        <button className="btn btn-glass" style={{flex:1,justifyContent:"center",fontSize:11}} onClick={()=>setEditing(false)}>Cancelar</button>
        <button className="btn btn-red" style={{flex:2,justifyContent:"center",fontSize:11}} onClick={()=>{onSave(text);setEditing(false);}}>Guardar acta ✓</button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// COMMENT INPUT
// ══════════════════════════════════════════════════════════════════════════
function CommentInput({ onAdd }) {
  const [txt, setTxt] = useState("");
  return (
    <div style={{display:"flex",gap:7,marginTop:10}}>
      <input className="input" style={{fontSize:12,padding:"8px 12px"}} placeholder="Escribe un avance o nota..." value={txt} onChange={e=>setTxt(e.target.value)} onKeyDown={e=>e.key==="Enter"&&txt.trim()&&(onAdd(txt.trim()),setTxt(""))} />
      <button className="btn btn-red" style={{padding:"8px 14px",fontSize:11,flexShrink:0}} onClick={()=>{if(txt.trim()){onAdd(txt.trim());setTxt("");}}}>↑</button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// VISIBILITY MODAL
// ══════════════════════════════════════════════════════════════════════════
function VisibilityModal({ task, users, getRoleLabel, getRoleColor, onClose, onSave }) {
  const [selected, setSelected] = useState(task.visible_to||[]);
  const toggle = id => setSelected(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);
  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{maxWidth:380}}>
        <div className="font-display" style={{fontSize:17,marginBottom:6}}>⚙ Control de acceso</div>
        <div style={{color:"#8891B0",fontSize:12,marginBottom:14,fontWeight:500}}>"{task.title}"<br/>Sin selección = todos la ven.</div>
        <div style={{background:"#0A0B10",borderRadius:10,padding:8,marginBottom:14,display:"grid",gridTemplateColumns:"1fr 1fr",gap:2,border:"1.5px solid #1E2130"}}>
          {users.map(u=>(
            <label key={u.id} className="check-row">
              <input type="checkbox" checked={selected.includes(u.id)} onChange={()=>toggle(u.id)} style={{accentColor:u.color}} />
              <div className="avatar" style={{width:20,height:20,background:u.color+"22",color:u.color,fontSize:7}}>{u.avatar}</div>
              <span style={{fontSize:12,flex:1,fontWeight:600}}>{u.role==="gerente"?"Gerente":u.name.split(" ")[0]}</span>
            </label>
          ))}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button className="btn btn-glass" style={{flex:1,justifyContent:"center"}} onClick={onClose}>Cancelar</button>
          <button className="btn btn-red" style={{flex:2,justifyContent:"center"}} onClick={()=>onSave(task.id,selected)}>Guardar ✓</button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// MANAGE USERS
// ══════════════════════════════════════════════════════════════════════════
function ManageUsers({ users, onRefresh, showToast, roles, saveRoles, carteras, saveCarteras, getRoleLabel, getRoleColor }) {
  const [tab,      setTab]      = useState("usuarios"); // usuarios | carteras | roles
  const [editing,  setEditing]  = useState(null);
  const [form,     setForm]     = useState({});
  const [showAdd,  setShowAdd]  = useState(false);
  const [newUser,  setNewUser]  = useState({name:"",username:"",email:"",password:"",role:roles[0]?.key||"analista",avatar:"👤",color:"#8891B0"});
  const [newCartera, setNewCartera] = useState("");
  const [editCartera,setEditCartera]= useState(null); // {idx, val}
  const [newRole,  setNewRole]  = useState({key:"",label:"",color:"#8891B0"});
  const [editRole, setEditRole] = useState(null); // idx
  const COLORS = ["#FF4D4D","#FF9500","#30D158","#0A84FF","#BF5AF2","#FF6B6B","#4ECDC4","#FFE66D","#8891B0"];

  const startEdit = u => { setEditing(u.id); setForm({name:u.name,username:u.username,email:u.email||"",password:u.password,role:u.role,color:u.color,avatar:u.avatar}); };
  const saveUser  = async () => { await db.update("users",editing,form); await onRefresh(); setEditing(null); showToast("Usuario actualizado ✓"); };
  const deleteUser= async id => { if(!window.confirm("¿Eliminar este usuario?")) return; await db.delete("users",id); await onRefresh(); showToast("Usuario eliminado"); };
  const addUser   = async () => {
    if (!newUser.name.trim()||!newUser.username.trim()||!newUser.password.trim()) { alert("Completa nombre, usuario y contraseña"); return; }
    await db.insert("users",newUser);
    await onRefresh();
    setShowAdd(false);
    setNewUser({name:"",username:"",email:"",password:"",role:roles[0]?.key||"analista",avatar:"👤",color:"#8891B0"});
    showToast("Usuario agregado ✓");
  };

  return (
    <div style={{background:"#0F1117",border:"1px solid #1E2130",borderRadius:14,padding:16,marginBottom:16}}>
      {/* Tabs */}
      <div style={{display:"flex",gap:2,marginBottom:14,borderBottom:"1px solid #1E2130",paddingBottom:10}}>
        {[["usuarios","👥 Usuarios"],["carteras","🗂 Carteras"],["roles","🏷 Roles"]].map(([t,l])=>(
          <button key={t} className={`tab-btn ${tab===t?"active":""}`} style={{fontSize:11,padding:"5px 12px",background:"none",border:"none",cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontWeight:700,color:tab===t?"#FF4D4D":"#4A5178",borderBottom:`2px solid ${tab===t?"#FF4D4D":"transparent"}`,transition:"all .15s"}} onClick={()=>setTab(t)}>{l}</button>
        ))}
      </div>

      {/* ── USUARIOS ── */}
      {tab==="usuarios"&&(
        <>
          <div style={{overflowX:"auto",marginBottom:10}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr style={{borderBottom:"1px solid #1E2130"}}>{["Nombre","Usuario","Correo","Contraseña","Rol",""].map(h=><th key={h} style={{textAlign:"left",padding:"5px 10px",color:"#4A5178",fontWeight:700,fontSize:10,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
              <tbody>
                {users.map(u=>(
                  <tr key={u.id} style={{borderBottom:"1px solid #1E213044"}}>
                    {editing===u.id?(
                      <>
                        <td style={{padding:"5px 6px"}}><input className="input" style={{padding:"5px 9px",fontSize:11}} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} /></td>
                        <td style={{padding:"5px 6px"}}><input className="input" style={{padding:"5px 9px",fontSize:11}} value={form.username} onChange={e=>setForm({...form,username:e.target.value})} /></td>
                        <td style={{padding:"5px 6px"}}><input className="input" style={{padding:"5px 9px",fontSize:11}} value={form.email||""} placeholder="correo@empresa.com" onChange={e=>setForm({...form,email:e.target.value})} /></td>
                        <td style={{padding:"5px 6px"}}><input className="input" style={{padding:"5px 9px",fontSize:11}} value={form.password} onChange={e=>setForm({...form,password:e.target.value})} /></td>
                        <td style={{padding:"5px 6px"}}>
                          <select className="input" style={{padding:"5px 9px",fontSize:11}} value={form.role} onChange={e=>setForm({...form,role:e.target.value})}>
                            {roles.map(r=><option key={r.key} value={r.key}>{r.label}</option>)}
                          </select>
                        </td>
                        <td style={{padding:"5px 6px"}}><div style={{display:"flex",gap:4}}><button className="btn btn-red" style={{padding:"4px 10px",fontSize:11}} onClick={saveUser}>✓</button><button className="btn btn-glass" style={{padding:"4px 8px",fontSize:11}} onClick={()=>setEditing(null)}>✕</button></div></td>
                      </>
                    ):(
                      <>
                        <td style={{padding:"8px 10px"}}><div style={{display:"flex",alignItems:"center",gap:6}}><div className="avatar" style={{width:22,height:22,background:u.color+"22",color:u.color,fontSize:9}}>{u.avatar}</div><span style={{fontWeight:700}}>{u.name}</span></div></td>
                        <td style={{padding:"8px 10px",fontFamily:"monospace",color:"#0A84FF",fontSize:11}}>{u.username}</td>
                        <td style={{padding:"8px 10px",color:"#8891B0",fontSize:11}}>{u.email||<span style={{color:"#4A5178"}}>sin correo</span>}</td>
                        <td style={{padding:"8px 10px",fontFamily:"monospace",color:"#8891B0",fontSize:11}}>{u.password}</td>
                        <td style={{padding:"8px 10px"}}><span className="badge" style={{color:getRoleColor(u.role),background:getRoleColor(u.role)+"15",fontSize:10}}>{getRoleLabel(u.role)}</span></td>
                        <td style={{padding:"8px 10px"}}><div style={{display:"flex",gap:4}}>
                          <button className="btn-icon" style={{fontSize:11}} onClick={()=>startEdit(u)}>✏</button>
                          <button className="btn-danger-icon" style={{fontSize:10}} onClick={()=>deleteUser(u.id)}>🗑</button>
                        </div></td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Add user */}
          {showAdd?(
            <div style={{background:"#0A0B10",border:"1px solid #1E2130",borderRadius:10,padding:12}}>
              <div style={{fontSize:11,fontWeight:700,color:"#4A5178",marginBottom:10,textTransform:"uppercase",letterSpacing:".6px"}}>Nuevo usuario</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                <div><label className="label">Nombre *</label><input className="input" style={{fontSize:12}} placeholder="Ana Rodríguez" value={newUser.name} onChange={e=>setNewUser({...newUser,name:e.target.value})} /></div>
                <div><label className="label">Usuario *</label><input className="input" style={{fontSize:12}} placeholder="arodriguez" value={newUser.username} onChange={e=>setNewUser({...newUser,username:e.target.value})} /></div>
                <div><label className="label">Correo</label><input className="input" style={{fontSize:12}} placeholder="correo@empresa.com" value={newUser.email} onChange={e=>setNewUser({...newUser,email:e.target.value})} /></div>
                <div><label className="label">Contraseña *</label><input className="input" style={{fontSize:12}} placeholder="••••••" value={newUser.password} onChange={e=>setNewUser({...newUser,password:e.target.value})} /></div>
                <div><label className="label">Rol</label>
                  <select className="input" style={{fontSize:12}} value={newUser.role} onChange={e=>setNewUser({...newUser,role:e.target.value})}>
                    {roles.map(r=><option key={r.key} value={r.key}>{r.label}</option>)}
                  </select>
                </div>
                <div><label className="label">Color</label>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:2}}>
                    {COLORS.map(c=><button key={c} onClick={()=>setNewUser({...newUser,color:c})} style={{width:22,height:22,borderRadius:"50%",background:c,border:newUser.color===c?"2px solid #fff":"2px solid transparent",cursor:"pointer"}}/>)}
                  </div>
                </div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button className="btn btn-glass" style={{flex:1,justifyContent:"center",fontSize:12}} onClick={()=>setShowAdd(false)}>Cancelar</button>
                <button className="btn btn-red" style={{flex:2,justifyContent:"center",fontSize:12}} onClick={addUser}>Agregar usuario ✓</button>
              </div>
            </div>
          ):(
            <button className="btn btn-glass" style={{width:"100%",justifyContent:"center",fontSize:12}} onClick={()=>setShowAdd(true)}>+ Agregar usuario</button>
          )}
        </>
      )}

      {/* ── CARTERAS ── */}
      {tab==="carteras"&&(
        <div>
          {carteras.map((c,i)=>(
            <div key={i} style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}>
              {editCartera?.idx===i?(
                <>
                  <input className="input" style={{flex:1,fontSize:12,padding:"7px 10px"}} value={editCartera.val} onChange={e=>setEditCartera({idx:i,val:e.target.value})} autoFocus />
                  <button className="btn btn-red" style={{padding:"6px 12px",fontSize:11}} onClick={()=>{const n=[...carteras];n[editCartera.idx]=editCartera.val.trim()||c;saveCarteras(n);setEditCartera(null);showToast("Cartera actualizada ✓");}}>✓</button>
                  <button className="btn btn-glass" style={{padding:"6px 10px",fontSize:11}} onClick={()=>setEditCartera(null)}>✕</button>
                </>
              ):(
                <>
                  <div style={{flex:1,background:"#0A0B10",border:"1px solid #1E2130",borderRadius:8,padding:"8px 12px",fontSize:12,fontWeight:600,color:"#F0F2FF"}}>🗂 {c}</div>
                  <button className="btn-icon" style={{fontSize:11}} onClick={()=>setEditCartera({idx:i,val:c})}>✏</button>
                  <button className="btn-danger-icon" style={{fontSize:10}} onClick={()=>{if(!window.confirm(`¿Eliminar "${c}"?`))return;saveCarteras(carteras.filter((_,j)=>j!==i));showToast("Cartera eliminada");}}>🗑</button>
                </>
              )}
            </div>
          ))}
          <div style={{display:"flex",gap:8,marginTop:10}}>
            <input className="input" style={{flex:1,fontSize:12,padding:"8px 12px"}} placeholder="Nueva cartera..." value={newCartera} onChange={e=>setNewCartera(e.target.value)} onKeyDown={e=>e.key==="Enter"&&newCartera.trim()&&(saveCarteras([...carteras,newCartera.trim()]),setNewCartera(""),showToast("Cartera agregada ✓"))} />
            <button className="btn btn-red" style={{padding:"8px 14px",fontSize:12}} onClick={()=>{if(!newCartera.trim())return;saveCarteras([...carteras,newCartera.trim()]);setNewCartera("");showToast("Cartera agregada ✓");}}>+ Agregar</button>
          </div>
        </div>
      )}

      {/* ── ROLES ── */}
      {tab==="roles"&&(
        <div>
          {roles.map((r,i)=>(
            <div key={i} style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}>
              {editRole===i?(
                <div style={{flex:1,background:"#0A0B10",border:"1px solid #1E2130",borderRadius:8,padding:10,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                  <input className="input" style={{flex:1,fontSize:12,padding:"6px 10px",minWidth:100}} placeholder="Nombre del rol" value={r.label} onChange={e=>{const n=[...roles];n[i]={...n[i],label:e.target.value};saveRoles(n);}} />
                  <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                    {COLORS.map(c=><button key={c} onClick={()=>{const n=[...roles];n[i]={...n[i],color:c};saveRoles(n);}} style={{width:20,height:20,borderRadius:"50%",background:c,border:r.color===c?"2px solid #fff":"2px solid transparent",cursor:"pointer"}}/>)}
                  </div>
                  <button className="btn btn-red" style={{padding:"5px 10px",fontSize:11}} onClick={()=>setEditRole(null)}>✓</button>
                </div>
              ):(
                <>
                  <div style={{flex:1,background:"#0A0B10",border:"1px solid #1E2130",borderRadius:8,padding:"8px 12px",display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:10,height:10,borderRadius:"50%",background:r.color,flexShrink:0}}/>
                    <span style={{fontSize:12,fontWeight:700,color:"#F0F2FF"}}>{r.label}</span>
                    <span style={{fontSize:10,color:"#4A5178",fontFamily:"monospace"}}>{r.key}</span>
                  </div>
                  <button className="btn-icon" style={{fontSize:11}} onClick={()=>setEditRole(i)}>✏</button>
                  <button className="btn-danger-icon" style={{fontSize:10}} onClick={()=>{if(!window.confirm(`¿Eliminar rol "${r.label}"?`))return;saveRoles(roles.filter((_,j)=>j!==i));showToast("Rol eliminado");}}>🗑</button>
                </>
              )}
            </div>
          ))}
          <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap"}}>
            <input className="input" style={{flex:1,fontSize:12,padding:"8px 12px",minWidth:100}} placeholder="Nombre (ej: Coordinador)" value={newRole.label} onChange={e=>setNewRole({...newRole,label:e.target.value,key:e.target.value.toLowerCase().replace(/\s+/g,"_")})} />
            <div style={{display:"flex",gap:4,alignItems:"center"}}>
              {COLORS.map(c=><button key={c} onClick={()=>setNewRole({...newRole,color:c})} style={{width:22,height:22,borderRadius:"50%",background:c,border:newRole.color===c?"2px solid #fff":"2px solid transparent",cursor:"pointer"}}/>)}
            </div>
            <button className="btn btn-red" style={{padding:"8px 14px",fontSize:12}} onClick={()=>{if(!newRole.label.trim())return;saveRoles([...roles,{...newRole,key:newRole.key||newRole.label.toLowerCase().replace(/\s+/g,"_")}]);setNewRole({key:"",label:"",color:"#8891B0"});showToast("Rol agregado ✓");}}>+ Agregar</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// NEW MEETING MODAL — with conflict detection
// ══════════════════════════════════════════════════════════════════════════
function NewMeetingModal({ currentUser, users, tasks, meetings, editingMeeting, getRoleLabel, getRoleColor, onClose, onSave }) {
  const init = editingMeeting ? {
    title:editingMeeting.title||"", date:editingMeeting.date||"", time:editingMeeting.time||"",
    type:editingMeeting.type||"seguimiento", notes:editingMeeting.notes||"",
    participants:editingMeeting.participants||[currentUser.id], notify_before:editingMeeting.notify_before||[],
    recurrence:editingMeeting.recurrence||"", recurrence_days:editingMeeting.recurrence_days||[], recurrence_end:editingMeeting.recurrence_end||""
  } : {title:"",date:"",time:"",type:"seguimiento",notes:"",participants:[currentUser.id],notify_before:[],
    recurrence:"", recurrence_days:[], recurrence_end:""
  };

  const [form,      setForm]      = useState(init);
  const [conflicts, setConflicts] = useState([]);
  const [showConflictDetail, setShowConflictDetail] = useState(false);

  const toggle = id => setForm(f=>({...f,participants:f.participants.includes(id)?f.participants.filter(x=>x!==id):[...f.participants,id]}));
  const toggleNotif = v => setForm(f=>({...f,notify_before:f.notify_before.includes(v)?f.notify_before.filter(x=>x!==v):[...f.notify_before,v]}));

  // Live conflict detection
  useEffect(() => {
    if (!form.date || !form.time || form.participants.length === 0) { setConflicts([]); return; }
    const found = detectConflicts({
      date: form.date,
      time: form.time,
      excludeId: editingMeeting?.id,
      excludeType: "meeting",
      userIds: form.participants,
      tasks,
      meetings,
      users
    });
    setConflicts(found);
  }, [form.date, form.time, form.participants]);

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="font-display" style={{fontSize:17,marginBottom:18}}>+ Nueva Reunión</div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div><label className="label">Título *</label><input className="input" placeholder="¿De qué trata?" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} /></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div><label className="label">Fecha *</label><input type="date" className="input" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} /></div>
            <div><label className="label">Hora *</label><input type="time" className="input" value={form.time} onChange={e=>setForm({...form,time:e.target.value})} /></div>
          </div>
          <div><label className="label">Tipo</label><select className="input" value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>{Object.entries(MEET_TYPES).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}</select></div>
          <div><label className="label">Agenda</label><textarea className="input" rows={2} placeholder="Puntos a tratar..." value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} style={{resize:"vertical"}} /></div>

          {/* Recurrencia reunión */}
          <div><label className="label">Recurrencia</label>
            <select className="input" value={form.recurrence} onChange={e=>setForm({...form,recurrence:e.target.value})}>
              <option value="">Sin recurrencia</option>
              <option value="diaria">Diaria</option>
              <option value="semanal">Semanal</option>
              <option value="quincenal">Quincenal</option>
              <option value="mensual">Mensual</option>
            </select>
          </div>
          {form.recurrence==="semanal"&&(
            <div>
              <label className="label">Días</label>
              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                {[["L",1],["M",2],["X",3],["J",4],["V",5],["S",6],["D",0]].map(([l,d])=>(
                  <button key={d} onClick={()=>setForm(f=>({...f,recurrence_days:f.recurrence_days.includes(d)?f.recurrence_days.filter(x=>x!==d):[...f.recurrence_days,d]}))} style={{width:34,height:34,borderRadius:8,border:"1.5px solid",fontSize:12,fontWeight:800,cursor:"pointer",background:form.recurrence_days.includes(d)?"rgba(10,132,255,.15)":"#0A0B10",color:form.recurrence_days.includes(d)?"#0A84FF":"#4A5178",borderColor:form.recurrence_days.includes(d)?"rgba(10,132,255,.4)":"#1E2130"}}>{l}</button>
                ))}
              </div>
            </div>
          )}
          {form.recurrence&&<div><label className="label">Repetir hasta</label><input type="date" className="input" value={form.recurrence_end} onChange={e=>setForm({...form,recurrence_end:e.target.value})} /></div>}

          {/* CONFLICT BANNER */}
          {conflicts.length > 0 && (
            <div className="conflict-banner">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{display:"flex",alignItems:"center",gap:7}}>
                  <div className="conflict-dot"/>
                  <span style={{fontSize:12,fontWeight:800,color:"#FF9500"}}>
                    ⚠ {conflicts.length === 1 ? "Conflicto detectado" : `${conflicts.length} conflictos detectados`}
                  </span>
                </div>
                <button onClick={()=>setShowConflictDetail(!showConflictDetail)} style={{background:"none",border:"none",cursor:"pointer",color:"#FF9500",fontSize:11,fontWeight:700}}>
                  {showConflictDetail?"Ocultar ▲":"Ver detalle ▼"}
                </button>
              </div>
              {showConflictDetail && conflicts.map((c,i)=>(
                <div key={i} className="conflict-item">
                  <div className="avatar" style={{width:24,height:24,background:c.personColor+"22",color:c.personColor,fontSize:8,flexShrink:0}}>{c.personAvatar}</div>
                  <div style={{flex:1}}>
                    <span style={{fontWeight:700,color:c.personColor,fontSize:12}}>{c.person}</span>
                    <span style={{color:"#8891B0",fontSize:12}}> tiene {c.type} </span>
                    <span style={{fontWeight:700,color:"#F0F2FF",fontSize:12}}>"{c.title}"</span>
                    <span style={{color:"#4A5178",fontSize:11}}> a las {c.time}</span>
                  </div>
                  <span style={{fontSize:14}}>{c.icon}</span>
                </div>
              ))}
              <div style={{fontSize:10,color:"#FF9500",marginTop:showConflictDetail?8:0,fontWeight:600,opacity:.8}}>
                Puedes agendar igual — es solo un aviso
              </div>
            </div>
          )}

          {/* Notificaciones */}
          <div>
            <label className="label">🔔 Notificar a participantes</label>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {[[60,"1h antes"],[30,"30min"],[15,"15min"],[5,"5min"]].map(([v,l])=>(
                <button key={v} onClick={()=>toggleNotif(v)} style={{padding:"5px 12px",borderRadius:8,border:"1.5px solid",fontSize:11,fontWeight:700,cursor:"pointer",background:form.notify_before.includes(v)?"rgba(255,77,77,.12)":"#0A0B10",color:form.notify_before.includes(v)?"#FF4D4D":"#4A5178",borderColor:form.notify_before.includes(v)?"rgba(255,77,77,.35)":"#1E2130"}}>{l}</button>
              ))}
            </div>
            <div style={{fontSize:10,color:"#4A5178",marginTop:4,fontWeight:600}}>⚡ Activo cuando conectes Resend</div>
          </div>

          <div>
            <label className="label">Participantes ({form.participants.length})</label>
            <div style={{background:"#0A0B10",borderRadius:10,padding:8,display:"grid",gridTemplateColumns:"1fr 1fr",gap:2,maxHeight:150,overflowY:"auto",border:"1.5px solid #1E2130"}}>
              {users.map(u=>(
                <label key={u.id} className="check-row">
                  <input type="checkbox" checked={form.participants.includes(u.id)} onChange={()=>toggle(u.id)} style={{accentColor:u.color}} />
                  <div className="avatar" style={{width:20,height:20,background:u.color+"22",color:u.color,fontSize:7}}>{u.avatar}</div>
                  <span style={{fontSize:12,flex:1,fontWeight:600}}>{u.role==="gerente"?"Gerente":u.name.split(" ")[0]}</span>
                  <span style={{fontSize:9,color:getRoleColor(u.role),fontWeight:700}}>{getRoleLabel(u.role)}</span>
                </label>
              ))}
            </div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button className="btn btn-glass" style={{flex:1,justifyContent:"center"}} onClick={onClose}>Cancelar</button>
            <button className="btn btn-red" style={{flex:2,justifyContent:"center",position:"relative"}} onClick={()=>{if(!form.title.trim()||!form.date||!form.time){alert("Completa los campos requeridos");return;}onSave(form);}}>
              {conflicts.length>0&&<span style={{position:"absolute",top:-6,right:-6,background:"#FF9500",color:"#000",borderRadius:"50%",width:16,height:16,fontSize:9,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center"}}>!</span>}
              Agendar ✓
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
