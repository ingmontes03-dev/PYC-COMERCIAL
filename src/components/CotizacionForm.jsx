import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { diffCampos, registrarAuditoria } from '../lib/auditoria'

const VACIO = {
  fecha_envio: '', semana: '', mes: '', n_cotizacion: '', contacto: '', cliente: '', referencia: '',
  cantidad: 0, valor_unitario: 0, estado: 'Pendiente', motivo_negacion: '', fecha_op: '', num_op: '',
  valor_aprobado: '', renta: '', n_factura: '', fecha_facturacion: '',
}

const input = 'w-full rounded-lg border border-white/10 bg-[#0b1026]/70 px-3 py-2 text-sm text-white outline-none focus:border-blue-500'
const label = 'mb-1 block text-xs text-slate-400'

function semanaISO(fecha) {
  const d = new Date(fecha + 'T00:00:00')
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7))
  const inicio = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t - inicio) / 86400000 + 1) / 7)
}

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export default function CotizacionForm({ registro, user, onClose, onSaved }) {
  const [f, setF] = useState(registro ? { ...VACIO, ...registro } : VACIO)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const total = (Number(f.cantidad) || 0) * (Number(f.valor_unitario) || 0)

  const set = (k, v) => setF((p) => {
    const n = { ...p, [k]: v }
    if (k === 'fecha_envio' && v) {
      n.semana = semanaISO(v)
      n.mes = MESES[new Date(v + 'T00:00:00').getMonth()]
    }
    return n
  })

  const guardar = async (e) => {
    e.preventDefault()
    setGuardando(true)
    setError('')

    // Limpia vacíos -> null y números
    const payload = {}
    Object.keys(VACIO).forEach((k) => {
      let v = f[k]
      if (v === '') v = null
      if (['cantidad', 'valor_unitario', 'valor_aprobado', 'renta', 'semana'].includes(k) && v !== null) v = Number(v)
      payload[k] = v
    })

    if (registro?.id) {
      const { error } = await supabase.from('cotizaciones').update(payload).eq('id', registro.id)
      if (error) { setError(error.message); setGuardando(false); return }
      await registrarAuditoria({
        usuario_email: user.email, accion: 'EDITAR', registro_id: registro.id,
        n_cotizacion: payload.n_cotizacion, campos_modificados: diffCampos(registro, payload),
      })
    } else {
      const { data, error } = await supabase.from('cotizaciones').insert(payload).select().single()
      if (error) { setError(error.message); setGuardando(false); return }
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
          {campo('referencia', 'Referencia')}
          {campo('cantidad', 'Cantidad', 'number', { min: 0, step: 'any' })}
          {campo('valor_unitario', 'Valor Unitario', 'number', { min: 0, step: 'any' })}
          <div>
            <label className={label}>Valor Total (auto)</label>
            <div className={`${input} bg-violet-500/10 font-semibold text-violet-300`}>
              {total.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })}
            </div>
          </div>
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
