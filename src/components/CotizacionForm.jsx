import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { MESES, mesNumero } from '../lib/fechas'

// La auditoría (crear / editar / eliminar) la registra la base de datos automáticamente con triggers.
const CAMPOS = [
  'fecha_envio', 'semana', 'mes', 'n_cotizacion', 'contacto', 'cliente', 'estado', 'motivo_negacion',
  'fecha_op', 'num_op', 'valor_aprobado', 'rentabilidad_pct', 'n_factura', 'fecha_facturacion',
]
// El usuario ve el nombre del mes (MESES) y a Supabase se envía el número 1-12 (columna "mes")
const NUMERICOS = ['mes', 'semana', 'valor_aprobado', 'rentabilidad_pct']
const MAX_ITEMS = 50

const VACIO = {
  fecha_envio: '', semana: '', mes: '', n_cotizacion: '', contacto: '', cliente: '', estado: 'Pendiente',
  motivo_negacion: '', fecha_op: '', num_op: '', valor_aprobado: '', rentabilidad_pct: '', n_factura: '', fecha_facturacion: '',
}

const itemVacio = () => ({ producto: '', color: '', cantidad: 1, valor_unitario: '' })

const input = 'w-full rounded-lg border border-white/10 bg-[#0b1026]/70 px-3 py-2 text-sm text-white outline-none focus:border-blue-500'
const label = 'mb-1 block text-xs text-slate-400'
const cop = (n) => (Number(n) || 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const redondea = (n) => Math.round(n * 100) / 100

function semanaISO(fecha) {
  const d = new Date(fecha + 'T00:00:00')
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7))
  const inicio = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t - inicio) / 86400000 + 1) / 7)
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

const mensajeError = (e) =>
  e.message + (/schema cache|column|relation|invalid input syntax/i.test(e.message)
    ? ' — Ejecuta supabase_schema.sql en Supabase (SQL Editor) y recarga la página.'
    : '')

export default function CotizacionForm({ registro, user, onClose, onSaved }) {
  const [f, setF] = useState(registro ? { ...VACIO, ...registro, mes: mesNumero(registro.mes) } : VACIO)
  const [items, setItems] = useState(() => itemsIniciales(registro))
  const [nTexto, setNTexto] = useState(() => String(itemsIniciales(registro).length))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const totalItem = (it) => (Number(it.cantidad) || 0) * (Number(it.valor_unitario) || 0)
  const total = items.reduce((a, i) => a + totalItem(i), 0)
  const cantidadTotal = items.reduce((a, i) => a + (Number(i.cantidad) || 0), 0)

  const set = (k, v) => setF((p) => {
    const n = { ...p, [k]: v }
    if (k === 'fecha_envio' && v) {
      n.semana = semanaISO(v)
      n.mes = new Date(v + 'T00:00:00').getMonth() + 1
    }
    return n
  })

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

  const guardar = async (e) => {
    e.preventDefault()
    setError('')

    const itemsFinal = items.map((i) => {
      const cantidad = Number(i.cantidad)
      const valor = Number(i.valor_unitario)
      return {
        producto: String(i.producto).trim(),
        color: String(i.color).trim(),
        cantidad,
        valor_unitario: valor,
        total: redondea(cantidad * valor),
        _sinValor: String(i.valor_unitario).trim() === '',
      }
    })
    const invalido = itemsFinal.some(
      (i) => !i.producto || !(i.cantidad > 0) || i._sinValor || Number.isNaN(i.valor_unitario) || i.valor_unitario < 0
    )
    if (invalido) {
      setError('Completa todos los ítems: nombre del producto, cantidad (mayor a 0) y valor unitario.')
      return
    }

    const pct = f.rentabilidad_pct === '' || f.rentabilidad_pct === null ? null : Number(f.rentabilidad_pct)
    if (pct !== null && (Number.isNaN(pct) || pct < -100 || pct > 1000)) {
      setError('El % de rentabilidad debe ser un número entre -100 y 1000.')
      return
    }

    setGuardando(true)

    const payload = {}
    CAMPOS.forEach((k) => {
      let v = f[k]
      if (v === '' || v === undefined) v = null
      if (NUMERICOS.includes(k) && v !== null) v = Number(v)
      payload[k] = v
    })
    if (payload.estado !== 'Negado') payload.motivo_negacion = null

    const limpios = itemsFinal.map(({ _sinValor, ...resto }) => resto)
    const totalItems = redondea(limpios.reduce((a, i) => a + i.total, 0))
    const cantTotal = limpios.reduce((a, i) => a + i.cantidad, 0)
    payload.items = limpios
    payload.referencia = limpios.map((i) => (i.color ? `${i.producto} (${i.color})` : i.producto)).join(' / ')
    payload.cantidad = cantTotal
    payload.valor_unitario = cantTotal ? redondea(totalItems / cantTotal) : 0 // promedio ponderado
    payload.valor_total = totalItems

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
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <form onSubmit={guardar} className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-white/10 bg-[#141a3d] p-6 shadow-2xl">
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
          {campo('cliente', 'Cliente', 'text', { required: true })}
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
          {campo('valor_aprobado', 'Valor Aprobado', 'number', { step: 'any' })}
          <div>
            <label className={label}>% Rentabilidad (proyectada)</label>
            <div className="relative">
              <input type="number" step="0.01" min="-100" max="1000" value={f.rentabilidad_pct ?? ''}
                onChange={(e) => set('rentabilidad_pct', e.target.value)} className={`${input} pr-8`} placeholder="Ej. 25" />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>
            </div>
          </div>
          {campo('n_factura', 'N° Factura')}
          {campo('fecha_facturacion', 'Fecha Facturación', 'date')}
        </div>

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
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
