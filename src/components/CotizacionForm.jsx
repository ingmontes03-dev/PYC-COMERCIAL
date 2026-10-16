import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { diffCampos, registrarAuditoria } from '../lib/auditoria'

// Campos "planos" de la cotización (referencia, cantidad, valor unitario y total salen de los ítems)
const CAMPOS = [
  'fecha_envio', 'semana', 'mes', 'n_cotizacion', 'contacto', 'cliente', 'estado', 'motivo_negacion',
  'fecha_op', 'num_op', 'valor_aprobado', 'renta', 'n_factura', 'fecha_facturacion',
]
const NUMERICOS = ['semana', 'valor_aprobado', 'renta']
const MAX_ITEMS = 50

const VACIO = {
  fecha_envio: '', semana: '', mes: '', n_cotizacion: '', contacto: '', cliente: '', estado: 'Pendiente',
  motivo_negacion: '', fecha_op: '', num_op: '', valor_aprobado: '', renta: '', n_factura: '', fecha_facturacion: '',
}

const itemVacio = () => ({ referencia: '', cantidad: 1, valor_unitario: 0 })

const input = 'w-full rounded-lg border border-white/10 bg-[#0b1026]/70 px-3 py-2 text-sm text-white outline-none focus:border-blue-500'
const label = 'mb-1 block text-xs text-slate-400'
const cop = (n) => (Number(n) || 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function semanaISO(fecha) {
  const d = new Date(fecha + 'T00:00:00')
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7))
  const inicio = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t - inicio) / 86400000 + 1) / 7)
}

// Ítems iniciales: los guardados, o (cotizaciones antiguas) uno armado con referencia/cantidad/valor unitario
function itemsIniciales(registro) {
  if (registro && Array.isArray(registro.items) && registro.items.length) {
    return registro.items.map((i) => ({
      referencia: i.referencia ?? '', cantidad: i.cantidad ?? 1, valor_unitario: i.valor_unitario ?? 0,
    }))
  }
  if (registro) {
    return [{
      referencia: registro.referencia ?? '',
      cantidad: Number(registro.cantidad) || 1,
      valor_unitario: Number(registro.valor_unitario) || 0,
    }]
  }
  return [itemVacio()]
}

const mensajeError = (e) =>
  e.message + (/schema cache|column|relation/i.test(e.message)
    ? ' — Ejecuta supabase_schema.sql en Supabase (SQL Editor) y recarga la página.'
    : '')

export default function CotizacionForm({ registro, user, onClose, onSaved }) {
  const [f, setF] = useState(registro ? { ...VACIO, ...registro } : VACIO)
  const [items, setItems] = useState(() => itemsIniciales(registro))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const total = items.reduce((a, i) => a + (Number(i.cantidad) || 0) * (Number(i.valor_unitario) || 0), 0)
  const cantidadTotal = items.reduce((a, i) => a + (Number(i.cantidad) || 0), 0)

  const set = (k, v) => setF((p) => {
    const n = { ...p, [k]: v }
    if (k === 'fecha_envio' && v) {
      n.semana = semanaISO(v)
      n.mes = MESES[new Date(v + 'T00:00:00').getMonth()]
    }
    return n
  })

  // Selector de cantidad de ítems: genera o recorta filas
  const setNumItems = (valor) => {
    const n = Math.min(MAX_ITEMS, Math.max(1, Math.floor(Number(valor)) || 1))
    if (n < items.length) {
      const seVanConDatos = items.slice(n).some((i) => i.referencia.trim())
      if (seVanConDatos && !window.confirm(`Se quitarán ${items.length - n} ítem(s) con datos. ¿Continuar?`)) return
      setItems(items.slice(0, n))
    } else if (n > items.length) {
      setItems([...items, ...Array.from({ length: n - items.length }, itemVacio)])
    }
  }

  const setItem = (idx, k, v) => setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [k]: v } : it)))

  const guardar = async (e) => {
    e.preventDefault()
    setError('')

    const itemsLimpios = items.map((i) => ({
      referencia: String(i.referencia).trim(),
      cantidad: Number(i.cantidad),
      valor_unitario: Number(i.valor_unitario),
    }))
    const invalido = itemsLimpios.some(
      (i) => !i.referencia || !(i.cantidad > 0) || Number.isNaN(i.valor_unitario) || i.valor_unitario < 0
    )
    if (invalido) {
      setError('Completa todos los ítems: referencia, cantidad (mayor a 0) y valor unitario.')
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

    const totalItems = itemsLimpios.reduce((a, i) => a + i.cantidad * i.valor_unitario, 0)
    const cantTotal = itemsLimpios.reduce((a, i) => a + i.cantidad, 0)
    payload.items = itemsLimpios
    payload.referencia = itemsLimpios.map((i) => i.referencia).join(' / ')
    payload.cantidad = cantTotal
    payload.valor_unitario = cantTotal ? Math.round((totalItems / cantTotal) * 100) / 100 : 0 // promedio ponderado
    payload.valor_total = totalItems

    if (registro?.id) {
      const { error } = await supabase.from('cotizaciones').update(payload).eq('id', registro.id)
      if (error) { setError(mensajeError(error)); setGuardando(false); return }
      await registrarAuditoria({
        usuario_email: user.email, accion: 'EDITAR', registro_id: registro.id,
        n_cotizacion: payload.n_cotizacion, campos_modificados: diffCampos(registro, payload),
      })
    } else {
      const { data, error } = await supabase.from('cotizaciones').insert(payload).select().single()
      if (error) { setError(mensajeError(error)); setGuardando(false); return }
      await registrarAuditoria({
        usuario_email: user.email, accion: 'CREAR', registro_id: data.id,
        n_cotizacion: data.n_cotizacion, campos_modificados: payload,
      })
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
      <form onSubmit={guardar} className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-white/10 bg-[#141a3d] p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">{registro ? 'Editar cotización' : 'Nueva cotización'}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {campo('fecha_envio', 'Fecha Envío', 'date')}
          {campo('semana', 'Semana', 'number')}
          {campo('mes', 'Mes')}
          {campo('n_cotizacion', 'N° Cotización', 'text', { required: true })}
          {campo('contacto', 'Contacto')}
          {campo('cliente', 'Cliente', 'text', { required: true })}
        </div>

        {/* ÍTEMS A COTIZAR */}
        <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-white">Ítems a cotizar</p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">¿Cuántos ítems?</span>
              <button type="button" onClick={() => setNumItems(items.length - 1)} disabled={items.length <= 1}
                className="h-8 w-8 rounded-lg border border-white/15 text-white hover:bg-white/10 disabled:opacity-40">−</button>
              <input type="number" min="1" max={MAX_ITEMS} value={items.length} onChange={(e) => setNumItems(e.target.value)}
                className="h-8 w-16 rounded-lg border border-white/10 bg-[#0b1026]/70 text-center text-sm text-white outline-none focus:border-blue-500" />
              <button type="button" onClick={() => setNumItems(items.length + 1)} disabled={items.length >= MAX_ITEMS}
                className="h-8 w-8 rounded-lg border border-white/15 text-white hover:bg-white/10 disabled:opacity-40">+</button>
            </div>
          </div>

          <div className="space-y-3">
            {items.map((it, idx) => {
              const sub = (Number(it.cantidad) || 0) * (Number(it.valor_unitario) || 0)
              return (
                <div key={idx} className="grid grid-cols-1 items-end gap-3 rounded-lg border border-white/10 bg-[#0b1026]/40 p-3 sm:grid-cols-12">
                  <div className="sm:col-span-1 text-xs font-semibold text-violet-300">Ítem {idx + 1}</div>
                  <div className="sm:col-span-4">
                    <label className={label}>Referencia</label>
                    <input value={it.referencia} onChange={(e) => setItem(idx, 'referencia', e.target.value)} className={input} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={label}>Cantidad</label>
                    <input type="number" min="0" step="any" value={it.cantidad} onChange={(e) => setItem(idx, 'cantidad', e.target.value)} className={input} />
                  </div>
                  <div className="sm:col-span-3">
                    <label className={label}>Valor unitario</label>
                    <input type="number" min="0" step="any" value={it.valor_unitario} onChange={(e) => setItem(idx, 'valor_unitario', e.target.value)} className={input} />
                  </div>
                  <div className="sm:col-span-2 text-right">
                    <label className={label}>Subtotal</label>
                    <p className="py-2 text-sm font-semibold text-violet-300">{cop(sub)}</p>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-3 flex flex-wrap justify-end gap-6 text-sm">
            <span className="text-slate-400">Unidades: <b className="text-white">{cantidadTotal}</b></span>
            <span className="text-slate-400">Valor Total (auto): <b className="text-violet-300">{cop(total)}</b></span>
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
          {campo('renta', 'Renta', 'number', { step: 'any' })}
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
