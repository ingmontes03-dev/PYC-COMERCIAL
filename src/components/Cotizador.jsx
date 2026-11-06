import { useMemo, useState } from 'react'
import useEmpresas from '../lib/useEmpresas'

const cop = (n) => (Number(n) || 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const input = 'w-full rounded-lg border border-white/10 bg-[#0b1026]/70 px-3 py-2 text-sm text-white outline-none focus:border-blue-500'
const label = 'mb-1 block text-xs text-slate-400'
const chip = 'rounded-full border border-white/15 px-3 py-1 text-xs text-slate-200 hover:bg-white/10'

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const fechaCot = (c) => String(c.fecha_envio || c.created_at || '').slice(0, 10)
const lineaVacia = () => ({ producto: '', color: '', cantidad: 1, valor: '' })

// Productos de una cotización (las antiguas sin ítems se leen de referencia / cantidad / valor unitario)
function itemsDe(c) {
  if (Array.isArray(c.items) && c.items.length) {
    return c.items.map((i) => ({
      producto: String(i.producto ?? i.referencia ?? ''),
      color: String(i.color ?? ''),
      valor: Number(i.valor_unitario) || 0,
    }))
  }
  return c.referencia ? [{ producto: String(c.referencia), color: '', valor: Number(c.valor_unitario) || 0 }] : []
}

// Catálogo vivo: se arma con TODAS las cotizaciones visibles, así cada cotización nueva lo retroalimenta
function armarCatalogo(cotizaciones) {
  const mapa = new Map()
  for (const c of cotizaciones) {
    const fecha = fechaCot(c)
    const kc = norm(c.cliente)
    for (const it of itemsDe(c)) {
      const key = norm(it.producto)
      if (!key) continue
      let p = mapa.get(key)
      if (!p) {
        p = { key, nombre: it.producto.trim(), veces: 0, aprobadas: 0, precios: [], ultimo: null, colores: new Map(), clientes: new Map() }
        mapa.set(key, p)
      }
      p.veces += 1
      if (c.estado === 'Aprobado') p.aprobadas += 1
      const reg = { valor: it.valor, color: it.color.trim(), fecha, cliente: c.cliente || '', n: c.n_cotizacion || '' }
      if (it.valor > 0) {
        p.precios.push(it.valor)
        if (!p.ultimo || fecha > p.ultimo.fecha) p.ultimo = reg
      }
      if (reg.color) p.colores.set(reg.color, (p.colores.get(reg.color) || 0) + 1)
      if (kc) {
        const cur = p.clientes.get(kc)
        if (!cur) p.clientes.set(kc, { ...reg, veces: 1 })
        else if (it.valor > 0 && (!cur.valor || fecha >= cur.fecha)) p.clientes.set(kc, { ...reg, veces: cur.veces + 1 })
        else cur.veces += 1
      }
    }
  }
  return [...mapa.values()]
    .map((p) => ({
      ...p,
      promedio: p.precios.length ? Math.round(p.precios.reduce((a, b) => a + b, 0) / p.precios.length) : 0,
      min: p.precios.length ? Math.min(...p.precios) : 0,
      max: p.precios.length ? Math.max(...p.precios) : 0,
      colorFrecuente: [...p.colores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '',
    }))
    .sort((a, b) => b.veces - a.veces || a.nombre.localeCompare(b.nombre))
}

export default function Cotizador({ cotizaciones, onCrear }) {
  const clientes = useEmpresas() // empresas de la Base de Datos
  const catalogo = useMemo(() => armarCatalogo(cotizaciones), [cotizaciones])
  const [cliente, setCliente] = useState('')
  const [lineas, setLineas] = useState([lineaVacia()])
  const [busqueda, setBusqueda] = useState('')

  const kCliente = norm(cliente)
  const buscar = (nombre) => catalogo.find((p) => p.key === norm(nombre))

  // Lo que ya se le cotizó a este cliente y lo que más se repite en general
  const delCliente = useMemo(
    () => (kCliente ? catalogo.filter((p) => p.clientes.has(kCliente)).sort((a, b) => b.clientes.get(kCliente).veces - a.clientes.get(kCliente).veces).slice(0, 10) : []),
    [catalogo, kCliente]
  )
  const repetidos = useMemo(() => catalogo.filter((p) => p.veces >= 2).slice(0, 10), [catalogo])

  // Precio y color sugeridos: primero lo último que se le cotizó a ESTE cliente, luego lo último en general
  const sugerido = (p) => {
    const previo = (kCliente && p.clientes.get(kCliente)) || p.ultimo
    return { valor: previo?.valor || p.ultimo?.valor || '', color: previo?.color || p.colorFrecuente || '' }
  }

  const setLinea = (i, k, v) => setLineas((prev) => prev.map((l, j) => (j === i ? { ...l, [k]: v } : l)))

  const elegirProducto = (i, nombre) => {
    const p = buscar(nombre)
    setLineas((prev) => prev.map((l, j) => {
      if (j !== i) return l
      if (!p) return { ...l, producto: nombre }
      const s = sugerido(p)
      return { ...l, producto: nombre, color: l.color || s.color, valor: s.valor || l.valor }
    }))
  }

  const agregarDelCatalogo = (p) => {
    const s = sugerido(p)
    const nueva = { producto: p.nombre, color: s.color, cantidad: 1, valor: s.valor }
    setLineas((prev) => (prev.length === 1 && !prev[0].producto.trim() && !String(prev[0].valor).trim() ? [nueva] : [...prev, nueva]))
  }

  const quitar = (i) => setLineas((prev) => (prev.length === 1 ? [lineaVacia()] : prev.filter((_, j) => j !== i)))

  const total = (l) => (Number(l.cantidad) || 0) * (Number(l.valor) || 0)
  const subtotal = lineas.reduce((a, l) => a + total(l), 0)
  const iva = subtotal * 0.19
  const conDatos = lineas.filter((l) => l.producto.trim())

  const crearCotizacion = () => {
    onCrear?.({
      cliente,
      items: conDatos.map((l) => ({
        producto: l.producto.trim(), color: l.color.trim(), cantidad: Number(l.cantidad) || 1, valor_unitario: Number(l.valor) || 0,
      })),
    })
  }

  const filas = useMemo(() => {
    const q = norm(busqueda)
    return (q ? catalogo.filter((p) => p.key.includes(q)) : catalogo).slice(0, 15)
  }, [catalogo, busqueda])

  return (
    <div className="space-y-6 p-4">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <label className={label}>Cliente</label>
            <input list="clientes-cotizador" value={cliente} onChange={(e) => setCliente(e.target.value)} className={input} placeholder="Elige uno existente o escribe uno nuevo…" />
            <datalist id="clientes-cotizador">{clientes.map((c) => <option key={c} value={c} />)}</datalist>
          </div>

          {!!delCliente.length && (
            <div>
              <p className="mb-1 text-xs text-slate-400">Ya cotizado a {cliente} (toca para agregar)</p>
              <div className="flex flex-wrap gap-2">
                {delCliente.map((p) => (
                  <button key={p.key} type="button" onClick={() => agregarDelCatalogo(p)} className={chip}
                    title={`${p.clientes.get(kCliente).veces} vez/veces · último ${cop(p.clientes.get(kCliente).valor)}`}>
                    + {p.nombre} <span className="text-slate-400">×{p.clientes.get(kCliente).veces}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {!!repetidos.length && (
            <div>
              <p className="mb-1 text-xs text-slate-400">Productos que más se repiten en las cotizaciones</p>
              <div className="flex flex-wrap gap-2">
                {repetidos.map((p) => (
                  <button key={p.key} type="button" onClick={() => agregarDelCatalogo(p)} className={chip} title={`Último valor: ${cop(p.ultimo?.valor)}`}>
                    + {p.nombre} <span className="text-slate-400">×{p.veces}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <datalist id="productos-cotizador">{catalogo.map((p) => <option key={p.key} value={p.nombre} />)}</datalist>
          <div className="space-y-3">
            {lineas.map((l, i) => {
              const p = buscar(l.producto)
              const previoCliente = p && kCliente ? p.clientes.get(kCliente) : null
              return (
                <div key={i} className="grid grid-cols-2 gap-3 rounded-lg border border-white/10 bg-[#0b1026]/40 p-3 sm:grid-cols-12">
                  <div className="col-span-2 sm:col-span-5">
                    <label className={label}>Producto</label>
                    <input list="productos-cotizador" value={l.producto} onChange={(e) => elegirProducto(i, e.target.value)} className={input} placeholder="Escribe o elige…" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={label}>Color</label>
                    <input value={l.color} onChange={(e) => setLinea(i, 'color', e.target.value)} className={input} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={label}>Cantidad</label>
                    <input type="number" min="0" value={l.cantidad} onChange={(e) => setLinea(i, 'cantidad', e.target.value)} className={input} />
                  </div>
                  <div className="col-span-2 sm:col-span-3">
                    <label className={label}>Valor unitario</label>
                    <input type="number" min="0" value={l.valor} onChange={(e) => setLinea(i, 'valor', e.target.value)} className={input} />
                  </div>
                  {p && (
                    <p className="col-span-2 text-xs text-violet-300 sm:col-span-12">
                      Cotizado {p.veces} {p.veces === 1 ? 'vez' : 'veces'}{p.aprobadas ? ` · ${p.aprobadas} aprobada(s)` : ''}
                      {p.promedio ? ` · promedio ${cop(p.promedio)} (${cop(p.min)} – ${cop(p.max)})` : ''}
                      {previoCliente?.valor ? ` · a este cliente: ${cop(previoCliente.valor)} (${previoCliente.fecha})` : ''}
                    </p>
                  )}
                  <div className="col-span-2 flex justify-end sm:col-span-12">
                    <button type="button" onClick={() => quitar(i)} className="text-xs text-red-300 hover:text-red-200">Quitar</button>
                  </div>
                </div>
              )
            })}
          </div>
          <button type="button" onClick={() => setLineas((p) => [...p, lineaVacia()])} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-100 hover:bg-white/10">+ Agregar producto</button>
        </div>

        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#1b2150] to-[#2a1458] p-5">
          <p className="text-xs uppercase tracking-wider text-violet-300">Vista previa de cotización</p>
          <h3 className="mt-1 text-lg font-semibold text-white">{cliente || 'Cliente sin seleccionar'}</h3>
          <p className="text-xs text-slate-400">{new Date().toLocaleDateString('es-CO')}</p>
          <table className="mt-4 w-full text-sm text-slate-200">
            <thead className="text-xs text-slate-400">
              <tr><th className="text-left">Producto</th><th className="text-right">Cant.</th><th className="text-right">V. Unit.</th><th className="text-right">Total</th></tr>
            </thead>
            <tbody>
              {lineas.map((l, i) => (
                <tr key={i} className="border-t border-white/10">
                  <td className="py-2">{l.producto || '—'}{l.color ? <span className="text-slate-400"> ({l.color})</span> : ''}</td>
                  <td className="text-right">{l.cantidad}</td>
                  <td className="text-right">{cop(l.valor)}</td>
                  <td className="text-right">{cop(total(l))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 space-y-1 border-t border-white/10 pt-3 text-sm">
            <div className="flex justify-between text-slate-300"><span>Subtotal</span><span>{cop(subtotal)}</span></div>
            <div className="flex justify-between text-slate-300"><span>IVA (19%)</span><span>{cop(iva)}</span></div>
            <div className="flex justify-between text-base font-semibold text-white"><span>Total</span><span>{cop(subtotal + iva)}</span></div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => window.print()} className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-500">Imprimir / Guardar PDF</button>
            {onCrear && (
              <button onClick={crearCotizacion} disabled={!conDatos.length}
                className="flex-1 rounded-lg border border-emerald-400/50 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-40">
                Crear cotización con estos ítems
              </button>
            )}
          </div>
          {onCrear && <p className="mt-2 text-xs text-slate-400">Abre el formulario de cotización con el cliente y los productos ya cargados; al guardarla alimenta este catálogo.</p>}
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <p className="text-sm font-semibold text-white">Productos cotizados ({catalogo.length})</p>
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar producto…" className={`${input} max-w-xs`} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-2 py-1 text-left">Producto</th><th className="px-2 py-1 text-right">Veces</th><th className="px-2 py-1 text-right">Aprobadas</th>
                <th className="px-2 py-1 text-right">Último valor</th><th className="px-2 py-1 text-right">Promedio</th><th className="px-2 py-1 text-left">Último cliente</th><th />
              </tr>
            </thead>
            <tbody>
              {!filas.length && <tr><td colSpan={7} className="p-3 text-center text-slate-400">Aún no hay productos cotizados.</td></tr>}
              {filas.map((p) => (
                <tr key={p.key} className="border-t border-white/5">
                  <td className="px-2 py-1 text-white">{p.nombre}</td>
                  <td className="px-2 py-1 text-right">{p.veces}</td>
                  <td className="px-2 py-1 text-right">{p.aprobadas}</td>
                  <td className="px-2 py-1 text-right">{p.ultimo ? cop(p.ultimo.valor) : '—'}</td>
                  <td className="px-2 py-1 text-right">{p.promedio ? cop(p.promedio) : '—'}</td>
                  <td className="px-2 py-1 text-xs text-slate-400">{p.ultimo ? `${p.ultimo.cliente || '—'} · ${p.ultimo.fecha}` : '—'}</td>
                  <td className="px-2 py-1 text-right"><button type="button" onClick={() => agregarDelCatalogo(p)} className="text-xs text-blue-300 hover:text-blue-200">Usar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
