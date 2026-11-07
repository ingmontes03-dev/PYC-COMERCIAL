import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { MESES, fmtFecha, mesNumero, soloFecha } from '../lib/fechas'
import { descargarIcs, enlaceGoogleCalendar } from '../lib/googleCalendar'
import useEmpresas from '../lib/useEmpresas'

// La auditoría (crear / editar / eliminar) la registra la base de datos automáticamente con triggers.
const MAX_ITEMS = 50
const MAX_FLETES = 5
const MAX_GASTOS = 10
const DIAS_ENTREGA = 10 // días hábiles estimados entre la OP y la entrega

const TIPOS_MARCACION = ['Bordado', 'Estampado', 'Sublimación', 'Serigrafía', 'Tampografía', 'Grabado láser', 'DTF', 'Sin marcación']
const TIPOS_FLETE = ['Transporte terrestre nacional', 'Mensajería urbana', 'Flete aéreo', 'Recogida en planta', 'Transporte de empaque', 'Otro']

const itemVacio = () => ({ producto: '', color: '', cantidad: 1, valor_unitario: '' })
const fleteVacio = () => ({ tipo: TIPOS_FLETE[0], otro: '', precio: '' })
const gastoVacio = () => ({ descripcion: '', cantidad: 1, valor_unitario: '' })
// Total del renglón de otros gastos = cantidad x valor unitario (se calcula solo)
const totalGasto = (g) => redondea((parseNum(g.cantidad) || 0) * (parseNum(g.valor_unitario) || 0))

const input = 'w-full rounded-lg border border-white/10 bg-[#0b1026]/70 px-3 py-2 text-sm text-white outline-none focus:border-blue-500 disabled:opacity-50'
const label = 'mb-1 block text-xs text-slate-400'
const cop = (n) => (Number(n) || 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const redondea = (n) => Math.round(n * 100) / 100
const FECHA_OK = /^\d{4}-\d{2}-\d{2}$/

// Convierte lo que escribe la persona en número: acepta 1500000, 1.500.000, 1,500,000 y 1.500.000,50
// Devuelve null si está vacío y NaN si no es un número válido.
export function parseNum(v) {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN
  let s = String(v).trim().replace(/[$\s]/g, '')
  if (s === '') return null
  const punto = s.lastIndexOf('.')
  const coma = s.lastIndexOf(',')
  if (punto >= 0 && coma >= 0) {
    // el separador decimal es el que aparece al final
    s = coma > punto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (coma >= 0) {
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.')
  } else if (punto >= 0 && /^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '') // 1.500.000 (formato colombiano)
  }
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN
}

function semanaISO(fecha) {
  const d = new Date(fecha + 'T00:00:00')
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7))
  const inicio = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t - inicio) / 86400000 + 1) / 7)
}

// Fecha de entrega estimada: fecha de la OP + N días hábiles (sin sábados ni domingos; no descuenta festivos)
function entregaEstimada(fechaOp, habiles = DIAS_ENTREGA) {
  if (!FECHA_OK.test(fechaOp || '')) return ''
  const d = new Date(fechaOp + 'T00:00:00')
  let n = 0
  while (n < habiles) {
    d.setDate(d.getDate() + 1)
    if (d.getDay() !== 0 && d.getDay() !== 6) n += 1
  }
  return fmtFecha(d)
}

// Ítems iniciales: los guardados (también los de versiones anteriores) o uno armado con los campos antiguos
function itemsIniciales(registro) {
  if (registro && Array.isArray(registro.items) && registro.items.length) {
    return registro.items.map((i) => ({
      producto: i.producto ?? i.referencia ?? '',
      color: i.color ?? '',
      cantidad: i.cantidad ?? 1,
      valor_unitario: i.valor_unitario ?? '',
    }))
  }
  if (registro) {
    return [{
      producto: registro.referencia ?? '',
      color: '',
      cantidad: Number(registro.cantidad) || 1,
      valor_unitario: registro.valor_unitario ?? '',
    }]
  }
  return [itemVacio()]
}

const fletesIniciales = (registro) =>
  (Array.isArray(registro?.fletes) ? registro.fletes : []).slice(0, MAX_FLETES).map((f) => {
    const d = f.descripcion ?? ''
    const conocido = TIPOS_FLETE.includes(d)
    return { tipo: conocido ? d : (d ? 'Otro' : TIPOS_FLETE[0]), otro: conocido ? '' : d, precio: f.precio ?? '' }
  })

const gastosIniciales = (registro) =>
  (Array.isArray(registro?.gastos_adicionales) ? registro.gastos_adicionales : []).slice(0, MAX_GASTOS)
    // Los gastos guardados antes solo tenían "valor": se leen como cantidad 1 x ese valor
    .map((g) => ({ descripcion: g.descripcion ?? '', cantidad: g.cantidad ?? 1, valor_unitario: g.valor_unitario ?? g.valor ?? '' }))

// Estado inicial del formulario. Las fechas se limpian a AAAA-MM-DD (así el campo de fecha siempre las muestra)
// y los números y textos nulos pasan a '' para que ningún campo quede "roto" al editar.
function formInicial(r) {
  const t = (v) => (v === null || v === undefined ? '' : String(v))
  return {
    fecha_envio: soloFecha(r?.fecha_envio), semana: t(r?.semana), mes: r ? mesNumero(r.mes) : '',
    n_cotizacion: t(r?.n_cotizacion), contacto: t(r?.contacto), cliente: t(r?.cliente),
    estado: r?.estado || 'Pendiente', motivo_negacion: t(r?.motivo_negacion),
    fecha_op: soloFecha(r?.fecha_op), num_op: t(r?.num_op), valor_aprobado: t(r?.valor_aprobado),
    rentabilidad_pct: t(r?.rentabilidad_pct), n_factura: t(r?.n_factura), fecha_facturacion: soloFecha(r?.fecha_facturacion),
    tipo_marcacion: t(r?.tipo_marcacion), precio_marcacion: t(r?.precio_marcacion),
    fecha_entrega: soloFecha(r?.fecha_entrega), fecha_entrega_anticipada: soloFecha(r?.fecha_entrega_anticipada),
    valor_positivos: t(r?.valor_positivos),
    dtf: r?.dtf === true, dtf_metros: t(r?.dtf_metros),
  }
}

const mensajeError = (e) =>
  e.message + (/schema cache|column|relation|invalid input syntax|violates/i.test(e.message)
    ? ' — Ejecuta supabase_schema.sql completo en Supabase (SQL Editor) y recarga la página.'
    : '')

export default function CotizacionForm({ registro, borrador, user, onClose, onSaved }) {
  const empresasBD = useEmpresas() // empresas de la Base de Datos
  // borrador: cliente e ítems que llegan desde el Cotizador (cotización nueva precargada)
  const base = registro || borrador || null
  const [f, setF] = useState(() => formInicial(base))
  const [items, setItems] = useState(() => itemsIniciales(base))
  const [nTexto, setNTexto] = useState(() => String(itemsIniciales(base).length))
  const [fletes, setFletes] = useState(() => fletesIniciales(registro))
  const [gastos, setGastos] = useState(() => gastosIniciales(registro))
  // La fecha de entrega se calcula sola mientras nadie la cambie a mano
  const [entregaManual, setEntregaManual] = useState(() => !!registro?.fecha_entrega)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const aprobado = f.estado === 'Aprobado'
  const totalItem = (it) => (Number(it.cantidad) || 0) * (Number(it.valor_unitario) || 0)
  const total = items.reduce((a, i) => a + totalItem(i), 0)
  const cantidadTotal = items.reduce((a, i) => a + (Number(i.cantidad) || 0), 0)
  const totalFletes = fletes.reduce((a, x) => a + (parseNum(x.precio) || 0), 0)
  const totalGastos = gastos.reduce((a, x) => a + totalGasto(x), 0)

  const set = (k, v) => setF((p) => {
    const n = { ...p, [k]: v }
    if (k === 'fecha_envio' && v) {
      n.semana = semanaISO(v)
      n.mes = new Date(v + 'T00:00:00').getMonth() + 1
    }
    if (k === 'fecha_op' && !entregaManual) n.fecha_entrega = entregaEstimada(v)
    if (k === 'estado' && v === 'Aprobado' && !entregaManual && !p.fecha_entrega && p.fecha_op) n.fecha_entrega = entregaEstimada(p.fecha_op)
    return n
  })

  // Agrega la entrega al calendario desde el formulario (enlace directo a Google Calendar o archivo .ics)
  // Botones «Google Calendar» y «.ics» para cualquier casilla de fecha (como en la sección de Alertas)
  const botonesCalendario = (fecha, titulo, tipo = 'manual') => {
    if (!fecha || !FECHA_OK.test(fecha)) return null
    const ev = { id: `${f.n_cotizacion || 'nueva'}-${titulo}`, titulo, cliente: f.cliente, n_cotizacion: f.n_cotizacion, tipo, fecha_limite: fecha }
    return (
      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
        <a href={enlaceGoogleCalendar(ev)} target="_blank" rel="noreferrer"
          className="rounded-md bg-sky-600 px-2 py-1 font-medium text-white hover:bg-sky-500">📅 Google Calendar</a>
        <button type="button" onClick={() => descargarIcs(ev)} className="rounded-md bg-white/10 px-2 py-1 text-slate-200 hover:bg-white/20">.ics</button>
      </p>
    )
  }

  const recalcularEntrega = () => { setEntregaManual(false); setF((p) => ({ ...p, fecha_entrega: entregaEstimada(p.fecha_op) })) }

  // "Número de ítems": genera o recorta las filas de productos
  const aplicarN = (n) => {
    if (n < items.length) {
      const conDatos = items.slice(n).some((i) => String(i.producto).trim() || String(i.color).trim() || String(i.valor_unitario).trim())
      if (conDatos && !window.confirm(`Se quitarán ${items.length - n} ítem(s) que tienen datos. ¿Continuar?`)) {
        setNTexto(String(items.length))
        return
      }
      setItems(items.slice(0, n))
    } else if (n > items.length) {
      setItems([...items, ...Array.from({ length: n - items.length }, itemVacio)])
    }
    setNTexto(String(n))
  }

  const cambiaN = (texto) => {
    setNTexto(texto)
    const n = parseInt(texto, 10)
    if (n >= 1 && n <= MAX_ITEMS) aplicarN(n)
  }

  const setItem = (idx, k, v) => setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [k]: v } : it)))
  const setFlete = (i, k, v) => setFletes((p) => p.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
  const setGasto = (i, k, v) => setGastos((p) => p.map((x, j) => (j === i ? { ...x, [k]: v } : x)))

  const cantidadFletes = (n) => setFletes((p) => (n <= p.length ? p.slice(0, n) : [...p, ...Array.from({ length: n - p.length }, fleteVacio)]))
  const cantidadGastos = (n) => setGastos((p) => (n <= p.length ? p.slice(0, n) : [...p, ...Array.from({ length: n - p.length }, gastoVacio)]))

  const guardar = async (e) => {
    e.preventDefault()
    setError('')

    // --- Ítems ---
    const itemsFinal = items.map((i) => {
      const cantidad = parseNum(i.cantidad)
      const valor = parseNum(i.valor_unitario)
      return { producto: String(i.producto).trim(), color: String(i.color).trim(), cantidad, valor_unitario: valor }
    })
    const invalido = itemsFinal.some(
      (i) => !i.producto || !(i.cantidad > 0) || i.valor_unitario === null || Number.isNaN(i.valor_unitario) || i.valor_unitario < 0
    )
    if (invalido) {
      setError('Completa todos los ítems: nombre del producto, cantidad (mayor a 0) y valor unitario.')
      return
    }
    const limpios = itemsFinal.map((i) => ({ ...i, total: redondea(i.cantidad * i.valor_unitario) }))

    // --- Campos generales: fechas, números y textos ---
    const fechas = { fecha_envio: 'Fecha de envío', fecha_op: 'Fecha OP', fecha_facturacion: 'Fecha de facturación' }
    for (const [k, nombre] of Object.entries(fechas)) {
      if (f[k] && !FECHA_OK.test(f[k])) { setError(`${nombre}: la fecha no es válida.`); return }
    }
    const valorAprobado = parseNum(f.valor_aprobado)
    if (Number.isNaN(valorAprobado) || (valorAprobado !== null && valorAprobado < 0)) { setError('Valor aprobado: escribe solo un número positivo (ej. 1500000).'); return }
    const pct = parseNum(f.rentabilidad_pct)
    if (Number.isNaN(pct) || (pct !== null && (pct < -100 || pct > 1000))) { setError('El % de rentabilidad debe ser un número entre -100 y 1000.'); return }
    const semana = parseNum(f.semana)
    if (Number.isNaN(semana)) { setError('La semana debe ser un número.'); return }

    const texto = (v) => (String(v ?? '').trim() === '' ? null : String(v).trim())
    const totalItems = redondea(limpios.reduce((a, i) => a + i.total, 0))
    const cantTotal = limpios.reduce((a, i) => a + i.cantidad, 0)

    const payload = {
      fecha_envio: f.fecha_envio || null,
      semana,
      mes: f.mes === '' ? null : Number(f.mes),
      n_cotizacion: texto(f.n_cotizacion),
      contacto: texto(f.contacto),
      cliente: texto(f.cliente),
      estado: f.estado,
      motivo_negacion: f.estado === 'Negado' ? texto(f.motivo_negacion) : null,
      fecha_op: f.fecha_op || null,
      num_op: texto(f.num_op),
      valor_aprobado: valorAprobado,
      rentabilidad_pct: pct,
      n_factura: texto(f.n_factura),
      fecha_facturacion: f.fecha_facturacion || null,
      items: limpios,
      referencia: limpios.map((i) => (i.color ? `${i.producto} (${i.color})` : i.producto)).join(' / '),
      cantidad: cantTotal,
      valor_unitario: cantTotal ? redondea(totalItems / cantTotal) : 0, // promedio ponderado
      valor_total: totalItems,
    }

    // --- Campos de órdenes aprobadas (solo se envían con estado Aprobado; si no, se respetan los guardados) ---
    if (aprobado) {
      if (f.fecha_entrega && !FECHA_OK.test(f.fecha_entrega)) { setError('Fecha de entrega: la fecha no es válida.'); return }
      if (f.fecha_entrega_anticipada && !FECHA_OK.test(f.fecha_entrega_anticipada)) { setError('Fecha anticipada de entrega: la fecha no es válida.'); return }
      if (f.fecha_entrega_anticipada && f.fecha_entrega && f.fecha_entrega_anticipada > f.fecha_entrega) {
        setError('La fecha anticipada de entrega debe ser igual o anterior a la fecha de entrega.')
        return
      }
      const precioMarc = parseNum(f.precio_marcacion)
      const positivos = parseNum(f.valor_positivos)
      const metros = f.dtf ? parseNum(f.dtf_metros) : null
      if ([precioMarc, positivos, metros].some((n) => Number.isNaN(n) || (n !== null && n < 0))) {
        setError('Precio de marcación, valor de positivos y metros de DTF deben ser números positivos.')
        return
      }

      const fletesFinal = []
      for (let i = 0; i < fletes.length; i += 1) {
        const x = fletes[i]
        const descripcion = x.tipo === 'Otro' ? x.otro.trim() : x.tipo
        const precio = parseNum(x.precio)
        if (!descripcion || precio === null || Number.isNaN(precio) || precio < 0) { setError(`Flete ${i + 1}: completa la descripción y un precio válido.`); return }
        fletesFinal.push({ descripcion, precio })
      }
      const gastosFinal = []
      for (let i = 0; i < gastos.length; i += 1) {
        const x = gastos[i]
        const cantidad = parseNum(x.cantidad)
        const valorUnitario = parseNum(x.valor_unitario)
        if (!x.descripcion.trim() || !(cantidad > 0) || valorUnitario === null || Number.isNaN(valorUnitario) || valorUnitario < 0) {
          setError(`Gasto adicional ${i + 1}: completa la descripción, una cantidad mayor a 0 y un valor unitario válido.`)
          return
        }
        // "valor" queda como el total del renglón (cantidad x valor unitario) para que los reportes sigan funcionando
        gastosFinal.push({ descripcion: x.descripcion.trim(), cantidad, valor_unitario: valorUnitario, valor: redondea(cantidad * valorUnitario) })
      }

      Object.assign(payload, {
        tipo_marcacion: texto(f.tipo_marcacion),
        precio_marcacion: precioMarc,
        fecha_entrega: f.fecha_entrega || null,
        fecha_entrega_anticipada: f.fecha_entrega_anticipada || null,
        valor_positivos: positivos,
        dtf: f.dtf,
        dtf_metros: metros,
        fletes: fletesFinal,
        gastos_adicionales: gastosFinal,
      })
    }

    setGuardando(true)
    if (registro?.id) {
      const { data, error } = await supabase.from('cotizaciones').update(payload).eq('id', registro.id).select('id')
      if (error) { setError(mensajeError(error)); setGuardando(false); return }
      if (!data?.length) {
        setError('No tienes permiso para modificar esta cotización.')
        setGuardando(false)
        return
      }
    } else {
      const { error } = await supabase
        .from('cotizaciones')
        .insert({ ...payload, usuario_email: user.email })
        .select('id')
        .single()
      if (error) { setError(mensajeError(error)); setGuardando(false); return }
    }
    setGuardando(false)
    onSaved()
  }

  const campo = (k, titulo, type = 'text', extra = {}) => (
    <div>
      <label className={label}>{titulo}</label>
      <input type={type} value={f[k] ?? ''} onChange={(e) => set(k, e.target.value)} className={input} {...extra} />
      {type === 'date' && botonesCalendario(f[k], `${titulo}${f.cliente ? ` - ${f.cliente}` : ''}`)}
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-0 sm:p-4">
      <form onSubmit={guardar} className="h-full w-full max-w-5xl overflow-y-auto rounded-none border border-white/10 bg-[#141a3d] p-4 pb-24 shadow-2xl sm:h-auto sm:max-h-[92vh] sm:rounded-2xl sm:p-6 sm:pb-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">{registro ? 'Editar cotización' : 'Nueva cotización'}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {campo('fecha_envio', 'Fecha Envío', 'date')}
          {campo('semana', 'Semana', 'number')}
          <div>
            <label className={label}>Mes</label>
            <select value={f.mes ?? ''} onChange={(e) => set('mes', e.target.value === '' ? '' : Number(e.target.value))} className={input}>
              <option value="">Seleccionar…</option>
              {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          {campo('n_cotizacion', 'N° Cotización', 'text', { required: true })}
          {campo('contacto', 'Contacto')}
          {campo('cliente', 'Cliente / Empresa', 'text', { required: true, list: 'empresas-bd', autoComplete: 'off', placeholder: 'Busca una empresa de la Base de Datos…' })}
          <datalist id="empresas-bd">{empresasBD.map((n) => <option key={n} value={n} />)}</datalist>
        </div>

        {/* ÍTEMS A COTIZAR */}
        <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-white">Productos a cotizar</p>
            <div className="flex items-center gap-2">
              <label htmlFor="n-items" className="text-xs text-slate-400">Número de ítems</label>
              <button type="button" onClick={() => aplicarN(Math.max(1, items.length - 1))} disabled={items.length <= 1}
                className="h-8 w-8 rounded-lg border border-white/15 text-white hover:bg-white/10 disabled:opacity-40">−</button>
              <input id="n-items" type="number" min="1" max={MAX_ITEMS} value={nTexto}
                onChange={(e) => cambiaN(e.target.value)} onBlur={() => setNTexto(String(items.length))}
                className="h-8 w-16 rounded-lg border border-white/10 bg-[#0b1026]/70 text-center text-sm text-white outline-none focus:border-blue-500" />
              <button type="button" onClick={() => aplicarN(Math.min(MAX_ITEMS, items.length + 1))} disabled={items.length >= MAX_ITEMS}
                className="h-8 w-8 rounded-lg border border-white/15 text-white hover:bg-white/10 disabled:opacity-40">+</button>
            </div>
          </div>

          <div className="space-y-3">
            {items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-1 items-end gap-3 rounded-lg border border-white/10 bg-[#0b1026]/40 p-3 sm:grid-cols-12">
                <div className="text-xs font-semibold text-violet-300 sm:col-span-12">Ítem {idx + 1}</div>
                <div className="sm:col-span-4">
                  <label className={label}>Nombre del producto</label>
                  <input value={it.producto} onChange={(e) => setItem(idx, 'producto', e.target.value)} className={input} />
                </div>
                <div className="sm:col-span-2">
                  <label className={label}>Color</label>
                  <input value={it.color} onChange={(e) => setItem(idx, 'color', e.target.value)} className={input} />
                </div>
                <div className="sm:col-span-2">
                  <label className={label}>Cantidad</label>
                  <input type="number" min="0" step="any" value={it.cantidad} onChange={(e) => setItem(idx, 'cantidad', e.target.value)} className={input} />
                </div>
                <div className="sm:col-span-2">
                  <label className={label}>Valor unitario</label>
                  <input type="number" min="0" step="any" value={it.valor_unitario} onChange={(e) => setItem(idx, 'valor_unitario', e.target.value)} className={input} />
                </div>
                <div className="sm:col-span-2">
                  <label className={label}>Total del ítem</label>
                  <div className={`${input} bg-violet-500/10 font-semibold text-violet-300`}>{cop(totalItem(it))}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-end gap-x-8 gap-y-1 border-t border-white/10 pt-3 text-sm">
            <span className="text-slate-400">Unidades: <b className="text-white">{cantidadTotal}</b></span>
            <span className="text-slate-300">Total general: <b className="text-lg text-violet-300">{cop(total)}</b></span>
          </div>
        </div>

        {/* ESTADO, OP, FACTURA */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={label}>Estado Cotización</label>
            <select value={f.estado} onChange={(e) => set('estado', e.target.value)} className={input}>
              <option>Pendiente</option><option>Aprobado</option><option>Negado</option>
            </select>
          </div>
          {campo('motivo_negacion', 'Motivo Negación', 'text', { disabled: f.estado !== 'Negado' })}
          {campo('fecha_op', 'Fecha OP', 'date')}
          {campo('num_op', '# OP')}
          <div>
            <label className={label}>Valor Aprobado</label>
            <input type="text" inputMode="decimal" value={f.valor_aprobado} onChange={(e) => set('valor_aprobado', e.target.value)}
              className={input} placeholder="Ej. 1500000" />
            {total > 0 && (
              <button type="button" onClick={() => set('valor_aprobado', String(redondea(total)))} className="mt-1 text-xs text-blue-300 hover:underline">
                Usar el total de la cotización ({cop(total)})
              </button>
            )}
          </div>
          <div>
            <label className={label}>% Rentabilidad (proyectada)</label>
            <div className="relative">
              <input type="number" step="0.01" min="-100" max="1000" value={f.rentabilidad_pct}
                onChange={(e) => set('rentabilidad_pct', e.target.value)} className={`${input} pr-8`} placeholder="Ej. 25" />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>
            </div>
          </div>
          {campo('n_factura', 'N° Factura')}
          {campo('fecha_facturacion', 'Fecha Facturación', 'date')}
        </div>

        {/* ORDEN APROBADA: se habilita solo con estado Aprobado */}
        <fieldset disabled={!aprobado} className={`mt-6 rounded-xl border p-4 ${aprobado ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-white/10 bg-white/[0.02] opacity-60'}`}>
          <legend className="px-2 text-sm font-semibold text-white">Datos de la orden aprobada</legend>
          {!aprobado && <p className="mb-3 text-xs text-slate-400">Estos campos se habilitan automáticamente cuando el estado es <b>Aprobado</b>.</p>}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className={label}>Tipo de marcación</label>
              <input list="tipos-marcacion" value={f.tipo_marcacion} onChange={(e) => set('tipo_marcacion', e.target.value)} className={input} placeholder="Elige o escribe" />
              <datalist id="tipos-marcacion">{TIPOS_MARCACION.map((t) => <option key={t} value={t} />)}</datalist>
            </div>
            <div>
              <label className={label}>Precio de marcación</label>
              <input type="text" inputMode="decimal" value={f.precio_marcacion} onChange={(e) => set('precio_marcacion', e.target.value)} className={input} />
            </div>
            <div>
              <label className={label}>Valor de los positivos</label>
              <input type="text" inputMode="decimal" value={f.valor_positivos} onChange={(e) => set('valor_positivos', e.target.value)} className={input} />
            </div>
            <div>
              <label className={label}>Fecha de entrega {!entregaManual && f.fecha_entrega ? '(estimada automática)' : ''}</label>
              <input type="date" value={f.fecha_entrega} onChange={(e) => { setEntregaManual(true); set('fecha_entrega', e.target.value) }} className={input} />
              <p className="mt-1 text-xs text-slate-500">
                Se calcula con la Fecha OP + {DIAS_ENTREGA} días hábiles (sin festivos).{' '}
                {entregaManual && f.fecha_op && <button type="button" onClick={recalcularEntrega} className="text-blue-300 hover:underline">Recalcular</button>}
              </p>
              {botonesCalendario(f.fecha_entrega, 'Entrega de pedido', 'entrega')}
            </div>
            <div>
              <label className={label}>Fecha anticipada de entrega (opcional)</label>
              <input type="date" value={f.fecha_entrega_anticipada} onChange={(e) => set('fecha_entrega_anticipada', e.target.value)} className={input} />
              <p className="mt-1 text-xs text-slate-500">Debe ser igual o anterior a la fecha de entrega. Ambas fechas se agendan solas como alertas al guardar la cotización aprobada.</p>
              {botonesCalendario(f.fecha_entrega_anticipada, 'Entrega anticipada de pedido', 'entrega_anticipada')}
            </div>
            <div>
              <label className="flex cursor-pointer items-center gap-2 pt-6 text-sm text-slate-200">
                <input type="checkbox" checked={f.dtf} onChange={(e) => set('dtf', e.target.checked)} /> Incluye DTF
              </label>
            </div>
            {f.dtf && (
              <div>
                <label className={label}>Metros de DTF (opcional)</label>
                <input type="text" inputMode="decimal" value={f.dtf_metros} onChange={(e) => set('dtf_metros', e.target.value)} className={input} placeholder="Ej. 2.5" />
              </div>
            )}
          </div>

          {/* FLETES */}
          <div className="mt-5">
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <p className="text-sm font-semibold text-white">Fletes</p>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                ¿Cuántos?
                <select value={fletes.length} onChange={(e) => cantidadFletes(Number(e.target.value))}
                  className="rounded-lg border border-white/10 bg-[#0b1026]/70 px-2 py-1 text-sm text-white">
                  {Array.from({ length: MAX_FLETES + 1 }, (_, i) => i).map((n) => <option key={n} value={n}>{n === 0 ? 'Ninguno' : n}</option>)}
                </select>
              </label>
              {fletes.length > 0 && <span className="text-xs text-slate-400">Total fletes: <b className="text-white">{cop(totalFletes)}</b></span>}
            </div>
            <div className="space-y-2">
              {fletes.map((x, i) => (
                <div key={i} className="grid grid-cols-1 gap-3 rounded-lg border border-white/10 bg-[#0b1026]/40 p-3 sm:grid-cols-3">
                  <div>
                    <label className={label}>Flete {i + 1}: descripción</label>
                    <select value={x.tipo} onChange={(e) => setFlete(i, 'tipo', e.target.value)} className={input}>
                      {TIPOS_FLETE.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={label}>{x.tipo === 'Otro' ? 'Describe el flete' : 'Detalle'}</label>
                    <input value={x.tipo === 'Otro' ? x.otro : ''} disabled={x.tipo !== 'Otro'} onChange={(e) => setFlete(i, 'otro', e.target.value)} className={input} />
                  </div>
                  <div>
                    <label className={label}>Precio</label>
                    <input type="text" inputMode="decimal" value={x.precio} onChange={(e) => setFlete(i, 'precio', e.target.value)} className={input} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* GASTOS ADICIONALES */}
          <div className="mt-5">
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <p className="text-sm font-semibold text-white">Gastos adicionales (empaque, marcación, otros)</p>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                ¿Cuántos?
                <select value={gastos.length} onChange={(e) => cantidadGastos(Number(e.target.value))}
                  className="rounded-lg border border-white/10 bg-[#0b1026]/70 px-2 py-1 text-sm text-white">
                  {Array.from({ length: MAX_GASTOS + 1 }, (_, i) => i).map((n) => <option key={n} value={n}>{n === 0 ? 'Ninguno' : n}</option>)}
                </select>
              </label>
              {gastos.length > 0 && <span className="text-xs text-slate-400">Total gastos: <b className="text-white">{cop(totalGastos)}</b></span>}
            </div>
            <div className="space-y-2">
              {gastos.map((x, i) => (
                <div key={i} className="grid grid-cols-1 gap-3 rounded-lg border border-white/10 bg-[#0b1026]/40 p-3 sm:grid-cols-12">
                  <div className="sm:col-span-4">
                    <label className={label}>Gasto {i + 1}: descripción</label>
                    <input value={x.descripcion} onChange={(e) => setGasto(i, 'descripcion', e.target.value)} className={input} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={label}>Cantidad</label>
                    <input type="text" inputMode="decimal" value={x.cantidad} onChange={(e) => setGasto(i, 'cantidad', e.target.value)} className={input} />
                  </div>
                  <div className="sm:col-span-3">
                    <label className={label}>Valor unitario</label>
                    <input type="text" inputMode="decimal" value={x.valor_unitario} onChange={(e) => setGasto(i, 'valor_unitario', e.target.value)} className={input} />
                  </div>
                  <div className="sm:col-span-3">
                    <label className={label}>Valor total</label>
                    <div className={`${input} bg-violet-500/10 font-semibold text-violet-300`}>{cop(totalGasto(x))}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {(fletes.length > 0 || gastos.length > 0) && (
            <p className="mt-4 text-right text-sm text-slate-300">Fletes + gastos adicionales: <b className="text-emerald-300">{cop(totalFletes + totalGastos)}</b></p>
          )}
        </fieldset>

        {error && <p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5">Cancelar</button>
          <button disabled={guardando} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50">
            {guardando ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  )
}
