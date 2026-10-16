import { useMemo, useState } from 'react'

const cop = (n) => (Number(n) || 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const input = 'w-full rounded-lg border border-white/10 bg-[#0b1026]/70 px-3 py-2 text-sm text-white outline-none focus:border-blue-500'

export default function Cotizador({ cotizaciones }) {
  const clientes = useMemo(() => [...new Set(cotizaciones.map((c) => c.cliente).filter(Boolean))].sort(), [cotizaciones])
  const [cliente, setCliente] = useState('')
  const [referencia, setReferencia] = useState('')
  const [cantidad, setCantidad] = useState(1)
  const [valor, setValor] = useState(0)

  const referencias = useMemo(
    () => [...new Set(cotizaciones.filter((c) => !cliente || c.cliente === cliente).map((c) => c.referencia).filter(Boolean))],
    [cotizaciones, cliente]
  )

  // Al elegir una referencia sugiere el último valor unitario usado
  const elegirReferencia = (ref) => {
    setReferencia(ref)
    const prev = cotizaciones.find((c) => c.referencia === ref && (!cliente || c.cliente === cliente))
    if (prev?.valor_unitario) setValor(prev.valor_unitario)
  }

  const subtotal = (Number(cantidad) || 0) * (Number(valor) || 0)
  const iva = subtotal * 0.19
  const total = subtotal + iva

  return (
    <div className="grid gap-6 p-4 lg:grid-cols-2">
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs text-slate-400">Cliente</label>
          <select value={cliente} onChange={(e) => { setCliente(e.target.value); setReferencia('') }} className={input}>
            <option value="">Seleccionar cliente…</option>
            {clientes.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">Referencia</label>
          <input list="refs" value={referencia} onChange={(e) => elegirReferencia(e.target.value)} className={input} placeholder="Escribe o elige…" />
          <datalist id="refs">{referencias.map((r) => <option key={r} value={r} />)}</datalist>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Cantidad</label>
            <input type="number" min="0" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className={input} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Valor unitario</label>
            <input type="number" min="0" value={valor} onChange={(e) => setValor(e.target.value)} className={input} />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#1b2150] to-[#2a1458] p-5">
        <p className="text-xs uppercase tracking-wider text-violet-300">Vista previa de cotización</p>
        <h3 className="mt-1 text-lg font-semibold text-white">{cliente || 'Cliente sin seleccionar'}</h3>
        <p className="text-xs text-slate-400">{new Date().toLocaleDateString('es-CO')}</p>
        <table className="mt-4 w-full text-sm text-slate-200">
          <thead className="text-xs text-slate-400">
            <tr><th className="text-left">Referencia</th><th className="text-right">Cant.</th><th className="text-right">V. Unit.</th><th className="text-right">Total</th></tr>
          </thead>
          <tbody>
            <tr className="border-t border-white/10">
              <td className="py-2">{referencia || '—'}</td>
              <td className="text-right">{cantidad}</td>
              <td className="text-right">{cop(valor)}</td>
              <td className="text-right">{cop(subtotal)}</td>
            </tr>
          </tbody>
        </table>
        <div className="mt-4 space-y-1 border-t border-white/10 pt-3 text-sm">
          <div className="flex justify-between text-slate-300"><span>Subtotal</span><span>{cop(subtotal)}</span></div>
          <div className="flex justify-between text-slate-300"><span>IVA (19%)</span><span>{cop(iva)}</span></div>
          <div className="flex justify-between text-base font-semibold text-white"><span>Total</span><span>{cop(total)}</span></div>
        </div>
        <button onClick={() => window.print()} className="mt-4 w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-500">
          Imprimir / Guardar PDF
        </button>
      </div>
    </div>
  )
}
