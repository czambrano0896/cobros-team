import { useState, useEffect, useCallback } from "react";

const SUPA_URL = "https://glwjigzgsrmaqkfnnvve.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdsd2ppZ3pnc3JtYXFrZm5udnZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMzQzNzksImV4cCI6MjA4ODgxMDM3OX0.Nl7ZNlxUSHDui_P_XDO9JckHqjKkgaVycb7Yl-7pz2Q";

const db = {
  async get(table, query = "") {
    const r = await fetch(`${SUPA_URL}/rest/v1/${table}?${query}&order=created_at.desc`, {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, "Content-Type": "application/json" }
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
  }
};

const PRIORITIES = [
  { value: "urgente", label: "Urgente", color: "#e85d4a" },
  { value: "alta",    label: "Alta",    color: "#ed8936" },
  { value: "media",   label: "Media",   color: "#4a9eed" },
  { value: "baja",    label: "Baja",    color: "#48bb78" },
];
const PRIO_ORDER = { urgente:0, alta:1, media:2, baja:3 };
const CARTERAS   = ["Cartera Vencida","Cartera Corriente","Cartera Judicial","Cartera Empresarial","Cartera Pequeñas Cuentas"];
const MEET_TYPES = { seguimiento:{label:"Seguimiento",color:"#4a9eed"}, estrategia:{label:"Estrategia",color:"#9f7aea"}, capacitacion:{label:"Capacitación",color:"#48bb78"}, otro:{label:"Otro",color:"#ed8936"} };
const ROLE_LABEL = { gerente:"Gerente", supervisor:"Supervisor", analista:"Analista" };
const ROLE_COLOR = { gerente:"#e85d4a", supervisor:"#f6ad55", analista:"#4a9eed" };

const fmtDate  = d => { if(!d) return ""; const dt=new Date(d+"T00:00:00"); return dt.toLocaleDateString("es-ES",{day:"2-digit",month:"short",year:"numeric"}); };
const daysLeft = d => { if(!d) return null; const t=new Date(); t.setHours(0,0,0,0); return Math.ceil((new Date(d+"T00:00:00")-t)/86400000); };

// ── STYLES ──────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Syne:wght@700;800&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
body{background:#0b0d14;}
::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#12151e}::-webkit-scrollbar-thumb{background:#2d3148;border-radius:4px}
.nav-btn{background:none;border:none;cursor:pointer;padding:9px 16px;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;transition:all .2s;color:#4a5280;}
.nav-btn:hover{background:#1e2235;color:#e8eaf0;}
.nav-btn.active{background:#1e2235;color:#e85d4a;border-bottom:2px solid #e85d4a;}
.btn-primary{background:linear-gradient(135deg,#e85d4a,#f0956a);color:white;border:none;border-radius:8px;padding:10px 20px;font-family:'DM Sans',sans-serif;font-weight:700;font-size:13px;cursor:pointer;transition:all .2s;}
.btn-primary:hover{transform:translateY(-1px);box-shadow:0 6px 20px #e85d4a33;}
.btn-ghost{background:#1e2235;color:#8892b0;border:1px solid #2d3148;border-radius:8px;padding:8px 14px;font-family:'DM Sans',sans-serif;font-size:13px;cursor:pointer;transition:all .2s;}
.btn-ghost:hover{background:#2d3148;color:#e8eaf0;}
.btn-danger{background:#2a1515;color:#e85d4a;border:1px solid #e85d4a44;border-radius:7px;padding:6px 12px;font-family:'DM Sans',sans-serif;font-size:12px;cursor:pointer;transition:all .2s;}
.btn-danger:hover{background:#3a1a1a;}
.btn-sm{background:#1e2235;color:#8892b0;border:1px solid #2d3148;border-radius:6px;padding:5px 10px;font-family:'DM Sans',sans-serif;font-size:11px;cursor:pointer;transition:all .2s;}
.btn-sm:hover{color:#e8eaf0;background:#2d3148;}
.input-field{background:#12151e;border:1.5px solid #2d3148;border-radius:9px;padding:10px 14px;color:#e8eaf0;font-family:'DM Sans',sans-serif;font-size:14px;width:100%;outline:none;transition:border-color .2s;}
.input-field:focus{border-color:#e85d4a;}
.input-field option{background:#1a1d27;}
.select-sm{background:#12151e;border:1px solid #2d3148;border-radius:8px;padding:8px 12px;color:#8892b0;font-family:'DM Sans',sans-serif;font-size:13px;outline:none;cursor:pointer;}
.select-sm:focus{border-color:#e85d4a;color:#e8eaf0;}
.tag{display:inline-flex;align-items:center;padding:2px 9px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;}
.task-row{border-radius:12px;padding:16px 18px;border:1px solid #2d3148;background:#1a1d27;transition:all .2s;margin-bottom:8px;}
.task-row:hover{border-color:#3d4570;background:#1e2235;}
.avatar{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0;}
.avatar-sm{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;flex-shrink:0;}
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.8);backdrop-filter:blur(6px);z-index:200;display:flex;align-items:center;justify-content:center;padding:20px;}
.modal{background:#1a1d27;border:1px solid #2d3148;border-radius:18px;padding:28px;width:100%;max-width:540px;max-height:92vh;overflow-y:auto;}
.label{font-size:11px;font-weight:700;color:#8892b0;text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px;display:block;}
.toast{position:fixed;bottom:24px;right:24px;z-index:9999;padding:13px 20px;border-radius:10px;font-size:13px;font-weight:600;font-family:'DM Sans',sans-serif;box-shadow:0 8px 32px rgba(0,0,0,.5);}
@keyframes slideUp{from{transform:translateY(16px);opacity:0}to{transform:translateY(0);opacity:1}}
.slide-up{animation:slideUp .3s ease;}
.stat-card{background:#1a1d27;border:1px solid #2d3148;border-radius:12px;padding:18px;}
.progress{height:4px;background:#2d3148;border-radius:2px;overflow:hidden;margin-top:8px;}
.progress-fill{height:100%;border-radius:2px;transition:width .6s ease;}
.meeting-card{background:#1a1d27;border:1px solid #2d3148;border-radius:12px;padding:18px;transition:all .2s;margin-bottom:10px;}
.meeting-card:hover{border-color:#3d4570;}
.section-title{font-family:'Syne',sans-serif;font-size:20px;font-weight:800;color:#e8eaf0;}
.role-badge{padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;}
.days-pill{font-size:10px;font-weight:800;padding:2px 7px;border-radius:4px;letter-spacing:.3px;}
.notif-dot{position:absolute;top:-1px;right:-1px;width:8px;height:8px;background:#e85d4a;border-radius:50%;border:2px solid #0b0d14;}
.comment-box{background:#12151e;border-radius:10px;padding:12px;margin-top:10px;}
.comment-item{padding:8px 0;border-bottom:1px solid #2d314855;}
.comment-item:last-child{border-bottom:none;}
.checkbox-row{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;cursor:pointer;transition:background .15s;}
.checkbox-row:hover{background:#2d3148;}
.login-input{background:#12151e;border:1.5px solid #2d3148;border-radius:10px;padding:13px 16px;color:#e8eaf0;font-family:'DM Sans',sans-serif;font-size:15px;width:100%;outline:none;transition:border-color .2s;}
.login-input:focus{border-color:#e85d4a;}
.login-input::placeholder{color:#4a5280;}
.login-btn{width:100%;background:linear-gradient(135deg,#e85d4a,#f0956a);color:white;border:none;border-radius:10px;padding:14px;font-family:'DM Sans',sans-serif;font-weight:700;font-size:16px;cursor:pointer;transition:all .2s;}
.login-btn:hover{transform:translateY(-1px);box-shadow:0 8px 24px #e85d4a44;}
@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}
.shake{animation:shake .4s ease;}
@keyframes fadeIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
.fade-in{animation:fadeIn .4s ease;}
.spin{animation:spin 1s linear infinite;}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
`;

// ══════════════════════════════════════════════════════════════════════════
export default function App() {
  const [user, setUser]     = useState(null);
  const [users, setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    db.get("users","select=*").then(data => { setUsers(Array.isArray(data)?data:[]); setLoading(false); });
  }, []);

  const refreshUsers = () => db.get("users","select=*").then(d=>setUsers(Array.isArray(d)?d:[]));

  if (loading) return (
    <div style={{minHeight:"100vh",background:"#0b0d14",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Sans',sans-serif"}}>
      <style>{CSS}</style>
      <div style={{textAlign:"center"}}>
        <div style={{width:48,height:48,background:"linear-gradient(135deg,#e85d4a,#f0956a)",borderRadius:12,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:24,marginBottom:16}}>⚡</div>
        <div style={{color:"#4a5280",fontSize:14}}>Conectando a CobrosTeam...</div>
      </div>
    </div>
  );

  if (!user) return <LoginScreen users={users} onLogin={setUser} />;
  return <Dashboard currentUser={user} users={users} refreshUsers={refreshUsers} onLogout={()=>setUser(null)} />;
}

// ══════════════════════════════════════════════════════════════════════════
// LOGIN
// ══════════════════════════════════════════════════════════════════════════
function LoginScreen({ users, onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [showPass, setShowPass] = useState(false);
  const [shake, setShake]       = useState(false);

  const handleLogin = () => {
    const u = users.find(u => u.username === username.trim().toLowerCase() && u.password === password);
    if (u) { onLogin(u); }
    else { setError("Usuario o contraseña incorrectos"); setShake(true); setTimeout(()=>setShake(false),500); }
  };

  return (
    <div style={{minHeight:"100vh",background:"#0b0d14",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Sans',sans-serif",padding:20}}>
      <style>{CSS}</style>
      <div className="fade-in" style={{width:"100%",maxWidth:400}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{width:56,height:56,background:"linear-gradient(135deg,#e85d4a,#f0956a)",borderRadius:14,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:26,marginBottom:14,boxShadow:"0 12px 32px #e85d4a33"}}>⚡</div>
          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:26,color:"#e8eaf0"}}>CobrosTeam</div>
          <div style={{color:"#4a5280",fontSize:13,marginTop:4}}>Gestión de equipos de cobros</div>
        </div>
        <div className={shake?"shake":""} style={{background:"#1a1d27",border:"1px solid #2d3148",borderRadius:16,padding:28}}>
          <div style={{fontSize:17,fontWeight:700,color:"#e8eaf0",marginBottom:20}}>Iniciar sesión</div>
          <div style={{display:"flex",flexDirection:"column",gap:13}}>
            <div>
              <label className="label">Usuario</label>
              <input className="login-input" placeholder="tu.usuario" value={username} onChange={e=>{setUsername(e.target.value);setError("");}} onKeyDown={e=>e.key==="Enter"&&handleLogin()} />
            </div>
            <div>
              <label className="label">Contraseña</label>
              <div style={{position:"relative"}}>
                <input className="login-input" type={showPass?"text":"password"} placeholder="••••••••" value={password} onChange={e=>{setPassword(e.target.value);setError("");}} onKeyDown={e=>e.key==="Enter"&&handleLogin()} style={{paddingRight:44}} />
                <button onClick={()=>setShowPass(!showPass)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"#4a5280",fontSize:16}}>{showPass?"🙈":"👁"}</button>
              </div>
            </div>
            {error && <div style={{background:"#2a1515",border:"1px solid #e85d4a44",borderRadius:8,padding:"10px 14px",color:"#e85d4a",fontSize:13}}>⚠ {error}</div>}
            <button className="login-btn" onClick={handleLogin}>Entrar al sistema</button>
          </div>
        </div>
        <div style={{marginTop:16,background:"#12151e",border:"1px solid #2d3148",borderRadius:10,padding:"12px 16px"}}>
          <div style={{fontSize:11,color:"#4a5280",fontWeight:700,textTransform:"uppercase",letterSpacing:".8px",marginBottom:8}}>Usuarios registrados</div>
          {users.map(u=>(
            <div key={u.id} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",fontSize:12,borderBottom:"1px solid #2d314844"}}>
              <span style={{color:"#e8eaf0",fontWeight:600}}>{u.name.split(" ")[0]}</span>
              <span style={{color:"#4a9eed",fontFamily:"monospace"}}>{u.username}</span>
              <span style={{color:ROLE_COLOR[u.role]}}>{ROLE_LABEL[u.role]}</span>
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
function Dashboard({ currentUser, users, refreshUsers, onLogout }) {
  const [view,           setView]          = useState("tablero");
  const [tasks,          setTasks]         = useState([]);
  const [meetings,       setMeetings]      = useState([]);
  const [comments,       setComments]      = useState([]);
  const [loading,        setLoading]       = useState(true);
  const [filterUser,     setFilterUser]    = useState("all");
  const [filterPriority, setFilterPriority]= useState("all");
  const [filterStatus,   setFilterStatus]  = useState("all");
  const [showNewTask,    setShowNewTask]   = useState(false);
  const [showNewMeeting, setShowNewMeeting]= useState(false);
  const [showNotif,      setShowNotif]     = useState(false);
  const [expandedTask,   setExpandedTask]  = useState(null);
  const [confirmDelete,  setConfirmDelete] = useState(null);
  const [showVisibility, setShowVisibility]= useState(null);
  const [toast,          setToast]         = useState(null);
  const isGerente = currentUser.role === "gerente";

  const showToast = (msg, type="success") => { setToast({msg,type}); setTimeout(()=>setToast(null),3200); };

  const loadAll = useCallback(async () => {
    const [t, m, c] = await Promise.all([
      db.get("tasks","select=*"),
      db.get("meetings","select=*"),
      db.get("task_comments","select=*")
    ]);
    setTasks(Array.isArray(t)?t:[]);
    setMeetings(Array.isArray(m)?m:[]);
    setComments(Array.isArray(c)?c:[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Notificaciones
  const notifications = [];
  tasks.forEach(t => {
    if (!isTaskVisible(t, currentUser)) return;
    const dl = daysLeft(t.due_date);
    if (t.status !== "completado") {
      if (dl !== null && dl <= 0) notifications.push({id:`ov-${t.id}`,type:"error",  msg:`"${t.title}" está VENCIDA`, sub: getUser(t.assigned_to)?.name});
      if (dl === 1)               notifications.push({id:`d1-${t.id}`,type:"warning",msg:`"${t.title}" vence mañana`});
      if (dl === 2)               notifications.push({id:`d2-${t.id}`,type:"info",   msg:`"${t.title}" vence en 2 días`});
    }
  });
  meetings.forEach(m => {
    const dl = daysLeft(m.date);
    if (dl === 0) notifications.push({id:`mt-${m.id}`,type:"warning",msg:`Reunión "${m.title}" es HOY a las ${m.time}`});
    if (dl === 1) notifications.push({id:`mm-${m.id}`,type:"info",   msg:`Reunión "${m.title}" es mañana`});
  });

  function getUser(id) { return users.find(u=>u.id===id); }

  function isTaskVisible(task, viewer) {
    // Tareas del gerente: solo visibles si is_published o si el viewer es gerente
    if (task.assigned_by !== viewer.id && task.assigned_to !== viewer.id) {
      const creator = getUser(task.assigned_by);
      if (creator?.role === "gerente" && !task.is_published) return false;
    }
    // Visibilidad específica
    if (task.visible_to && task.visible_to.length > 0) {
      if (!task.visible_to.includes(viewer.id)) return false;
    }
    return true;
  }

  function canDelete(item, type) {
    if (isGerente) return true;
    return item.assigned_by === currentUser.id || item.created_by === currentUser.id;
  }

  function canUpdateStatus(task) {
    return task.assigned_to === currentUser.id || task.assigned_by === currentUser.id || isGerente;
  }

  const deleteTask = async (id) => {
    await db.delete("task_comments", `task_id=eq.${id}`);
    await db.delete("tasks", id);
    setTasks(p=>p.filter(t=>t.id!==id));
    setConfirmDelete(null);
    showToast("Tarea eliminada");
  };

  const deleteMeeting = async (id) => {
    await db.delete("meetings", id);
    setMeetings(p=>p.filter(m=>m.id!==id));
    setConfirmDelete(null);
    showToast("Reunión eliminada");
  };

  const updateStatus = async (id, status) => {
    await db.update("tasks", id, {status});
    setTasks(p=>p.map(t=>t.id===id?{...t,status}:t));
    if (status==="completado") showToast("¡Tarea completada! ✓");
    else showToast("Estado actualizado");
  };

  const togglePublish = async (task) => {
    const val = !task.is_published;
    await db.update("tasks", task.id, {is_published: val});
    setTasks(p=>p.map(t=>t.id===task.id?{...t,is_published:val}:t));
    showToast(val ? "Tarea publicada al equipo ✓" : "Tarea ocultada");
  };

  const saveVisibility = async (taskId, visibleTo) => {
    await db.update("tasks", taskId, {visible_to: visibleTo.length>0?visibleTo:null});
    setTasks(p=>p.map(t=>t.id===taskId?{...t,visible_to:visibleTo.length>0?visibleTo:null}:t));
    setShowVisibility(null);
    showToast("Visibilidad actualizada ✓");
  };

  const addComment = async (taskId, comment) => {
    const res = await db.insert("task_comments", {task_id:taskId, user_id:currentUser.id, comment});
    if (Array.isArray(res) && res[0]) {
      setComments(p=>[...p, res[0]]);
      showToast("Comentario agregado ✓");
    }
  };

  const filteredTasks = tasks.filter(t => {
    if (!isTaskVisible(t, currentUser)) return false;
    if (filterUser !== "all" && t.assigned_to !== parseInt(filterUser) && t.assigned_by !== parseInt(filterUser)) return false;
    if (filterPriority !== "all" && t.priority !== filterPriority) return false;
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    return true;
  });

  const stats = {
    total:     filteredTasks.length,
    pendiente: filteredTasks.filter(t=>t.status==="pendiente").length,
    enProceso: filteredTasks.filter(t=>t.status==="en-proceso").length,
    completado:filteredTasks.filter(t=>t.status==="completado").length,
    vencidas:  filteredTasks.filter(t=>t.status!=="completado"&&daysLeft(t.due_date)!==null&&daysLeft(t.due_date)<=0).length,
  };

  if (loading) return (
    <div style={{minHeight:"100vh",background:"#0b0d14",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Sans',sans-serif",color:"#4a5280"}}>
      <style>{CSS}</style>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:32,marginBottom:12}} className="spin">⚡</div>
        <div>Cargando datos...</div>
      </div>
    </div>
  );

  return (
    <div style={{fontFamily:"'DM Sans',sans-serif",background:"#0b0d14",minHeight:"100vh",color:"#e8eaf0"}}>
      <style>{CSS}</style>

      {/* HEADER */}
      <div style={{background:"#0b0d14",borderBottom:"1px solid #1e2235",padding:"0 24px",position:"sticky",top:0,zIndex:50}}>
        <div style={{maxWidth:1200,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",height:58}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:30,height:30,background:"linear-gradient(135deg,#e85d4a,#f0956a)",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15}}>⚡</div>
            <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:17,color:"#e8eaf0"}}>CobrosTeam</span>
          </div>
          <div style={{display:"flex",gap:2}}>
            {[["tablero","📋 Tablero"],["reuniones","📅 Reuniones"],["equipo","👥 Equipo"]].map(([v,l])=>(
              <button key={v} className={`nav-btn ${view===v?"active":""}`} onClick={()=>setView(v)}>{l}</button>
            ))}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{position:"relative"}}>
              <button onClick={()=>setShowNotif(!showNotif)} style={{background:"none",border:"none",cursor:"pointer",padding:"6px 8px",borderRadius:8,color:"#4a5280",fontSize:18,lineHeight:1}}>
                🔔{notifications.length>0&&<span className="notif-dot"/>}
              </button>
              {showNotif&&(
                <div style={{position:"absolute",right:0,top:44,width:300,background:"#1a1d27",border:"1px solid #2d3148",borderRadius:12,padding:14,zIndex:300,boxShadow:"0 16px 48px rgba(0,0,0,.6)"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#4a5280",textTransform:"uppercase",letterSpacing:".8px",marginBottom:10}}>Alertas · {notifications.length}</div>
                  {notifications.length===0
                    ? <div style={{color:"#4a5280",textAlign:"center",padding:"20px 0",fontSize:13}}>Sin alertas ✓</div>
                    : notifications.map(n=>(
                        <div key={n.id} style={{padding:"9px 11px",borderRadius:8,marginBottom:5,background:n.type==="error"?"#2a1515":n.type==="warning"?"#231d12":"#121a24",borderLeft:`3px solid ${n.type==="error"?"#e85d4a":n.type==="warning"?"#ed8936":"#4a9eed"}`,fontSize:12}}>
                          <div style={{color:"#e8eaf0",fontWeight:600}}>{n.msg}</div>
                          {n.sub&&<div style={{color:"#4a5280",marginTop:2}}>{n.sub}</div>}
                        </div>
                      ))}
                </div>
              )}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8,background:"#1e2235",border:"1px solid #2d3148",borderRadius:10,padding:"6px 12px"}}>
              <div className="avatar" style={{background:currentUser.color+"22",color:currentUser.color,width:28,height:28,fontSize:10}}>{currentUser.avatar}</div>
              <div>
                <div style={{fontSize:13,fontWeight:700,lineHeight:1.2}}>{currentUser.name.split(" ")[0]}</div>
                <div style={{fontSize:10,color:ROLE_COLOR[currentUser.role]}}>{ROLE_LABEL[currentUser.role]}</div>
              </div>
              <button onClick={onLogout} style={{background:"none",border:"none",cursor:"pointer",color:"#4a5280",fontSize:14,marginLeft:4}} title="Cerrar sesión">⏏</button>
            </div>
          </div>
        </div>
      </div>

      <div style={{maxWidth:1200,margin:"0 auto",padding:"26px 24px"}}>

        {/* ══ TABLERO ══ */}
        {view==="tablero"&&(
          <>
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:24}}>
              {[{l:"Total",v:stats.total,c:"#4a9eed",i:"📋"},{l:"Pendientes",v:stats.pendiente,c:"#8892b0",i:"⏳"},{l:"En proceso",v:stats.enProceso,c:"#ed8936",i:"🔄"},{l:"Completadas",v:stats.completado,c:"#48bb78",i:"✅"},{l:"Vencidas",v:stats.vencidas,c:"#e85d4a",i:"🚨"}].map((s,i)=>(
                <div key={i} className="stat-card">
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                    <span style={{fontSize:10,fontWeight:700,color:"#4a5280",textTransform:"uppercase",letterSpacing:".8px"}}>{s.l}</span>
                    <span style={{fontSize:16}}>{s.i}</span>
                  </div>
                  <div style={{fontSize:30,fontFamily:"'Syne',sans-serif",fontWeight:800,color:s.c}}>{s.v}</div>
                  <div className="progress"><div className="progress-fill" style={{width:`${stats.total>0?(s.v/stats.total)*100:0}%`,background:s.c}}/></div>
                </div>
              ))}
            </div>

            <div style={{display:"flex",gap:8,marginBottom:18,flexWrap:"wrap",alignItems:"center"}}>
              <div className="section-title" style={{marginRight:"auto"}}>Tareas</div>
              <select className="select-sm" value={filterUser} onChange={e=>setFilterUser(e.target.value)}>
                <option value="all">Todos</option>
                {users.map(u=><option key={u.id} value={u.id}>{u.name.split(" ")[0]}</option>)}
              </select>
              <select className="select-sm" value={filterPriority} onChange={e=>setFilterPriority(e.target.value)}>
                <option value="all">Prioridad</option>
                {PRIORITIES.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
              <select className="select-sm" value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
                <option value="all">Estado</option>
                <option value="pendiente">Pendiente</option>
                <option value="en-proceso">En proceso</option>
                <option value="completado">Completado</option>
              </select>
              <button className="btn-primary" onClick={()=>setShowNewTask(true)}>+ Nueva Tarea</button>
            </div>

            {filteredTasks.length===0&&<div style={{textAlign:"center",color:"#4a5280",padding:"48px 0",fontSize:14}}>No hay tareas con esos filtros</div>}
            {[...filteredTasks].sort((a,b)=>PRIO_ORDER[a.priority]-PRIO_ORDER[b.priority]).map(task=>{
              const assignee = getUser(task.assigned_to);
              const assigner = getUser(task.assigned_by);
              const prio     = PRIORITIES.find(p=>p.value===task.priority);
              const dl       = daysLeft(task.due_date);
              const isOver   = dl!==null&&dl<=0&&task.status!=="completado";
              const taskComments = comments.filter(c=>c.task_id===task.id);
              const isExpanded = expandedTask===task.id;
              const isGerenterTask = assigner?.role==="gerente";

              return (
                <div key={task.id} className="task-row" style={{borderLeft:isOver?"3px solid #e85d4a":task.status==="completado"?"3px solid #48bb7844":"3px solid transparent"}}>
                  <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
                    {assignee&&<div className="avatar" style={{background:assignee.color+"22",color:assignee.color}} title={assignee.name}>{assignee.avatar}</div>}
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap",marginBottom:3}}>
                        <span style={{fontWeight:700,fontSize:14,color:task.status==="completado"?"#4a5280":"#e8eaf0",textDecoration:task.status==="completado"?"line-through":"none"}}>{task.title}</span>
                        {prio&&<span className="tag" style={{color:prio.color,background:prio.color+"22"}}>{prio.label}</span>}
                        {task.status!=="completado"&&dl!==null&&(
                          <span className="days-pill" style={{background:dl<=0?"#e85d4a22":dl<=2?"#ed893622":"#2d3148",color:dl<=0?"#e85d4a":dl<=2?"#ed8936":"#4a5280"}}>
                            {dl<=0?"VENCIDA":dl===1?"Mañana":`${dl}d`}
                          </span>
                        )}
                        {isGerenterTask&&!task.is_published&&<span className="tag" style={{color:"#4a5280",background:"#2d3148"}}>🔒 Privada</span>}
                        {task.visible_to&&task.visible_to.length>0&&<span className="tag" style={{color:"#9f7aea",background:"#9f7aea22"}}>👁 Restringida</span>}
                        {taskComments.length>0&&<span style={{fontSize:11,color:"#4a5280"}}>💬 {taskComments.length}</span>}
                      </div>
                      {task.description&&<div style={{fontSize:12,color:"#4a5280",marginBottom:7,lineHeight:1.5}}>{task.description}</div>}
                      <div style={{display:"flex",gap:14,fontSize:11,color:"#4a5280",flexWrap:"wrap"}}>
                        <span>📂 {task.cartera}</span>
                        <span>📅 {fmtDate(task.due_date)}</span>
                        {assigner&&<span>↑ <span style={{color:assigner.color}}>{assigner.role==="gerente"?"Gerente":assigner.name.split(" ")[0]}</span></span>}
                        {assignee&&<span>→ <span style={{color:assignee.color}}>{assignee.name.split(" ")[0]}</span></span>}
                      </div>

                      {/* Comentarios expandidos */}
                      {isExpanded&&(
                        <div className="comment-box">
                          {taskComments.length===0&&<div style={{color:"#4a5280",fontSize:12,padding:"8px 0"}}>Sin comentarios aún</div>}
                          {taskComments.map(c=>{
                            const cu=getUser(c.user_id);
                            return (
                              <div key={c.id} className="comment-item">
                                <div style={{display:"flex",gap:8,alignItems:"flex-start"}}>
                                  {cu&&<div className="avatar-sm" style={{background:cu.color+"22",color:cu.color,marginTop:2}}>{cu.avatar}</div>}
                                  <div>
                                    <div style={{fontSize:11,fontWeight:700,color:cu?.color||"#e8eaf0",marginBottom:2}}>{cu?.name.split(" ")[0]||"?"}</div>
                                    <div style={{fontSize:13,color:"#c8cad8",lineHeight:1.5}}>{c.comment}</div>
                                    <div style={{fontSize:10,color:"#4a5280",marginTop:3}}>{new Date(c.created_at).toLocaleDateString("es-ES",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          <CommentInput onAdd={txt=>addComment(task.id,txt)} />
                        </div>
                      )}
                    </div>

                    {/* Acciones */}
                    <div style={{display:"flex",gap:5,alignItems:"center",flexShrink:0,flexWrap:"wrap",justifyContent:"flex-end"}}>
                      {canUpdateStatus(task)&&task.status==="pendiente"&&<button onClick={()=>updateStatus(task.id,"en-proceso")} style={{background:"#ed893622",color:"#ed8936",border:"none",borderRadius:7,padding:"5px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>▶ Iniciar</button>}
                      {canUpdateStatus(task)&&task.status==="en-proceso"&&<button onClick={()=>updateStatus(task.id,"completado")} style={{background:"#48bb7822",color:"#48bb78",border:"none",borderRadius:7,padding:"5px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>✓ Completar</button>}
                      <span style={{background:task.status==="completado"?"#48bb7822":task.status==="en-proceso"?"#ed893622":"#2d3148",color:task.status==="completado"?"#48bb78":task.status==="en-proceso"?"#ed8936":"#4a5280",padding:"4px 10px",borderRadius:6,fontSize:10,fontWeight:700,textTransform:"uppercase"}}>
                        {task.status==="completado"?"✓ Hecho":task.status==="en-proceso"?"🔄 Proceso":"⏳ Pend."}
                      </span>
                      <button className="btn-sm" onClick={()=>setExpandedTask(isExpanded?null:task.id)}>💬 {isExpanded?"Cerrar":"Notas"}</button>
                      {isGerente&&isGerenterTask&&<button className="btn-sm" onClick={()=>togglePublish(task)}>{task.is_published?"🔒 Ocultar":"👁 Publicar"}</button>}
                      {isGerente&&<button className="btn-sm" onClick={()=>setShowVisibility(task)}>⚙ Acceso</button>}
                      {canDelete(task,"task")&&<button className="btn-danger" onClick={()=>setConfirmDelete({type:"task",id:task.id,name:task.title})}>🗑</button>}
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* ══ REUNIONES ══ */}
        {view==="reuniones"&&(
          <>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22}}>
              <div><div className="section-title">Reuniones</div><div style={{color:"#4a5280",fontSize:13,marginTop:2}}>{meetings.length} agendadas</div></div>
              <button className="btn-primary" onClick={()=>setShowNewMeeting(true)}>+ Nueva Reunión</button>
            </div>
            {[...meetings].sort((a,b)=>new Date(a.date+"T"+a.time)-new Date(b.date+"T"+b.time)).map(m=>{
              const mt=MEET_TYPES[m.type]||MEET_TYPES.otro;
              const dl=daysLeft(m.date);
              const creator=getUser(m.created_by);
              return (
                <div key={m.id} className="meeting-card">
                  <div style={{display:"flex",gap:14,alignItems:"flex-start"}}>
                    <div style={{background:mt.color+"22",border:`1px solid ${mt.color}44`,borderRadius:10,padding:"10px 12px",textAlign:"center",minWidth:54,flexShrink:0}}>
                      <div style={{fontSize:10,fontWeight:700,color:mt.color,textTransform:"uppercase"}}>{new Date(m.date+"T00:00:00").toLocaleDateString("es-ES",{month:"short"})}</div>
                      <div style={{fontSize:24,fontFamily:"'Syne',sans-serif",fontWeight:800,color:"#e8eaf0",lineHeight:1}}>{new Date(m.date+"T00:00:00").getDate()}</div>
                    </div>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap",marginBottom:4}}>
                        <span style={{fontWeight:700,fontSize:15}}>{m.title}</span>
                        <span className="tag" style={{color:mt.color,background:mt.color+"22"}}>{mt.label}</span>
                        {dl===0&&<span className="tag" style={{color:"#e85d4a",background:"#e85d4a22"}}>HOY</span>}
                        {dl===1&&<span className="tag" style={{color:"#ed8936",background:"#ed893622"}}>Mañana</span>}
                      </div>
                      <div style={{fontSize:12,color:"#4a5280",marginBottom:10}}>🕐 {m.time} hrs{m.notes?` · ${m.notes}`:""}{creator?` · Creado por ${creator.role==="gerente"?"Gerente":creator.name.split(" ")[0]}`:""}</div>
                      <div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
                        {(m.participants||[]).map(pid=>{const u=getUser(pid);return u?<div key={pid} className="avatar-sm" style={{background:u.color+"22",color:u.color,border:`1px solid ${u.color}33`}} title={u.name}>{u.avatar}</div>:null;})}
                        <span style={{fontSize:11,color:"#4a5280",paddingLeft:6}}>{(m.participants||[]).length} participantes</span>
                      </div>
                    </div>
                    {canDelete(m,"meeting")&&<button className="btn-danger" onClick={()=>setConfirmDelete({type:"meeting",id:m.id,name:m.title})}>🗑</button>}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* ══ EQUIPO ══ */}
        {view==="equipo"&&(
          <>
            <div className="section-title" style={{marginBottom:4}}>Estado del Equipo</div>
            <div style={{color:"#4a5280",fontSize:13,marginBottom:22}}>Carga y progreso por persona</div>
            {isGerente&&<ManageUsers users={users} onRefresh={refreshUsers} showToast={showToast} />}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(270px,1fr))",gap:12,marginTop:20}}>
              {users.filter(u=>u.role!=="gerente").map(member=>{
                const mt=tasks.filter(t=>t.assigned_to===member.id);
                const done=mt.filter(t=>t.status==="completado").length;
                const ov=mt.filter(t=>t.status!=="completado"&&daysLeft(t.due_date)!==null&&daysLeft(t.due_date)<=0).length;
                return (
                  <div key={member.id} className="card" style={{padding:18,background:"#1a1d27",border:"1px solid #2d3148",borderRadius:14}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                      <div style={{width:44,height:44,borderRadius:"50%",background:member.color+"22",color:member.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:800,flexShrink:0}}>{member.avatar}</div>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:700,fontSize:14}}>{member.name}</div>
                        <span className="role-badge" style={{color:ROLE_COLOR[member.role],background:ROLE_COLOR[member.role]+"22"}}>{ROLE_LABEL[member.role]}</span>
                      </div>
                      {ov>0&&<span className="tag" style={{color:"#e85d4a",background:"#e85d4a22"}}>⚠ {ov}</span>}
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:10}}>
                      {[["Pend.",mt.filter(t=>t.status==="pendiente").length,"#8892b0"],["Proceso",mt.filter(t=>t.status==="en-proceso").length,"#ed8936"],["Listas",done,"#48bb78"]].map(([l,v,c])=>(
                        <div key={l} style={{background:"#12151e",borderRadius:8,padding:"8px 6px",textAlign:"center"}}>
                          <div style={{fontSize:20,fontFamily:"'Syne',sans-serif",fontWeight:800,color:c}}>{v}</div>
                          <div style={{fontSize:9,color:"#4a5280",textTransform:"uppercase",letterSpacing:".5px"}}>{l}</div>
                        </div>
                      ))}
                    </div>
                    <div className="progress"><div className="progress-fill" style={{width:`${mt.length>0?(done/mt.length)*100:0}%`,background:`linear-gradient(90deg,${member.color},${member.color}88)`}}/></div>
                    <div style={{fontSize:10,color:"#4a5280",marginTop:5,textAlign:"right"}}>{mt.length>0?Math.round((done/mt.length)*100):0}% completado</div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* MODALES */}
      {showNewTask&&<NewTaskModal currentUser={currentUser} users={users} onClose={()=>setShowNewTask(false)} onSave={async(form)=>{ const res=await db.insert("tasks",{...form,assigned_by:currentUser.id,status:"pendiente",is_published:currentUser.role!=="gerente"?true:form.is_published??true}); if(Array.isArray(res)&&res[0]){setTasks(p=>[res[0],...p]);} setShowNewTask(false); showToast("Tarea creada ✓"); }}/>}
      {showNewMeeting&&<NewMeetingModal currentUser={currentUser} users={users} onClose={()=>setShowNewMeeting(false)} onSave={async(form)=>{ const res=await db.insert("meetings",{...form,created_by:currentUser.id}); if(Array.isArray(res)&&res[0]){setMeetings(p=>[res[0],...p]);} setShowNewMeeting(false); showToast("Reunión agendada ✓"); }}/>}

      {showVisibility&&<VisibilityModal task={showVisibility} users={users} onClose={()=>setShowVisibility(null)} onSave={saveVisibility}/>}

      {confirmDelete&&(
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setConfirmDelete(null)}>
          <div className="modal" style={{maxWidth:360,textAlign:"center"}}>
            <div style={{fontSize:40,marginBottom:12}}>🗑</div>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:18,marginBottom:8}}>¿Eliminar?</div>
            <div style={{color:"#8892b0",fontSize:14,marginBottom:20}}>"{confirmDelete.name}"<br/>Esta acción no se puede deshacer.</div>
            <div style={{display:"flex",gap:10}}>
              <button className="btn-ghost" style={{flex:1}} onClick={()=>setConfirmDelete(null)}>Cancelar</button>
              <button className="btn-primary" style={{flex:1,background:"linear-gradient(135deg,#e85d4a,#c0392b)"}} onClick={()=>confirmDelete.type==="task"?deleteTask(confirmDelete.id):deleteMeeting(confirmDelete.id)}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {toast&&<div className="toast slide-up" style={{background:toast.type==="error"?"#2a1515":"#151f1a",border:`1px solid ${toast.type==="error"?"#e85d4a":"#48bb78"}`,color:toast.type==="error"?"#e85d4a":"#48bb78"}}>{toast.msg}</div>}
    </div>
  );
}

// ── COMMENT INPUT ─────────────────────────────────────────────────────────
function CommentInput({ onAdd }) {
  const [txt, setTxt] = useState("");
  return (
    <div style={{display:"flex",gap:8,marginTop:10}}>
      <input className="input-field" style={{fontSize:13,padding:"8px 12px"}} placeholder="Escribe una nota o avance..." value={txt} onChange={e=>setTxt(e.target.value)} onKeyDown={e=>e.key==="Enter"&&txt.trim()&&(onAdd(txt.trim()),setTxt(""))} />
      <button className="btn-primary" style={{padding:"8px 14px",fontSize:12,flexShrink:0}} onClick={()=>{if(txt.trim()){onAdd(txt.trim());setTxt("");}}}>Enviar</button>
    </div>
  );
}

// ── VISIBILITY MODAL ──────────────────────────────────────────────────────
function VisibilityModal({ task, users, onClose, onSave }) {
  const [selected, setSelected] = useState(task.visible_to||[]);
  const toggle = id => setSelected(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);
  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{maxWidth:400}}>
        <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:18,marginBottom:6}}>Control de acceso</div>
        <div style={{color:"#4a5280",fontSize:13,marginBottom:16}}>"{task.title}"<br/>Si no seleccionas nadie, todos la pueden ver.</div>
        <div style={{background:"#12151e",borderRadius:10,padding:10,marginBottom:16}}>
          {users.map(u=>(
            <label key={u.id} className="checkbox-row">
              <input type="checkbox" checked={selected.includes(u.id)} onChange={()=>toggle(u.id)} style={{accentColor:u.color}} />
              <div className="avatar-sm" style={{background:u.color+"22",color:u.color}}>{u.avatar}</div>
              <span style={{fontSize:13,flex:1}}>{u.role==="gerente"?"Gerente":u.name}</span>
              <span style={{fontSize:10,color:ROLE_COLOR[u.role]}}>{ROLE_LABEL[u.role]}</span>
            </label>
          ))}
        </div>
        <div style={{display:"flex",gap:10}}>
          <button className="btn-ghost" style={{flex:1}} onClick={onClose}>Cancelar</button>
          <button className="btn-primary" style={{flex:2}} onClick={()=>onSave(task.id,selected)}>Guardar acceso ✓</button>
        </div>
      </div>
    </div>
  );
}

// ── MANAGE USERS ──────────────────────────────────────────────────────────
function ManageUsers({ users, onRefresh, showToast }) {
  const [editing, setEditing] = useState(null);
  const [form, setForm]       = useState({});

  const startEdit = u => { setEditing(u.id); setForm({name:u.name,username:u.username,password:u.password,role:u.role}); };
  const save = async () => {
    await db.update("users", editing, form);
    await onRefresh();
    setEditing(null);
    showToast("Usuario actualizado ✓");
  };

  return (
    <div style={{background:"#1a1d27",border:"1px solid #2d3148",borderRadius:14,padding:20,marginBottom:4}}>
      <div style={{fontSize:12,fontWeight:700,color:"#4a5280",textTransform:"uppercase",letterSpacing:".8px",marginBottom:14}}>🔑 Gestión de usuarios (solo Gerente)</div>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
          <thead>
            <tr style={{borderBottom:"1px solid #2d3148"}}>
              {["Nombre","Usuario","Contraseña","Rol",""].map(h=><th key={h} style={{textAlign:"left",padding:"6px 12px",color:"#4a5280",fontWeight:700,fontSize:10,textTransform:"uppercase",letterSpacing:".5px"}}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {users.map(u=>(
              <tr key={u.id} style={{borderBottom:"1px solid #2d314844"}}>
                {editing===u.id?(
                  <>
                    <td style={{padding:"6px 8px"}}><input className="input-field" style={{padding:"6px 10px",fontSize:12}} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} /></td>
                    <td style={{padding:"6px 8px"}}><input className="input-field" style={{padding:"6px 10px",fontSize:12}} value={form.username} onChange={e=>setForm({...form,username:e.target.value})} /></td>
                    <td style={{padding:"6px 8px"}}><input className="input-field" style={{padding:"6px 10px",fontSize:12}} value={form.password} onChange={e=>setForm({...form,password:e.target.value})} /></td>
                    <td style={{padding:"6px 8px"}}>
                      <select className="input-field" style={{padding:"6px 10px",fontSize:12}} value={form.role} onChange={e=>setForm({...form,role:e.target.value})}>
                        <option value="gerente">Gerente</option>
                        <option value="supervisor">Supervisor</option>
                        <option value="analista">Analista</option>
                      </select>
                    </td>
                    <td style={{padding:"6px 8px"}}>
                      <div style={{display:"flex",gap:6}}>
                        <button className="btn-primary" style={{padding:"5px 12px",fontSize:11}} onClick={save}>✓</button>
                        <button className="btn-ghost" style={{padding:"5px 10px",fontSize:11}} onClick={()=>setEditing(null)}>✕</button>
                      </div>
                    </td>
                  </>
                ):(
                  <>
                    <td style={{padding:"8px 12px"}}><div style={{display:"flex",alignItems:"center",gap:8}}><div className="avatar-sm" style={{background:u.color+"22",color:u.color}}>{u.avatar}</div><span style={{fontWeight:600}}>{u.name}</span></div></td>
                    <td style={{padding:"8px 12px",fontFamily:"monospace",color:"#4a9eed"}}>{u.username}</td>
                    <td style={{padding:"8px 12px",fontFamily:"monospace",color:"#8892b0"}}>{u.password}</td>
                    <td style={{padding:"8px 12px"}}><span className="role-badge" style={{color:ROLE_COLOR[u.role],background:ROLE_COLOR[u.role]+"22"}}>{ROLE_LABEL[u.role]}</span></td>
                    <td style={{padding:"8px 12px"}}><button className="btn-sm" onClick={()=>startEdit(u)}>✏ Editar</button></td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── NEW TASK MODAL ────────────────────────────────────────────────────────
function NewTaskModal({ currentUser, users, onClose, onSave }) {
  const [form, setForm] = useState({ title:"", description:"", assigned_to:users.find(u=>u.role!=="gerente")?.id||1, priority:"media", due_date:"", cartera:"Cartera Vencida", is_published:true });
  const isGerente = currentUser.role==="gerente";
  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:19,marginBottom:20}}>Nueva Tarea</div>
        <div style={{display:"flex",flexDirection:"column",gap:13}}>
          <div><label className="label">Título *</label><input className="input-field" placeholder="¿Qué hay que hacer?" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} /></div>
          <div><label className="label">Descripción</label><textarea className="input-field" rows={3} placeholder="Contexto y expectativas..." value={form.description} onChange={e=>setForm({...form,description:e.target.value})} style={{resize:"vertical"}} /></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div>
              <label className="label">Asignar a</label>
              <select className="input-field" value={form.assigned_to} onChange={e=>setForm({...form,assigned_to:parseInt(e.target.value)})}>
                {users.map(u=><option key={u.id} value={u.id}>{u.role==="gerente"?"Gerente":u.name} — {ROLE_LABEL[u.role]}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Prioridad</label>
              <select className="input-field" value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}>
                {PRIORITIES.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div><label className="label">Fecha límite *</label><input type="date" className="input-field" value={form.due_date} onChange={e=>setForm({...form,due_date:e.target.value})} /></div>
            <div><label className="label">Cartera</label><select className="input-field" value={form.cartera} onChange={e=>setForm({...form,cartera:e.target.value})}>{CARTERAS.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
          </div>
          {isGerente&&(
            <label className="checkbox-row" style={{background:"#12151e",borderRadius:8,padding:"10px 12px"}}>
              <input type="checkbox" checked={form.is_published} onChange={e=>setForm({...form,is_published:e.target.checked})} style={{accentColor:"#e85d4a"}} />
              <span style={{fontSize:13,color:"#e8eaf0"}}>Publicar al equipo (si no, solo la ves tú)</span>
            </label>
          )}
          <div style={{display:"flex",gap:10,marginTop:4}}>
            <button className="btn-ghost" style={{flex:1}} onClick={onClose}>Cancelar</button>
            <button className="btn-primary" style={{flex:2}} onClick={()=>{if(!form.title.trim()||!form.due_date){alert("Completa título y fecha");return;}onSave(form);}}>Crear y Notificar 🔔</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── NEW MEETING MODAL ─────────────────────────────────────────────────────
function NewMeetingModal({ currentUser, users, onClose, onSave }) {
  const [form, setForm] = useState({title:"",date:"",time:"",type:"seguimiento",notes:"",participants:[currentUser.id]});
  const toggle = id => setForm(f=>({...f,participants:f.participants.includes(id)?f.participants.filter(x=>x!==id):[...f.participants,id]}));
  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:19,marginBottom:20}}>Nueva Reunión</div>
        <div style={{display:"flex",flexDirection:"column",gap:13}}>
          <div><label className="label">Título *</label><input className="input-field" placeholder="¿De qué trata?" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} /></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div><label className="label">Fecha *</label><input type="date" className="input-field" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} /></div>
            <div><label className="label">Hora *</label><input type="time" className="input-field" value={form.time} onChange={e=>setForm({...form,time:e.target.value})} /></div>
          </div>
          <div><label className="label">Tipo</label><select className="input-field" value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>{Object.entries(MEET_TYPES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></div>
          <div><label className="label">Agenda</label><textarea className="input-field" rows={2} placeholder="Puntos a tratar..." value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} style={{resize:"vertical"}} /></div>
          <div>
            <label className="label">Participantes ({form.participants.length})</label>
            <div style={{background:"#12151e",borderRadius:10,padding:10,display:"grid",gridTemplateColumns:"1fr 1fr",gap:2}}>
              {users.map(u=>(
                <label key={u.id} className="checkbox-row">
                  <input type="checkbox" checked={form.participants.includes(u.id)} onChange={()=>toggle(u.id)} style={{accentColor:u.color}} />
                  <div className="avatar-sm" style={{background:u.color+"22",color:u.color}}>{u.avatar}</div>
                  <span style={{fontSize:12,flex:1}}>{u.role==="gerente"?"Gerente":u.name.split(" ")[0]}</span>
                  <span style={{fontSize:10,color:ROLE_COLOR[u.role]}}>{ROLE_LABEL[u.role]}</span>
                </label>
              ))}
            </div>
          </div>
          <div style={{display:"flex",gap:10}}>
            <button className="btn-ghost" style={{flex:1}} onClick={onClose}>Cancelar</button>
            <button className="btn-primary" style={{flex:2}} onClick={()=>{if(!form.title.trim()||!form.date||!form.time){alert("Completa los campos requeridos");return;}onSave(form);}}>Agendar y Notificar 🔔</button>
          </div>
        </div>
      </div>
    </div>
  );
}
