// Catálogo de permisos que el super admin puede asignar a cada cuenta
export const PERMISOS = [
  { k: 'cotizaciones_ver', t: 'Ver cotizaciones y KPIs' },
  { k: 'cotizaciones_crear', t: 'Crear cotizaciones' },
  { k: 'cotizaciones_editar', t: 'Editar cotizaciones' },
  { k: 'cotizaciones_eliminar', t: 'Eliminar cotizaciones' },
  { k: 'agenda', t: 'Agenda y alertas' },
  { k: 'historial', t: 'Historial de auditoría' },
  { k: 'cotizador', t: 'Cotizador' },
  { k: 'llamadas', t: 'Llamadas / Base de datos' },
]

// Permisos que dependen de poder ver las cotizaciones
export const REQUIEREN_VER = ['cotizaciones_crear', 'cotizaciones_editar', 'cotizaciones_eliminar']

export const tiene = (perfil, permiso) =>
  !!perfil &&
  perfil.activo !== false &&
  (perfil.rol === 'super_admin' || perfil.permisos?.[permiso] === true)
