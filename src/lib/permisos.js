// Permisos que el super admin puede asignar a cada vendedor
export const PERMISOS = [
  { k: 'ver_todas_cotizaciones', t: 'Ver cotizaciones de todo el equipo (seguimiento)' },
  { k: 'cotizaciones_crear', t: 'Crear cotizaciones' },
  { k: 'cotizaciones_editar', t: 'Editar registros' },
  { k: 'cotizaciones_eliminar', t: 'Eliminar registros' },
  { k: 'agenda', t: 'Agenda y alertas' },
  { k: 'cotizador', t: 'Cotizador' },
  { k: 'historial', t: 'Ver historial / auditoría' },
]

export const ROLES = {
  super_admin: { t: 'Super Admin', desc: 'Todo: ve todas las cotizaciones, audita y administra usuarios y permisos.' },
  vendedor: { t: 'Vendedor', desc: 'Ve solo sus cotizaciones. El resto depende de los permisos que se le asignen.' },
  sin_acceso: { t: 'Sin acceso', desc: 'Cuenta nueva: no ve nada hasta que se le asigne un rol.' },
}

// Permisos que se aplican al elegir un rol (luego se afinan con las casillas)
export const PRESETS = {
  vendedor: {
    ver_todas_cotizaciones: false, cotizaciones_crear: true, cotizaciones_editar: true, cotizaciones_eliminar: false,
    agenda: true, cotizador: true, historial: false,
  },
  sin_acceso: {},
}

// Cuenta activa con rol super_admin o vendedor
export const esMiembro = (perfil) =>
  !!perfil && perfil.activo !== false && ['super_admin', 'vendedor'].includes(perfil.rol)

// Misma lógica que la función tiene_permiso() de la base de datos
export const tiene = (perfil, permiso) =>
  !!perfil &&
  perfil.activo !== false &&
  (perfil.rol === 'super_admin' || (perfil.rol === 'vendedor' && perfil.permisos?.[permiso] === true))
