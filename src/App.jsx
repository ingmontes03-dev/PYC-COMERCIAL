/*
 * PLANTA OP · Gestión integral de Órdenes de Producción
 * Acceso privado (Supabase Auth: correo + contraseña) · Tema dark neumórfico con acentos neón.
 *
 * Requisitos previos en Supabase: ver auth-rls.sql (perfiles vinculados a auth.users y RLS solo para autenticados).
 * Los usuarios los crea únicamente el administrador en Authentication > Users; la app no permite registro.
 * profiles.id debe ser el UUID del usuario en auth.users.
 * Panel de Control / Permisos (solo Programador): requiere panel-permisos.sql y la Edge Function admin-users.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  LayoutDashboard, ClipboardList, Users, Package, DollarSign, Calculator, Truck,
  ShieldCheck, Factory, AlertTriangle, Plus, Trash2, Lock, CheckCircle2, XCircle,
  LogOut, Wrench, Clock, FileText, Image as ImageIcon, Loader2, LogIn, Activity, Target,
  UserPlus, Code2, SlidersHorizontal, Receipt, Boxes,
} from 'lucide-react';

/* ───────────── Supabase ───────────── */
const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
const SUPA_URL = env.VITE_SUPABASE_URL || 'https://bqpcbslqgvimxscfbhwt.supabase.co';
const SUPA_KEY = env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_kYoU51Sx3mtt-lQfPKzByQ_rqhdvpSD';
const supabase = SUPA_URL && SUPA_KEY ? createClient(SUPA_URL, SUPA_KEY) : null;

/* ───────────── Utilidades ───────────── */
const today = () => new Date().toISOString().slice(0, 10);
const cop = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);
const num = (v) => (isFinite(parseFloat(v)) ? parseFloat(v) : 0);
const daysTo = (d) => (d ? Math.ceil((new Date(d + 'T00:00:00') - new Date(today() + 'T00:00:00')) / 864e5) : null);
const cx = (...a) => a.filter(Boolean).join(' ');
const CATS = { marcacion: 'Marcación', maquila: 'Maquila', empaque: 'Empaque', transporte: 'Transporte' };
const presTotal = (o) => num(o.presupuesto_marcacion) + num(o.presupuesto_maquila) + num(o.presupuesto_empaque) + num(o.presupuesto_transporte);
const opLabel = (rows, id) => rows.find((o) => o.id === id)?.codigo || '—';

function costos(store, op) {
  const f = (c) => store.facturas.rows.filter((x) => x.orden_id === op.id && x.categoria === c).reduce((s, x) => s + num(x.valor), 0);
  const maq = store.maquila.rows.filter((m) => m.orden_id === op.id).reduce((s, m) => s + num(m.horas) * num(m.tarifa), 0);
  const tr = store.gastos.rows.filter((g) => g.orden_id === op.id).reduce((s, g) => s + num(g.valor), 0);
  const c = { marcacion: f('marcacion'), maquila: maq + f('maquila'), empaque: f('empaque'), transporte: tr + f('transporte') };
  c.total = c.marcacion + c.maquila + c.empaque + c.transporte;
  return c;
}

/* ───────────── Hook genérico de tabla Supabase (fetch + CRUD + realtime) ───────────── */
function useTable(table, { orderBy = 'id', ascending = true } = {}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    const { data, error } = await supabase.from(table).select('*').order(orderBy, { ascending });
    if (error) setError(error.message); else { setRows(data || []); setError(null); }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`realtime:${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []); // eslint-disable-line

  const insert = async (row) => {
    const { data, error } = await supabase.from(table).insert(row).select();
    if (error) { setError(error.message); return { error }; }
    setRows((r) => [...r, ...data]);
    return { data };
  };
  const update = async (id, patch) => {
    const { data, error } = await supabase.from(table).update(patch).eq('id', id).select();
    if (error) { setError(error.message); return { error }; }
    setRows((r) => r.map((x) => (x.id === id ? data[0] : x)));
    return { data };
  };
  const remove = async (id) => {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) { setError(error.message); return { error }; }
    setRows((r) => r.filter((x) => x.id !== id));
    return {};
  };
  return { rows, loading, error, insert, update, remove, reload: load };
}

function useStore() {
  const ordenes = useTable('ordenes_produccion', { orderBy: 'id' });
  const inventario = useTable('inventario', { orderBy: 'item' });
  const precios = useTable('configuracion_precios', { orderBy: 'tipo_material' });
  const maquila = useTable('maquila_registros', { orderBy: 'fecha' });
  const facturas = useTable('facturas', { orderBy: 'fecha' });
  const nc = useTable('no_conformidades', { orderBy: 'fecha' });
  const traslados = useTable('traslados', { orderBy: 'fecha' });
  const gastos = useTable('gastos', { orderBy: 'fecha' });
  const consumos = useTable('consumos_insumos', { orderBy: 'fecha' });
  const all = { ordenes, inventario, precios, maquila, facturas, nc, traslados, gastos, consumos };
  const loading = Object.values(all).some((t) => t.loading);
  const errors = Object.entries(all).filter(([, t]) => t.error).map(([k, t]) => `${k}: ${t.error}`);
  return { ...all, loading, errors };
}

/* ───────────── Tema dark neumórfico neón ───────────── */
const THEME = `
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');
:root{--bg:#12181b;--card:#1a2126;--mut:#7f939e;--txt:#e7f2f6;--cy:#00f2fe;--bl:#4facfe;--gr:#00e676;--rd:#ff4d6d;--line:#232d33}
.neo-root{background:radial-gradient(1200px 600px at 10% -10%,#1a2530 0%,transparent 60%),var(--bg);color:var(--txt);font-family:'Manrope',system-ui,sans-serif;min-height:100vh}
.neo{background:linear-gradient(145deg,#1e272d,#171d21);border-radius:22px;box-shadow:9px 9px 20px #0a0e10,-7px -7px 18px #222c33;border:1px solid rgba(255,255,255,.03)}
.neo-in{background:#141a1e;border-radius:12px;box-shadow:inset 4px 4px 9px #0a0e10,inset -3px -3px 8px #1e282e;border:1px solid transparent;color:var(--txt);color-scheme:dark;transition:box-shadow .2s,border-color .2s}
.neo-in:focus{border-color:rgba(0,242,254,.55);box-shadow:inset 4px 4px 9px #0a0e10,inset -3px -3px 8px #1e282e,0 0 14px rgba(0,242,254,.22)}
.neo-in:disabled{opacity:.55;cursor:not-allowed}
.neo-in::placeholder{color:#55666f}
select.neo-in option{background:#1a2126;color:var(--txt)}
.neo-icon{display:inline-grid;place-items:center;width:32px;height:32px;border-radius:50%;background:#141a1e;box-shadow:inset 3px 3px 6px #0a0e10,inset -2px -2px 5px #1f292f;color:var(--cy)}
.mut{color:var(--mut)}
.neo-btn{border-radius:12px;font-weight:700;font-size:.85rem;padding:.55rem .95rem;display:inline-flex;align-items:center;justify-content:center;gap:.4rem;transition:transform .15s,box-shadow .2s,filter .2s;cursor:pointer;border:1px solid transparent}
.neo-btn:disabled{opacity:.4;cursor:not-allowed}
.neo-btn:not(:disabled):active{transform:translateY(1px)}
.btn-pri{background:linear-gradient(135deg,var(--cy),var(--bl));color:#06222b;box-shadow:0 0 16px rgba(0,242,254,.28),4px 4px 10px #0a0e10}
.btn-pri:not(:disabled):hover{filter:brightness(1.08);box-shadow:0 0 22px rgba(0,242,254,.45),4px 4px 10px #0a0e10}
.btn-acc{background:linear-gradient(135deg,#00e676,#00c9a7);color:#032a18;box-shadow:0 0 16px rgba(0,230,118,.25),4px 4px 10px #0a0e10}
.btn-acc:not(:disabled):hover{filter:brightness(1.08);box-shadow:0 0 22px rgba(0,230,118,.42),4px 4px 10px #0a0e10}
.btn-red{background:linear-gradient(135deg,#ff4d6d,#ff2d55);color:#fff;box-shadow:0 0 16px rgba(255,77,109,.28),4px 4px 10px #0a0e10}
.btn-ghost{background:linear-gradient(145deg,#1e272d,#171d21);color:var(--txt);box-shadow:4px 4px 10px #0a0e10,-3px -3px 8px #222c33}
.btn-ghost:not(:disabled):hover{color:var(--cy)}
.pill{display:inline-flex;align-items:center;gap:.3rem;border-radius:999px;padding:.15rem .6rem;font-size:.72rem;font-weight:700;border:1px solid transparent}
.pill-ok{background:rgba(0,230,118,.1);color:var(--gr);border-color:rgba(0,230,118,.35);text-shadow:0 0 8px rgba(0,230,118,.4)}
.pill-bad{background:rgba(255,77,109,.1);color:var(--rd);border-color:rgba(255,77,109,.35)}
.pill-n{background:rgba(79,172,254,.1);color:var(--bl);border-color:rgba(79,172,254,.3)}
.kpi{font-weight:800;letter-spacing:-.02em}
.kpi-cy{color:var(--cy);text-shadow:0 0 16px rgba(0,242,254,.5)}
.kpi-gr{color:var(--gr);text-shadow:0 0 16px rgba(0,230,118,.5)}
.kpi-bl{color:var(--bl);text-shadow:0 0 16px rgba(79,172,254,.5)}
.kpi-rd{color:var(--rd);text-shadow:0 0 16px rgba(255,77,109,.5)}
.bar{height:6px;border-radius:99px;background:#0f1417;box-shadow:inset 1px 1px 3px #06090b;overflow:hidden;margin-top:.6rem}
.bar>i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--bl),var(--cy));box-shadow:0 0 10px rgba(0,242,254,.6)}
.tabs{background:#141a1e;border-radius:16px;box-shadow:inset 4px 4px 9px #0a0e10,inset -3px -3px 8px #1e282e;padding:.35rem}
.tab{display:flex;align-items:center;gap:.4rem;white-space:nowrap;border-radius:12px;padding:.5rem .85rem;font-size:.85rem;font-weight:600;color:var(--mut);transition:color .2s}
.tab:hover{color:var(--txt)}
.tab-on{color:var(--cy);background:linear-gradient(145deg,#1e272d,#171d21);box-shadow:4px 4px 10px #0a0e10,-3px -3px 8px #222c33;text-shadow:0 0 10px rgba(0,242,254,.5)}
.glow-t{color:var(--cy);text-shadow:0 0 18px rgba(0,242,254,.55)}
.tbl th{color:var(--mut);font-weight:600;font-size:.72rem;text-transform:uppercase;letter-spacing:.06em}
.tbl tbody tr{border-top:1px solid var(--line)}
.tbl tbody tr:hover{background:rgba(0,242,254,.03)}
.alert-pulse{animation:pulse-r 1.2s ease-in-out infinite}
@keyframes pulse-r{0%,100%{box-shadow:0 0 0 rgba(255,77,109,0);opacity:1}50%{box-shadow:0 0 26px rgba(255,77,109,.7);opacity:.82}}
a.lnk{color:var(--cy);text-decoration:underline;text-underline-offset:3px}
.sw{position:relative;flex:none;width:46px;height:26px;border-radius:99px;background:#141a1e;box-shadow:inset 3px 3px 6px #0a0e10,inset -2px -2px 5px #1e282e;border:1px solid transparent;cursor:pointer;transition:border-color .2s}
.sw>i{position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:linear-gradient(145deg,#2c363d,#1c242a);box-shadow:2px 2px 5px #0a0e10;transition:transform .2s,background .2s,box-shadow .2s}
.sw-on{border-color:rgba(0,242,254,.4)}
.sw-on>i{transform:translateX(20px);background:linear-gradient(135deg,#00f2fe,#4facfe);box-shadow:0 0 12px rgba(0,242,254,.75)}
.sw:disabled{opacity:.45;cursor:not-allowed}
`;
const Shell = ({ children }) => (<div className="neo-root"><style>{THEME}</style>{children}</div>);

/* ───────────── UI kit ───────────── */
const ic = 'neo-in w-full px-3 py-2 text-sm outline-none';
const Card = ({ title, icon: I, right, children, className }) => (
  <section className={cx('neo', className)}>
    {title && (
      <header className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
        <h3 className="flex items-center gap-2.5 font-bold tracking-wide">{I && <span className="neo-icon"><I size={16} /></span>}{title}</h3>{right}
      </header>
    )}
    <div className="p-5">{children}</div>
  </section>
);
const Btn = ({ children, onClick, v = 'pri', disabled, className, type = 'button' }) => (
  <button type={type} onClick={onClick} disabled={disabled}
    className={cx('neo-btn', v === 'pri' && 'btn-pri', v === 'acc' && 'btn-acc', v === 'red' && 'btn-red', v === 'ghost' && 'btn-ghost', className)}>
    {children}
  </button>
);
const Field = ({ label, children }) => <label className="mut block text-xs font-semibold tracking-wide">{label}<div className="mt-1.5 font-normal">{children}</div></label>;
const Inp = ({ label, ...p }) => <Field label={label}><input className={ic} {...p} /></Field>;
const Sel = ({ label, children, ...p }) => <Field label={label}><select className={ic} {...p}>{children}</select></Field>;
const Area = ({ label, ...p }) => <Field label={label}><textarea rows={2} className={ic} {...p} /></Field>;
const Table = ({ heads, children, empty }) => (
  <div className="overflow-x-auto">
    <table className="tbl w-full text-sm">
      <thead><tr className="text-left">{heads.map((h) => <th key={h} className="whitespace-nowrap py-2 pr-4">{h}</th>)}</tr></thead>
      <tbody>{children}</tbody>
    </table>
    {React.Children.count(children) === 0 && <p className="mut py-5 text-center text-sm">{empty || 'Sin registros todavía.'}</p>}
  </div>
);
const Pill = ({ ok, children }) => <span className={cx('pill', ok === true && 'pill-ok', ok === false && 'pill-bad', ok == null && 'pill-n')}>{children}</span>;
const OpSel = ({ ordenes, value, onChange, onlyOpen }) => (
  <Sel label="Orden de producción" value={value} onChange={(e) => onChange(e.target.value)}>
    <option value="">Seleccione una OP</option>
    {ordenes.filter((o) => !onlyOpen || o.estado === 'Abierta').map((o) => <option key={o.id} value={o.id}>{o.codigo || `OP #${o.id}`} · {o.cliente}</option>)}
  </Sel>
);
const useForm = (init) => {
  const [f, setF] = useState(init);
  return [f, (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value })), () => setF(init), setF];
};
const ErrBanner = ({ errors }) => !errors.length ? null : (
  <div className="neo mb-4 flex items-start gap-2 p-3 text-sm" style={{ borderColor: 'rgba(255,77,109,.4)', color: '#ff8fa3' }}>
    <AlertTriangle size={18} className="mt-0.5 shrink-0" /><div><b>Error de Supabase:</b> {errors.join(' · ')}</div>
  </div>
);

/* ───────────── Dashboard + KPIs ───────────── */
function Dashboard({ store }) {
  const rows = store.ordenes.rows.map((o) => {
    const ncCount = store.nc.rows.filter((n) => n.orden_id === o.id).length;
    const cerr = o.estado === 'Cerrada';
    const d = daysTo(o.fecha_prometida);
    return { o, ncCount, cal: ncCount === 0 ? 100 : 0, otif: cerr ? (o.fecha_cierre && o.fecha_prometida && o.fecha_cierre <= o.fecha_prometida ? 100 : 0) : null, d };
  });
  const cerradas = rows.filter((r) => r.otif !== null);
  const avg = (a) => (a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : null);
  const low = store.inventario.rows.filter((i) => num(i.cantidad) < num(i.minimo));
  const calAvg = avg(rows.map((r) => r.cal)); const otifAvg = avg(cerradas.map((r) => r.otif));
  const Kpi = ({ label, val, sub, icon: I, tone = 'cy', pct }) => (
    <div className="neo p-5">
      <div className="flex items-start justify-between gap-2"><p className="mut text-xs font-semibold uppercase tracking-wider">{label}</p><span className="neo-icon"><I size={16} /></span></div>
      <p className={cx('kpi mt-3 text-3xl', `kpi-${tone}`)}>{val}</p>
      <p className="mut mt-1 text-xs">{sub}</p>
      {pct != null && <div className="bar"><i style={{ width: `${pct}%` }} /></div>}
    </div>
  );
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi icon={Activity} tone="bl" label="OPs abiertas" val={rows.filter((r) => r.o.estado === 'Abierta').length} sub={`${cerradas.length} cerradas`} />
        <Kpi icon={ShieldCheck} tone="gr" label="Calidad (cero defectos)" val={calAvg === null ? '—' : calAvg + '%'} sub="Sobre todas las OPs" pct={calAvg} />
        <Kpi icon={Target} tone="cy" label="Entrega a tiempo (OTIF)" val={otifAvg === null ? '—' : otifAvg + '%'} sub="Sobre OPs cerradas" pct={otifAvg} />
        <Kpi icon={Package} tone={low.length ? 'rd' : 'gr'} label="Insumos en stock bajo" val={low.length} sub={low.map((i) => i.item).slice(0, 2).join(', ') || 'Todo en orden'} />
      </div>
      <Card title="Indicadores por orden de producción" icon={LayoutDashboard}>
        <Table heads={['OP', 'Cliente', 'Entrega pactada', 'Días', 'Calidad', 'Entrega (OTIF)', 'Estado']}>
          {rows.map(({ o, ncCount, cal, otif, d }) => (
            <tr key={o.id}>
              <td className="py-2.5 pr-4 font-bold">{o.codigo || `OP #${o.id}`}</td><td className="pr-4">{o.cliente}</td><td className="pr-4">{o.fecha_prometida || '—'}</td>
              <td className="pr-4" style={o.estado === 'Abierta' && d !== null && d <= 2 ? { color: '#ff4d6d', fontWeight: 800 } : undefined}>{o.estado === 'Abierta' ? (d ?? '—') : '—'}</td>
              <td className="pr-4">{cal === 100 ? <Pill ok>🟢 100% · Aprobado</Pill> : <Pill ok={false}>🔴 0% · En revisión ({ncCount})</Pill>}</td>
              <td className="pr-4">{otif === null ? <Pill>Pendiente de cierre</Pill> : otif === 100 ? <Pill ok>🟢 100% · A tiempo</Pill> : <Pill ok={false}>🔴 0% · Atrasado</Pill>}</td>
              <td><Pill ok={o.estado === 'Cerrada' ? true : null}>{o.estado}</Pill></td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

/* ───────────── Órdenes de producción, montajes y ficha técnica ───────────── */
function Ops({ store, can, perfil }) {
  const [sel, setSel] = useState('');
  const [err, setErr] = useState('');
  const [f, set, reset] = useForm({ numero_op: '', cliente: '', producto: '', cantidad: '', fecha_prometida: today(), marcacion: '', maquila: '', empaque: '', transporte: '', margen: 30 });
  const crear = async () => {
    if (!can) return;
    const numero = f.numero_op.trim();
    if (!numero) return setErr('El Número de OP Comercial es obligatorio (ej: 1462).');
    if (store.ordenes.rows.some((o) => String(o.numero_op ?? '').trim() === numero)) return setErr(`Ya existe una OP con el número comercial ${numero}.`);
    if (!f.cliente || !f.producto) return setErr('Complete el cliente y el producto.');
    setErr('');
    const codigo = 'OP-' + String(store.ordenes.rows.length + 1).padStart(3, '0');
    const { data, error } = await store.ordenes.insert({
      numero_op: numero, codigo, cliente: f.cliente, producto: f.producto, cantidad: num(f.cantidad), estado: 'Abierta',
      fecha_prometida: f.fecha_prometida, presupuesto_marcacion: num(f.marcacion), presupuesto_maquila: num(f.maquila),
      presupuesto_empaque: num(f.empaque), presupuesto_transporte: num(f.transporte), presupuesto_aprobado: false,
      margen: num(f.margen), creado_por: perfil?.id ?? null,
    });
    if (!error) { setSel(data[0].id); reset(); }
  };
  const op = store.ordenes.rows.find((o) => o.id === sel);
  return (
    <div className="space-y-5">
      <Card title="Nueva orden de producción" icon={Plus}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Inp label="Número de OP Comercial *" placeholder="Ej: 1462" aria-required="true" value={f.numero_op} onChange={(e) => { set('numero_op')(e); setErr(''); }} />
          <Inp label="Cliente" value={f.cliente} onChange={set('cliente')} />
          <Inp label="Producto" value={f.producto} onChange={set('producto')} />
          <Inp label="Cantidad" type="number" value={f.cantidad} onChange={set('cantidad')} />
          <Inp label="Fecha prometida de entrega" type="date" value={f.fecha_prometida} onChange={set('fecha_prometida')} />
          {Object.entries(CATS).map(([k, l]) => <Inp key={k} label={`Presupuesto ${l.toLowerCase()} (COP)`} type="number" value={f[k]} onChange={set(k)} />)}
          <Inp label="Margen de utilidad (%)" type="number" value={f.margen} onChange={set('margen')} />
          <div className="flex items-end"><Btn onClick={crear} disabled={!can}><Plus size={15} />Crear OP</Btn></div>
        </div>
        {err && <p role="alert" className="mt-3 text-sm" style={{ color: '#ff8fa3' }}>{err}</p>}
        {!can && <p className="mut mt-3 text-xs">Solo el Admin / Líder de planta crea nuevas OPs.</p>}
      </Card>
      <div className="flex flex-wrap gap-3">
        {store.ordenes.rows.map((o) => (
          <button key={o.id} onClick={() => setSel(o.id)} className={cx('neo-btn', sel === o.id ? 'btn-pri' : 'btn-ghost')}>
            {o.codigo || `OP #${o.id}`} · {o.cliente} {o.estado === 'Cerrada' && '🔒'}
          </button>
        ))}
      </div>
      {op && <OpDetail key={op.id} op={op} store={store} can={can} />}
    </div>
  );
}

function OpDetail({ op, store, can }) {
  const patch = (p) => store.ordenes.update(op.id, p);
  const fp = (k) => (e) => patch({ [k]: e.target.value });
  const cerr = op.estado === 'Cerrada';
  const ro = !can || cerr;
  const isPdf = /\.pdf(\?|$)/i.test(op.link_diseno || '');
  const cerrar = () => {
    if (!can) return;
    if (window.confirm(`¿Cerrar y finalizar ${op.codigo}? Esta acción registra la fecha real de cierre.`)) patch({ estado: 'Cerrada', fecha_cierre: today() });
  };
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title={`${op.codigo || `OP #${op.id}`} · ${op.producto || ''}`} icon={ClipboardList}
        right={cerr ? <Pill ok>Cerrada el {op.fecha_cierre}</Pill> : can
          ? <Btn v="acc" onClick={cerrar}><CheckCircle2 size={15} />Cerrar y finalizar OP</Btn>
          : <Pill><Lock size={12} />Solo el líder cierra</Pill>}>
        <div className="grid grid-cols-2 gap-4">
          <Inp label="Cliente" value={op.cliente || ''} disabled={ro} onChange={fp('cliente')} />
          <Inp label="Cantidad" type="number" value={op.cantidad || 0} disabled={ro} onChange={(e) => patch({ cantidad: num(e.target.value) })} />
          <Inp label="Fecha prometida" type="date" value={op.fecha_prometida || ''} disabled={ro} onChange={fp('fecha_prometida')} />
          <Inp label="Margen de utilidad (%)" type="number" value={op.margen ?? 30} disabled={ro} onChange={(e) => patch({ margen: num(e.target.value) })} />
          {Object.entries(CATS).map(([k, l]) => <Inp key={k} label={`Presupuesto ${l.toLowerCase()}`} type="number" value={op[`presupuesto_${k}`] || 0} disabled={ro} onChange={(e) => patch({ [`presupuesto_${k}`]: num(e.target.value) })} />)}
          <div className="col-span-2"><Area label="Notas" value={op.notas || ''} disabled={ro} onChange={fp('notas')} /></div>
        </div>
        <div className="neo-in mt-4 flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
          <span>Presupuesto total: <b className="glow-t">{cop(presTotal(op))}</b></span>
          <Btn v={op.presupuesto_aprobado ? 'ghost' : 'acc'} disabled={ro} onClick={() => patch({ presupuesto_aprobado: !op.presupuesto_aprobado })}>
            {op.presupuesto_aprobado ? '✔ Aprobado (revocar)' : 'Aprobar presupuesto'}
          </Btn>
        </div>
      </Card>
      <Card title="Montaje del producto" icon={ImageIcon}>
        <Inp label="URL de la imagen o PDF del plano, boceto o plantilla (Drive, Canva…)" placeholder="https://" value={op.link_diseno || ''} disabled={ro} onChange={fp('link_diseno')} />
        <div className="neo-in mt-4 flex min-h-[190px] items-center justify-center overflow-hidden">
          {!op.link_diseno ? <p className="mut text-sm">Pegue un enlace para ver la vista previa.</p>
            : isPdf ? <iframe title="Montaje PDF" src={op.link_diseno} className="h-72 w-full" />
            : <img src={op.link_diseno} alt={`Montaje ${op.codigo}`} className="max-h-72 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
        </div>
        {op.link_diseno && <a href={op.link_diseno} target="_blank" rel="noreferrer" className="lnk mt-3 inline-block text-sm">Abrir montaje en una pestaña nueva</a>}
        <p className="mut mt-2 text-xs">Los enlaces de Drive o Canva deben tener acceso público de lectura y apuntar directo al archivo para mostrarse aquí.</p>
      </Card>
      <Card title="Ficha técnica de especificaciones" icon={FileText} className="lg:col-span-2">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2"><Area label="Ubicación exacta de la marcación (distancia, centrado, posición)" value={op.ficha_ubicacion || ''} disabled={ro} onChange={fp('ficha_ubicacion')} /></div>
          <Inp label="Temperatura (°C)" value={op.ficha_temperatura || ''} disabled={ro} onChange={fp('ficha_temperatura')} />
          <Inp label="Tiempo (s)" value={op.ficha_tiempo || ''} disabled={ro} onChange={fp('ficha_tiempo')} />
          <Inp label="Presión" value={op.ficha_presion || ''} disabled={ro} onChange={fp('ficha_presion')} />
          <div className="sm:col-span-3"><Area label="Insumos específicos requeridos" value={op.ficha_insumos || ''} disabled={ro} onChange={fp('ficha_insumos')} /></div>
          <div className="sm:col-span-4"><Area label="Cuidados especiales y restricciones de manipulación" value={op.ficha_cuidados || ''} disabled={ro} onChange={fp('ficha_cuidados')} /></div>
        </div>
      </Card>
    </div>
  );
}

/* ───────────── Maquila diaria ───────────── */
function Maquila({ store }) {
  const [f, set, reset] = useForm({ orden_id: '', operario: '', fecha: today(), horas: '', tarifa: '' });
  const add = async () => {
    if (!f.orden_id || !f.operario.trim() || num(f.horas) <= 0) return;
    const { error } = await store.maquila.insert({ orden_id: num(f.orden_id), operario: f.operario.trim(), fecha: f.fecha, horas: num(f.horas), tarifa: num(f.tarifa) });
    if (!error) reset();
  };
  const opsConMaquila = store.ordenes.rows.filter((o) => store.maquila.rows.some((m) => m.orden_id === o.id));
  return (
    <div className="space-y-5">
      <Card title="Registro diario de maquila" icon={Users}>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <OpSel ordenes={store.ordenes.rows} value={f.orden_id} onChange={(v) => set('orden_id')({ target: { value: v } })} onlyOpen />
          <Inp label="Operario" value={f.operario} onChange={set('operario')} />
          <Inp label="Fecha" type="date" value={f.fecha} onChange={set('fecha')} />
          <Inp label="Horas" type="number" step="0.25" value={f.horas} onChange={set('horas')} />
          <Inp label="Tarifa por hora (COP)" type="number" value={f.tarifa} onChange={set('tarifa')} />
          <div className="flex items-end"><Btn onClick={add}><Plus size={15} />Registrar</Btn></div>
        </div>
      </Card>
      {opsConMaquila.map((o) => {
        const rows = store.maquila.rows.filter((m) => m.orden_id === o.id);
        const dias = {}; rows.forEach((m) => { dias[m.fecha] = (dias[m.fecha] || 0) + m.horas * m.tarifa; });
        return (
          <Card key={o.id} title={`${o.codigo || `OP #${o.id}`} · gasto acumulado ${cop(rows.reduce((s, m) => s + m.horas * m.tarifa, 0))}`} icon={Clock}>
            <div className="grid gap-6 lg:grid-cols-2">
              <Table heads={['Fecha', 'Operario', 'Horas', 'Tarifa', 'Subtotal', '']}>
                {rows.map((m) => (
                  <tr key={m.id}><td className="py-2 pr-4">{m.fecha}</td><td className="pr-4">{m.operario}</td><td className="pr-4">{m.horas}</td><td className="pr-4">{cop(m.tarifa)}</td><td className="pr-4">{cop(m.horas * m.tarifa)}</td>
                    <td><button aria-label="Eliminar registro" onClick={() => store.maquila.remove(m.id)}><Trash2 size={14} className="mut hover:text-[#ff4d6d]" /></button></td></tr>
                ))}
              </Table>
              <Table heads={['Día', 'Gasto del día']}>
                {Object.entries(dias).sort().map(([d, v]) => <tr key={d}><td className="py-2 pr-4">{d}</td><td>{cop(v)}</td></tr>)}
              </Table>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/* ───────────── Nómina de maquila (tabla dinámica por operario) ───────────── */
function Nomina({ store }) {
  const [desde, setDesde] = useState(''); const [hasta, setHasta] = useState(''); const [open, setOpen] = useState('');
  const grupos = useMemo(() => {
    const g = {};
    store.maquila.rows.filter((m) => (!desde || m.fecha >= desde) && (!hasta || m.fecha <= hasta)).forEach((m) => {
      const k = m.operario.toLowerCase();
      const x = (g[k] = g[k] || { nombre: m.operario, horas: 0, monto: 0, ops: new Set(), dias: {} });
      x.horas += m.horas; x.monto += m.horas * m.tarifa; x.ops.add(m.orden_id);
      const d = (x.dias[m.fecha] = x.dias[m.fecha] || { horas: 0, monto: 0, ops: new Set() });
      d.horas += m.horas; d.monto += m.horas * m.tarifa; d.ops.add(m.orden_id);
    });
    return Object.entries(g).sort((a, b) => a[1].nombre.localeCompare(b[1].nombre));
  }, [store.maquila.rows, desde, hasta]);
  const total = grupos.reduce((s, [, x]) => s + x.monto, 0);
  return (
    <Card title="Liquidación por operario" icon={DollarSign} right={<b className="glow-t text-sm">Total a pagar: {cop(total)}</b>}>
      <div className="mb-4 grid max-w-md grid-cols-2 gap-4"><Inp label="Desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /><Inp label="Hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
      <Table heads={['Operario', 'Horas trabajadas', 'OPs intervenidas', 'Monto a pagar', '']} empty="No hay registros de maquila en el rango.">
        {grupos.map(([k, x]) => (
          <React.Fragment key={k}>
            <tr><td className="py-2.5 pr-4 font-bold">{x.nombre}</td><td className="pr-4">{x.horas}</td><td className="pr-4">{[...x.ops].map((i) => opLabel(store.ordenes.rows, i)).join(', ')}</td><td className="pr-4 font-bold" style={{ color: '#00e676' }}>{cop(x.monto)}</td>
              <td><Btn v="ghost" onClick={() => setOpen(open === k ? '' : k)}>{open === k ? 'Ocultar' : 'Ver desglose diario'}</Btn></td></tr>
            {open === k && Object.entries(x.dias).sort().map(([d, v]) => (
              <tr key={d} className="mut"><td className="py-2 pl-4 pr-4">{d}</td><td className="pr-4">{v.horas}</td><td className="pr-4">{[...v.ops].map((i) => opLabel(store.ordenes.rows, i)).join(', ')}</td><td className="pr-4">{cop(v.monto)}</td><td /></tr>
            ))}
          </React.Fragment>
        ))}
      </Table>
    </Card>
  );
}

/* ───────────── Inventario y descuento automático ───────────── */
function Inventario({ store, canEdit }) {
  const [f, set, reset] = useForm({ item: '', unidad: 'und', cantidad: '', minimo: '' });
  const add = async () => { if (!f.item) return; const { error } = await store.inventario.insert({ item: f.item, unidad: f.unidad, cantidad: num(f.cantidad), minimo: num(f.minimo) }); if (!error) reset(); };
  const low = store.inventario.rows.filter((i) => num(i.cantidad) < num(i.minimo));
  return (
    <div className="space-y-5">
      {low.length > 0 && (
        <div className="neo flex items-start gap-2 p-4 text-sm" style={{ borderColor: 'rgba(255,77,109,.4)', color: '#ff8fa3' }}>
          <AlertTriangle size={18} className="mt-0.5 shrink-0" /><span><b>Stock bajo:</b> {low.map((i) => `${i.item} (${i.cantidad} ${i.unidad}, mínimo ${i.minimo})`).join(' · ')}</span>
        </div>
      )}
      <Card title="Catálogo de insumos" icon={Package}>
        <Table heads={['Insumo', 'Unidad', 'Stock actual', 'Stock mínimo', 'Estado', '']}>
          {store.inventario.rows.map((i) => (
            <tr key={i.id}>
              <td className="py-2 pr-4 font-semibold">{i.item}</td><td className="pr-4">{i.unidad}</td>
              <td className="pr-4"><input className="neo-in w-24 px-2.5 py-1.5 text-sm outline-none" type="number" disabled={!canEdit} value={i.cantidad} onChange={(e) => store.inventario.update(i.id, { cantidad: num(e.target.value) })} /></td>
              <td className="pr-4"><input className="neo-in w-24 px-2.5 py-1.5 text-sm outline-none" type="number" disabled={!canEdit} value={i.minimo} onChange={(e) => store.inventario.update(i.id, { minimo: num(e.target.value) })} /></td>
              <td className="pr-4">{num(i.cantidad) < num(i.minimo) ? <Pill ok={false}>Stock bajo</Pill> : <Pill ok>Suficiente</Pill>}</td>
              <td>{canEdit && <button aria-label="Eliminar insumo" onClick={() => store.inventario.remove(i.id)}><Trash2 size={14} className="mut hover:text-[#ff4d6d]" /></button>}</td>
            </tr>
          ))}
        </Table>
        {canEdit && (
          <div className="mt-5 grid gap-4 sm:grid-cols-5">
            <Inp label="Nuevo insumo" value={f.item} onChange={set('item')} /><Inp label="Unidad de medida" value={f.unidad} onChange={set('unidad')} />
            <Inp label="Stock inicial" type="number" value={f.cantidad} onChange={set('cantidad')} /><Inp label="Stock mínimo" type="number" value={f.minimo} onChange={set('minimo')} />
            <div className="flex items-end"><Btn onClick={add}><Plus size={15} />Agregar</Btn></div>
          </div>
        )}
      </Card>
    </div>
  );
}

function Empaque({ store, role }) {
  const [ordenId, setOp] = useState(''); const [cajas, setCajas] = useState(''); const [porCaja, setPorCaja] = useState('');
  const [q, setQ] = useState({}); const [msg, setMsg] = useState(null);
  const confirmar = async () => {
    if (!ordenId) return setMsg({ e: true, t: 'Seleccione una OP.' });
    const usados = store.inventario.rows.filter((i) => num(q[i.id]) > 0);
    if (!usados.length) return setMsg({ e: true, t: 'Ingrese al menos un insumo consumido.' });
    const falta = usados.find((i) => num(q[i.id]) > num(i.cantidad));
    if (falta) return setMsg({ e: true, t: `Stock insuficiente de ${falta.item}: hay ${falta.cantidad} ${falta.unidad}.` });
    for (const i of usados) {
      await store.inventario.update(i.id, { cantidad: num(i.cantidad) - num(q[i.id]) });
      await store.consumos.insert({ orden_id: num(ordenId), insumo_id: i.id, cantidad: num(q[i.id]), fecha: today(), rol: role });
    }
    if (num(cajas) > 0) await store.ordenes.update(num(ordenId), { empaque_cajas: num(cajas), empaque_por_caja: num(porCaja) });
    setQ({}); setMsg({ e: false, t: 'Insumos descontados del inventario.' });
  };
  const op = store.ordenes.rows.find((o) => o.id === num(ordenId));
  return (
    <Card title="Empaque y descuento de insumos" icon={Package}>
      <div className="grid gap-4 sm:grid-cols-3">
        <OpSel ordenes={store.ordenes.rows} value={ordenId} onChange={setOp} onlyOpen />
        <Inp label="Cajas empacadas" type="number" value={cajas} onChange={(e) => setCajas(e.target.value)} />
        <Inp label="Unidades por caja" type="number" value={porCaja} onChange={(e) => setPorCaja(e.target.value)} />
      </div>
      {op && op.empaque_cajas > 0 && <p className="mut mt-2 text-xs">Último desglose: {op.empaque_cajas} cajas × {op.empaque_por_caja} und.</p>}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {store.inventario.rows.map((i) => <Inp key={i.id} label={`${i.item} (stock ${i.cantidad} ${i.unidad})`} type="number" min="0" value={q[i.id] || ''} onChange={(e) => setQ({ ...q, [i.id]: e.target.value })} />)}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3"><Btn v="acc" onClick={confirmar}>Descontar insumos</Btn>{msg && <span className="text-sm" style={{ color: msg.e ? '#ff8fa3' : '#00e676' }}>{msg.t}</span>}</div>
    </Card>
  );
}

/* ───────────── Calidad ───────────── */
function Calidad({ store, role, part }) {
  const [f, set, reset] = useForm({ orden_id: '', tipo: 'Defecto de marcación', operario: '', descripcion: '' });
  const add = async () => { if (!f.orden_id || !f.descripcion) return; const { error } = await store.nc.insert({ orden_id: num(f.orden_id), tipo: f.tipo, operario: f.operario, descripcion: f.descripcion, fecha: today() }); if (!error) reset(); };
  return (
    <div className="space-y-5">
      {part !== 'consumos' && (
      <Card title="Reporte de no conformidades" icon={ShieldCheck}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <OpSel ordenes={store.ordenes.rows} value={f.orden_id} onChange={(v) => set('orden_id')({ target: { value: v } })} onlyOpen />
          <Sel label="Tipo" value={f.tipo} onChange={set('tipo')}>{['Defecto de marcación', 'Defecto de confección', 'Mancha o daño', 'Talla o color errado', 'Otro'].map((t) => <option key={t}>{t}</option>)}</Sel>
          <Inp label="Operario involucrado" value={f.operario} onChange={set('operario')} />
          <div className="sm:col-span-2 lg:col-span-3"><Area label="Descripción" value={f.descripcion} onChange={set('descripcion')} /></div>
          <div className="flex items-end"><Btn v="red" onClick={add}><XCircle size={15} />Reportar</Btn></div>
        </div>
        <p className="mut mt-3 text-xs">Un solo reporte lleva la calidad de la OP a 0% (en revisión).</p>
        <div className="mt-4">
          <Table heads={['Fecha', 'OP', 'Tipo', 'Operario', 'Descripción', '']}>
            {store.nc.rows.map((n) => (
              <tr key={n.id}><td className="py-2 pr-4">{n.fecha}</td><td className="pr-4">{opLabel(store.ordenes.rows, n.orden_id)}</td><td className="pr-4">{n.tipo}</td><td className="pr-4">{n.operario || '—'}</td><td className="pr-4">{n.descripcion}</td>
                <td><button aria-label="Eliminar reporte" onClick={() => store.nc.remove(n.id)}><Trash2 size={14} className="mut hover:text-[#ff4d6d]" /></button></td></tr>
            ))}
          </Table>
        </div>
      </Card>)}
      {part !== 'calidad' && <Empaque store={store} role={role} />}
    </div>
  );
}

/* ───────────── Logística ───────────── */
function Logistica({ store, part }) {
  const [t, setT, resetT] = useForm({ orden_id: '', origen: '', destino: '', comprobante_url: '', fecha: today() });
  const [g, setG, resetG] = useForm({ orden_id: '', concepto: 'Flete', valor: '', fecha: today() });
  return (
    <div className="space-y-5">
      {part !== 'gastos' && (
      <Card title="Registrar traslado" icon={Truck}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <OpSel ordenes={store.ordenes.rows} value={t.orden_id} onChange={(v) => setT('orden_id')({ target: { value: v } })} onlyOpen />
          <Inp label="Origen (taller o cliente)" value={t.origen} onChange={setT('origen')} /><Inp label="Destino" value={t.destino} onChange={setT('destino')} />
          <Inp label="URL del comprobante de entrega" placeholder="https://" value={t.comprobante_url} onChange={setT('comprobante_url')} />
          <Inp label="Fecha" type="date" value={t.fecha} onChange={setT('fecha')} />
          <div className="flex items-end"><Btn onClick={async () => { if (t.orden_id && t.origen && t.destino) { const { error } = await store.traslados.insert({ ...t, orden_id: num(t.orden_id) }); if (!error) resetT(); } }}><Plus size={15} />Registrar traslado</Btn></div>
        </div>
        <div className="mt-4"><Table heads={['Fecha', 'OP', 'Origen', 'Destino', 'Comprobante']}>
          {store.traslados.rows.map((x) => <tr key={x.id}><td className="py-2 pr-4">{x.fecha}</td><td className="pr-4">{opLabel(store.ordenes.rows, x.orden_id)}</td><td className="pr-4">{x.origen}</td><td className="pr-4">{x.destino}</td>
            <td>{x.comprobante_url ? <a className="lnk" href={x.comprobante_url} target="_blank" rel="noreferrer">Ver</a> : '—'}</td></tr>)}
        </Table></div>
      </Card>)}
      {part !== 'traslados' && (
      <Card title="Gastos de fletes y transporte" icon={DollarSign}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <OpSel ordenes={store.ordenes.rows} value={g.orden_id} onChange={(v) => setG('orden_id')({ target: { value: v } })} onlyOpen />
          <Sel label="Concepto" value={g.concepto} onChange={setG('concepto')}>{['Flete', 'Taxi o moto', 'Peaje', 'Parqueadero', 'Otro'].map((c) => <option key={c}>{c}</option>)}</Sel>
          <Inp label="Valor (COP)" type="number" value={g.valor} onChange={setG('valor')} /><Inp label="Fecha" type="date" value={g.fecha} onChange={setG('fecha')} />
          <div className="flex items-end"><Btn onClick={async () => { if (g.orden_id && num(g.valor) > 0) { const { error } = await store.gastos.insert({ ...g, orden_id: num(g.orden_id), valor: num(g.valor) }); if (!error) resetG(); } }}><Plus size={15} />Registrar gasto</Btn></div>
        </div>
        <div className="mt-4"><Table heads={['Fecha', 'OP', 'Concepto', 'Valor']}>
          {store.gastos.rows.map((x) => <tr key={x.id}><td className="py-2 pr-4">{x.fecha}</td><td className="pr-4">{opLabel(store.ordenes.rows, x.orden_id)}</td><td className="pr-4">{x.concepto}</td><td>{cop(x.valor)}</td></tr>)}
        </Table></div>
      </Card>)}
    </div>
  );
}

/* ───────────── Portal de taller externo ───────────── */
function Taller({ store }) {
  const [f, set, reset] = useForm({ orden_id: '', tecnica: 'DTF', proveedor: '', numero: '', valor: '', fecha: today() });
  const add = async () => {
    if (!f.orden_id || !f.numero || !f.proveedor || num(f.valor) <= 0) return;
    const { error } = await store.facturas.insert({ ...f, orden_id: num(f.orden_id), categoria: 'marcacion', valor: num(f.valor) });
    if (!error) reset();
  };
  return (
    <Card title="Costo real de marcación y factura emitida" icon={Wrench}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <OpSel ordenes={store.ordenes.rows} value={f.orden_id} onChange={(v) => set('orden_id')({ target: { value: v } })} onlyOpen />
        <Sel label="Técnica" value={f.tecnica} onChange={set('tecnica')}>{['DTF', 'Tampografía', 'UV', 'Vinilo'].map((t) => <option key={t}>{t}</option>)}</Sel>
        <Inp label="Taller o proveedor" value={f.proveedor} onChange={set('proveedor')} /><Inp label="Número de factura" value={f.numero} onChange={set('numero')} />
        <Inp label="Costo real (COP)" type="number" value={f.valor} onChange={set('valor')} /><Inp label="Fecha de factura" type="date" value={f.fecha} onChange={set('fecha')} />
      </div>
      <div className="mt-4"><Btn onClick={add}><Plus size={15} />Radicar factura</Btn></div>
      <div className="mt-5"><Table heads={['Fecha', 'OP', 'Técnica', 'Proveedor', 'Factura', 'Valor']}>
        {store.facturas.rows.filter((x) => x.categoria === 'marcacion').map((x) => <tr key={x.id}><td className="py-2 pr-4">{x.fecha}</td><td className="pr-4">{opLabel(store.ordenes.rows, x.orden_id)}</td><td className="pr-4">{x.tecnica}</td><td className="pr-4">{x.proveedor}</td><td className="pr-4">{x.numero}</td><td>{cop(x.valor)}</td></tr>)}
      </Table></div>
    </Card>
  );
}

/* ───────────── Finanzas ───────────── */
function Finanzas({ store }) {
  const [f, set, reset] = useForm({ orden_id: '', categoria: 'marcacion', proveedor: '', numero: '', valor: '', fecha: today() });
  const add = async () => { if (!f.orden_id || !f.numero || num(f.valor) <= 0) return; const { error } = await store.facturas.insert({ ...f, orden_id: num(f.orden_id), valor: num(f.valor) }); if (!error) reset(); };
  return (
    <div className="space-y-5">
      <Card title="Comparativo: presupuesto, costo real y precio sugerido" icon={DollarSign}>
        <Table heads={['OP', 'Categoría', 'Presupuesto', 'Costo real', 'Diferencia']}>
          {store.ordenes.rows.flatMap((o) => {
            const c = costos(store, o);
            const filas = Object.entries(CATS).map(([k, l]) => (
              <tr key={o.id + k}><td className="py-2 pr-4">{o.codigo || `OP #${o.id}`}</td><td className="pr-4">{l}</td><td className="pr-4">{cop(o[`presupuesto_${k}`])}</td><td className="pr-4">{cop(c[k])}</td>
                <td className="pr-4 font-semibold" style={{ color: c[k] > num(o[`presupuesto_${k}`]) ? '#ff4d6d' : '#00e676' }}>{cop(num(o[`presupuesto_${k}`]) - c[k])}</td></tr>
            ));
            const sug = c.total * (1 + num(o.margen) / 100);
            filas.push(
              <tr key={o.id + 't'} className="font-bold" style={{ background: 'rgba(0,242,254,.05)' }}><td className="py-2.5 pr-4">{o.codigo || `OP #${o.id}`}</td><td className="pr-4">Total</td><td className="pr-4">{cop(presTotal(o))}</td><td className="pr-4">{cop(c.total)}</td>
                <td className="glow-t pr-4">Precio sugerido al cliente ({o.margen ?? 30}% de margen): {cop(sug)}</td></tr>,
            );
            return filas;
          })}
        </Table>
      </Card>
      <Card title="Relación de facturas de proveedores" icon={FileText}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <OpSel ordenes={store.ordenes.rows} value={f.orden_id} onChange={(v) => set('orden_id')({ target: { value: v } })} />
          <Sel label="Categoría" value={f.categoria} onChange={set('categoria')}>{Object.entries(CATS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Sel>
          <Inp label="Proveedor" value={f.proveedor} onChange={set('proveedor')} /><Inp label="Número de factura" value={f.numero} onChange={set('numero')} />
          <Inp label="Valor (COP)" type="number" value={f.valor} onChange={set('valor')} /><Inp label="Fecha" type="date" value={f.fecha} onChange={set('fecha')} />
          <div className="flex items-end"><Btn onClick={add}><Plus size={15} />Vincular factura</Btn></div>
        </div>
        <div className="mt-5"><Table heads={['Fecha', 'OP', 'Categoría', 'Proveedor', 'Factura', 'Valor', '']}>
          {store.facturas.rows.map((x) => (
            <tr key={x.id}><td className="py-2 pr-4">{x.fecha}</td><td className="pr-4">{opLabel(store.ordenes.rows, x.orden_id)}</td><td className="pr-4">{CATS[x.categoria]}</td><td className="pr-4">{x.proveedor}</td><td className="pr-4">{x.numero}</td><td className="pr-4">{cop(x.valor)}</td>
              <td><button aria-label="Eliminar factura" onClick={() => store.facturas.remove(x.id)}><Trash2 size={14} className="mut hover:text-[#ff4d6d]" /></button></td></tr>
          ))}
        </Table></div>
      </Card>
    </div>
  );
}

/* ───────────── Calculadora DTF textil y UV (usa configuracion_precios) ───────────── */
function Calc({ store }) {
  const [tipo, setTipo] = useState('textil'); const [modo, setModo] = useState('dim');
  const [p, setP] = useState({ alto: 10, ancho: 10, cant: 100, ml: 5, merma: 5, sep: 1 });
  const [ordenId, setOp] = useState('');
  const s = (k) => (e) => setP({ ...p, [k]: num(e.target.value) });

  const filaPrecio = store.precios.rows.find((x) => x.tipo_material === tipo);
  useEffect(() => {
    if (!store.precios.loading) {
      ['textil', 'uv'].forEach((t) => { if (!store.precios.rows.some((x) => x.tipo_material === t)) store.precios.insert({ tipo_material: t, precio_metro: 0 }); });
    }
  }, [store.precios.loading]); // eslint-disable-line

  const precio = num(filaPrecio?.precio_metro);
  const m = 1 + p.merma / 100;
  const porFila = Math.max(1, Math.floor(60 / (p.ancho + p.sep)));
  const mlAcomodo = Math.ceil(p.cant / porFila) * ((p.alto + p.sep) / 100);
  const mlArea = (p.alto * p.ancho * p.cant) / 6000;
  const res = modo === 'ml'
    ? { ml: p.ml * m, costo: p.ml * m * precio }
    : { ml: mlAcomodo * m, costo: mlAcomodo * m * precio, area: mlArea * m * precio };
  const enviar = () => store.ordenes.update(num(ordenId), { presupuesto_marcacion: Math.round(res.costo) });

  return (
    <Card title="Cotizador de marcación DTF" icon={Calculator}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {[['textil', 'DTF textil'], ['uv', 'DTF UV']].map(([k, l]) => <Btn key={k} v={tipo === k ? 'pri' : 'ghost'} onClick={() => setTipo(k)}>{l}</Btn>)}
        <span className="mx-1 h-6 border-l" style={{ borderColor: '#2a353c' }} />
        {[['dim', 'Por dimensiones (alto × ancho)'], ['ml', 'Por metros lineales']].map(([k, l]) => <Btn key={k} v={modo === k ? 'pri' : 'ghost'} onClick={() => setModo(k)}>{l}</Btn>)}
      </div>
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {modo === 'dim' ? (<>
          <Inp label="Alto (cm)" type="number" value={p.alto} onChange={s('alto')} /><Inp label="Ancho (cm)" type="number" value={p.ancho} onChange={s('ancho')} />
          <Inp label="Cantidad de piezas" type="number" value={p.cant} onChange={s('cant')} /><Inp label="Separación (cm)" type="number" value={p.sep} onChange={s('sep')} />
        </>) : <Inp label="Metros lineales (bobina de 60 cm)" type="number" value={p.ml} onChange={s('ml')} />}
        <Inp label="Desperdicio o merma (%)" type="number" value={p.merma} onChange={s('merma')} />
        <Inp label={`Precio por metro lineal (COP) · ${tipo}`} type="number" value={filaPrecio?.precio_metro ?? 0}
          onChange={(e) => filaPrecio && store.precios.update(filaPrecio.id, { precio_metro: num(e.target.value) })} disabled={!filaPrecio} />
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <div className="neo-in p-4"><p className="mut text-xs font-semibold">Metros lineales con merma</p><p className="kpi kpi-bl mt-1 text-2xl">{res.ml.toFixed(2)} m</p></div>
        <div className="neo-in p-4"><p className="mut text-xs font-semibold">Costo estimado</p><p className="kpi kpi-cy mt-1 text-2xl">{cop(res.costo)}</p></div>
        {modo === 'dim' && <div className="neo-in p-4"><p className="mut text-xs font-semibold">Por pieza · por área pura</p><p className="kpi kpi-gr mt-1 text-2xl">{cop(res.costo / Math.max(p.cant, 1))} · {cop(res.area)}</p></div>}
      </div>
      {modo === 'dim' && <p className="mut mt-3 text-xs">Se acomodan {porFila} piezas por fila en la bobina de 60 cm.</p>}
      <div className="mt-5 grid max-w-xl gap-4 sm:grid-cols-2"><OpSel ordenes={store.ordenes.rows} value={ordenId} onChange={setOp} onlyOpen /><div className="flex items-end"><Btn v="acc" disabled={!ordenId} onClick={enviar}>Usar como presupuesto de marcación</Btn></div></div>
    </Card>
  );
}

/* ───────────── Módulos, roles y permisos ───────────── */
const MODULOS = [
  { key: 'ordenes', label: 'Órdenes de producción' },
  { key: 'maquila', label: 'Maquila' },
  { key: 'inventario', label: 'Inventario' },
  { key: 'finanzas', label: 'Finanzas' },
  { key: 'gastos', label: 'Gastos' },
  { key: 'consumos', label: 'Consumos e insumos' },
  { key: 'traslados', label: 'Traslados' },
  { key: 'calidad', label: 'Calidad' },
  { key: 'taller', label: 'Taller externo' },
];
const ALL_KEYS = MODULOS.map((m) => m.key);
// [id de pestaña, etiqueta, icono, módulo que la habilita]
const TABS = [
  ['dashboard', 'Indicadores', LayoutDashboard, 'ordenes'],
  ['ops', 'Órdenes', ClipboardList, 'ordenes'],
  ['calc', 'Calculadora', Calculator, 'ordenes'],
  ['maquila', 'Maquila', Users, 'maquila'],
  ['nomina', 'Nómina', DollarSign, 'maquila'],
  ['inventario', 'Inventario', Package, 'inventario'],
  ['consumos', 'Consumos e insumos', Boxes, 'consumos'],
  ['finanzas', 'Finanzas', DollarSign, 'finanzas'],
  ['gastos', 'Gastos', Receipt, 'gastos'],
  ['traslados', 'Traslados', Truck, 'traslados'],
  ['calidad', 'Calidad', ShieldCheck, 'calidad'],
  ['taller', 'Costos y facturas', Wrench, 'taller'],
];
// Módulos por defecto de cada rol (se usan mientras el usuario no tenga modulos_permitidos guardado)
const ROLES = {
  admin: { label: 'Admin / Líder de planta', mods: ALL_KEYS },
  mensajero: { label: 'Mensajero / Logística', mods: ['traslados', 'gastos'] },
  calidad: { label: 'Inspector de calidad', mods: ['calidad', 'consumos', 'maquila', 'inventario'] },
  taller: { label: 'Taller externo / Proveedor', mods: ['taller'] },
  superadmin: { label: 'Programador / SuperAdmin', mods: ALL_KEYS },
};
const normalizeRol = (r) => (r || '').toString().trim().toLowerCase();
const isSuperProfile = (p) => p?.es_programador === true || normalizeRol(p?.rol) === 'superadmin';
function modulosEfectivos(p) {
  if (isSuperProfile(p)) return ALL_KEYS;
  const mp = p?.modulos_permitidos;
  if (Array.isArray(mp)) return ALL_KEYS.filter((k) => mp.includes(k));
  if (mp && typeof mp === 'object') return ALL_KEYS.filter((k) => mp[k] === true);
  return ROLES[normalizeRol(p?.rol)]?.mods || [];
}
const modsToObj = (mods) => Object.fromEntries(ALL_KEYS.map((k) => [k, mods.includes(k)]));
const signOut = () => supabase.auth.signOut();

/* ───────────── Login privado (con acceso Programador / Admin) ───────────── */
function Login({ prog, setProg, notice, setNotice }) {
  const [email, setEmail] = useState(''); const [pass, setPass] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const entrar = async (e) => {
    e.preventDefault();
    if (!email.trim() || !pass) return setErr('Ingrese su correo y contraseña.');
    setBusy(true); setErr(''); setNotice('');
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass });
    if (error) {
      const m = error.message || '';
      setErr(/invalid login credentials/i.test(m) ? 'Correo o contraseña incorrectos.' : /not confirmed/i.test(m) ? 'Su cuenta aún no está confirmada. Contacte al administrador.' : m);
      setBusy(false);
      return;
    }
    if (prog) {
      const { data: p } = await supabase.from('profiles').select('es_programador, rol').eq('id', data.user.id).maybeSingle();
      if (!isSuperProfile(p)) {
        await supabase.auth.signOut();
        setNotice('Esta cuenta no tiene permisos de Programador / SuperAdmin.');
        setBusy(false);
      }
    }
  };
  const shown = err || notice;
  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <form onSubmit={entrar} className="neo w-full max-w-sm p-8">
        <div className="mb-6 text-center">
          <span className="neo-icon mx-auto" style={{ width: 56, height: 56, color: prog ? '#00e676' : undefined }}>{prog ? <Code2 size={26} /> : <Factory size={26} />}</span>
          <h1 className="glow-t mt-4 text-2xl font-extrabold">Planta OP</h1>
          <p className="mut mt-1 text-sm">{prog ? 'Acceso de Programador / SuperAdmin' : 'Acceso privado · inicie sesión para continuar'}</p>
          {prog && <div className="mt-3"><Pill ok><Code2 size={11} />Modo Programador</Pill></div>}
        </div>
        <div className="space-y-4">
          <Inp label="Correo electrónico" type="email" autoComplete="email" placeholder="usuario@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Inp label="Contraseña" type="password" autoComplete="current-password" placeholder="••••••••" value={pass} onChange={(e) => setPass(e.target.value)} />
        </div>
        {shown && <p role="alert" className="mt-4 text-sm" style={{ color: '#ff8fa3' }}>{shown}</p>}
        <Btn type="submit" v={prog ? 'acc' : 'pri'} disabled={busy} className="mt-6 w-full">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}{busy ? 'Ingresando…' : prog ? 'Ingresar como Programador' : 'Ingresar'}
        </Btn>
        <button type="button" onClick={() => { setProg(!prog); setErr(''); setNotice(''); }}
          className="mt-5 flex w-full items-center justify-center gap-1.5 text-xs font-semibold" style={{ color: prog ? '#00e676' : 'var(--mut)' }}>
          <Code2 size={14} />{prog ? 'Volver al acceso normal' : 'Acceso Programador / Admin'}
        </button>
        {!prog && <p className="mut mt-3 text-center text-xs">¿Sin cuenta? Solicítela al administrador.</p>}
      </form>
    </div>
  );
}

/* ───────────── Panel de Control / Permisos (solo Programador) ───────────── */
const Switch = ({ on, onChange, disabled, label }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={onChange} className={cx('sw', on && 'sw-on')}><i /></button>
);

async function fnErrorMessage(error) {
  let m = error?.message || 'Error desconocido';
  try { const j = await error.context.json(); if (j?.error) m = j.error; } catch { /* sin cuerpo JSON */ }
  if (/failed to send|not found|404|non-2xx/i.test(m) && !/ya|existe|registrad/i.test(m)) m += ' — verifique que la Edge Function "admin-users" esté desplegada en Supabase.';
  return m;
}

function PanelControl() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [draft, setDraft] = useState({}); // id -> arreglo de módulos editados
  const [saving, setSaving] = useState('');
  const [msg, setMsg] = useState(null);
  const [creating, setCreating] = useState(false);
  const [f, set, reset] = useForm({ email: '', password: '', nombre: '', rol: 'mensajero' });

  const load = async () => {
    const { data, error } = await supabase.from('profiles').select('*').order('nombre');
    if (error) setLoadErr(error.message); else { setUsers(data || []); setLoadErr(''); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggle = (u, key) => setDraft((d) => {
    const cur = d[u.id] ?? modulosEfectivos(u);
    return { ...d, [u.id]: cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key] };
  });

  const guardar = async (u) => {
    const mods = draft[u.id] ?? modulosEfectivos(u);
    setSaving(u.id); setMsg(null);
    const { data, error } = await supabase.from('profiles').update({ modulos_permitidos: modsToObj(mods) }).eq('id', u.id).select();
    if (error || !data?.length) {
      setMsg({ e: true, t: error ? error.message : 'No se guardó: revise la política de actualización de profiles (panel-permisos.sql).' });
    } else {
      setUsers((us) => us.map((x) => (x.id === u.id ? data[0] : x)));
      setDraft((d) => { const n = { ...d }; delete n[u.id]; return n; });
      setMsg({ e: false, t: `Permisos de ${u.nombre || 'usuario'} guardados.` });
    }
    setSaving('');
  };

  const crear = async (e) => {
    e.preventDefault();
    const email = f.email.trim(); const nombre = f.nombre.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return setMsg({ e: true, t: 'Ingrese un correo válido.' });
    if (f.password.length < 6) return setMsg({ e: true, t: 'La contraseña debe tener al menos 6 caracteres.' });
    if (!nombre) return setMsg({ e: true, t: 'Ingrese el nombre del usuario.' });
    setCreating(true); setMsg(null);
    const esSuper = f.rol === 'superadmin';
    const { data, error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'create', email, password: f.password, nombre, rol: f.rol, es_programador: esSuper, modulos_permitidos: esSuper ? null : modsToObj(ROLES[f.rol].mods) },
    });
    const m = error ? await fnErrorMessage(error) : data?.error;
    if (m) setMsg({ e: true, t: m });
    else { setMsg({ e: false, t: `Usuario ${email} creado. Ya puede iniciar sesión.` }); reset(); await load(); }
    setCreating(false);
  };

  return (
    <div className="space-y-5">
      <Card title="Crear usuario" icon={UserPlus}>
        <form onSubmit={crear} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Inp label="Correo electrónico" type="email" autoComplete="off" placeholder="usuario@empresa.com" value={f.email} onChange={set('email')} />
          <Inp label="Contraseña (mín. 6)" type="password" autoComplete="new-password" value={f.password} onChange={set('password')} />
          <Inp label="Nombre" value={f.nombre} onChange={set('nombre')} />
          <Sel label="Rol" value={f.rol} onChange={set('rol')}>{Object.entries(ROLES).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}</Sel>
          <div className="flex items-end"><Btn type="submit" disabled={creating} className="w-full">{creating ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}Crear usuario</Btn></div>
        </form>
        <p className="mut mt-3 text-xs">Los módulos iniciales dependen del rol; luego puede ajustarlos en la matriz. Un SuperAdmin siempre tiene acceso total.</p>
        {msg && <p role="status" className="mt-3 text-sm" style={{ color: msg.e ? '#ff8fa3' : '#00e676' }}>{msg.t}</p>}
      </Card>

      <Card title="Matriz de permisos por módulo" icon={SlidersHorizontal}>
        {loadErr && <p className="mb-3 text-sm" style={{ color: '#ff8fa3' }}>Error al cargar usuarios: {loadErr}</p>}
        {loading ? (
          <div className="mut flex items-center gap-2 text-sm"><Loader2 size={15} className="animate-spin" />Cargando usuarios…</div>
        ) : (
          <Table heads={['Usuario', 'Rol', ...MODULOS.map((m) => m.label), '']} empty="No hay usuarios registrados.">
            {users.map((u) => {
              const sup = isSuperProfile(u);
              const base = modulosEfectivos(u);
              const cur = draft[u.id] ?? base;
              const dirty = !sup && (cur.length !== base.length || cur.some((k) => !base.includes(k)));
              return (
                <tr key={u.id}>
                  <td className="py-3 pr-4 font-bold">{u.nombre || '—'}<div className="mut text-xs font-normal">{String(u.id).slice(0, 8)}…</div></td>
                  <td className="pr-4">{sup ? <Pill ok><Code2 size={11} />SuperAdmin</Pill> : <Pill>{ROLES[normalizeRol(u.rol)]?.label || u.rol || '—'}</Pill>}</td>
                  {MODULOS.map((m) => (
                    <td key={m.key} className="pr-4">
                      <Switch on={sup || cur.includes(m.key)} disabled={sup} label={`${m.label} para ${u.nombre || 'usuario'}`} onChange={() => toggle(u, m.key)} />
                    </td>
                  ))}
                  <td>
                    <Btn v={dirty ? 'acc' : 'ghost'} disabled={!dirty || saving === u.id} onClick={() => guardar(u)}>
                      {saving === u.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}Guardar
                    </Btn>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
        <p className="mut mt-4 text-xs">Los cambios se aplican cuando el usuario recarga la página o vuelve a iniciar sesión. Si un usuario no tiene permisos guardados, se usan los módulos por defecto de su rol.</p>
      </Card>
    </div>
  );
}

/* ───────────── Zona privada ───────────── */
function Private({ session }) {
  const store = useStore();
  const [perfil, setPerfil] = useState(undefined); // undefined = cargando, null = sin perfil
  const [tab, setTab] = useState(null);

  useEffect(() => {
    supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle()
      .then(({ data, error }) => setPerfil(error ? { error: error.message } : data));
  }, [session.user.id]);

  if (store.loading || perfil === undefined) return (
    <div className="grid min-h-screen place-items-center"><div className="mut flex items-center gap-2"><Loader2 className="animate-spin" style={{ color: '#00f2fe' }} />Cargando datos…</div></div>
  );

  if (!perfil || perfil.error) return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="neo max-w-md p-8 text-center">
        <AlertTriangle className="mx-auto mb-3" style={{ color: '#ff4d6d' }} size={30} />
        <h2 className="text-lg font-bold">Su usuario no tiene un perfil asignado</h2>
        <p className="mut mt-2 text-sm">{perfil?.error ? `Error: ${perfil.error}` : 'Solicite al administrador que registre su perfil (nombre y rol) para poder usar la aplicación.'}</p>
        <Btn v="ghost" onClick={signOut} className="mt-5"><LogOut size={15} />Cerrar sesión</Btn>
      </div>
    </div>
  );

  const isSuper = isSuperProfile(perfil);
  const rk = isSuper ? 'admin' : normalizeRol(perfil.rol); // el SuperAdmin conserva las capacidades del Admin
  const mods = modulosEfectivos(perfil);
  const visibles = TABS.filter(([, , , m]) => mods.includes(m));
  const tabs = isSuper ? [...visibles, ['panel', 'Panel de Control / Permisos', SlidersHorizontal, null]] : visibles;

  if (!tabs.length) return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="neo max-w-md p-8 text-center">
        <Lock className="mx-auto mb-3" style={{ color: '#ff4d6d' }} size={30} />
        <h2 className="text-lg font-bold">Sin módulos habilitados</h2>
        <p className="mut mt-2 text-sm">Su usuario no tiene acceso a ningún módulo. Solicite al administrador que le asigne permisos.</p>
        <Btn v="ghost" onClick={signOut} className="mt-5"><LogOut size={15} />Cerrar sesión</Btn>
      </div>
    </div>
  );

  const cur = tabs.some(([id]) => id === tab) ? tab : tabs[0][0];
  const rolLabel = isSuper ? ROLES.superadmin.label : (ROLES[rk]?.label || `Rol "${perfil.rol}"`);
  const urgentes = store.ordenes.rows.filter((o) => o.estado === 'Abierta' && daysTo(o.fecha_prometida) !== null && daysTo(o.fecha_prometida) <= 2);
  const views = {
    dashboard: <Dashboard store={store} />, ops: <Ops store={store} can={rk === 'admin'} perfil={perfil} />, calc: <Calc store={store} />,
    maquila: <Maquila store={store} />, nomina: <Nomina store={store} />,
    inventario: <Inventario store={store} canEdit={rk === 'admin'} />, consumos: <Calidad store={store} role={rk} part="consumos" />,
    finanzas: <Finanzas store={store} />, gastos: <Logistica store={store} part="gastos" />, traslados: <Logistica store={store} part="traslados" />,
    calidad: <Calidad store={store} role={rk} part="calidad" />, taller: <Taller store={store} />,
    panel: isSuper ? <PanelControl /> : null,
  };
  return (
    <>
      {urgentes.length > 0 && mods.includes('ordenes') && (
        <div role="alert" className="alert-pulse px-4 py-2.5 text-sm font-bold text-white" style={{ background: 'linear-gradient(90deg,#ff2d55,#ff4d6d)' }}>
          <AlertTriangle size={16} className="mr-1 inline" />
          Entrega crítica: {urgentes.map((o) => { const d = daysTo(o.fecha_prometida); return `${o.codigo || `OP #${o.id}`} (${d < 0 ? `atrasada ${-d} d` : d + ' d'})`; }).join(' · ')}
        </div>
      )}
      <header className="mx-auto max-w-7xl px-4 pt-5 sm:px-6">
        <div className="neo flex flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="neo-icon" style={isSuper ? { color: '#00e676' } : undefined}>{isSuper ? <Code2 size={17} /> : <Factory size={17} />}</span>
            <div><p className="glow-t text-lg font-extrabold leading-tight">Planta OP</p><p className="mut text-xs">{perfil.nombre} · {rolLabel}</p></div>
          </div>
          <Btn v="ghost" onClick={signOut}><LogOut size={15} />Cerrar sesión</Btn>
        </div>
        <nav className="tabs mt-4 flex gap-1 overflow-x-auto">
          {tabs.map(([id, label, I]) => (
            <button key={id} onClick={() => setTab(id)} className={cx('tab', cur === id && 'tab-on')}
              style={id === 'panel' && cur !== id ? { color: '#00e676' } : undefined}><I size={15} />{label}</button>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6"><ErrBanner errors={store.errors} />{views[cur]}</main>
    </>
  );
}

/* ───────────── App (puerta de autenticación) ───────────── */
export default function App() {
  const [session, setSession] = useState(undefined); // undefined = comprobando
  const [prog, setProg] = useState(false);   // modo de acceso Programador en el login
  const [notice, setNotice] = useState('');  // aviso que sobrevive al cierre de sesión forzado

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!supabase) return (
    <Shell><div className="grid min-h-screen place-items-center px-4"><div className="neo max-w-lg p-8 text-center">
      <AlertTriangle className="mx-auto mb-3" style={{ color: '#ff4d6d' }} size={30} />
      <h1 className="text-lg font-bold">Falta configurar Supabase</h1>
      <p className="mut mt-2 text-sm">Defina <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> en las variables de entorno.</p>
    </div></div></Shell>
  );

  if (session === undefined) return (
    <Shell><div className="grid min-h-screen place-items-center"><Loader2 className="animate-spin" style={{ color: '#00f2fe' }} /></div></Shell>
  );

  return <Shell>{session ? <Private key={session.user.id} session={session} /> : <Login prog={prog} setProg={setProg} notice={notice} setNotice={setNotice} />}</Shell>;
}
