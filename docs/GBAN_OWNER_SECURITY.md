# GBAN: operadores autorizados e inmunidad de owners

Alcance: repositorio jbeckforddev/Aura-Bot-2.0, rama test. No fusionar con master hasta pasar verificación operativa.

## Operadores del comando

Se conserva el controlador anterior y se añaden los dos números autorizados por la administración:

- Controlador anterior: +57 311 835 3868.
- Nuevo operador: +52 55 3817 6300.
- Nuevo operador: +506 7237 3785.

Para los dos operadores nuevos el comando exige **además** que el sistema principal haya verificado `ctx.isOwner`. El teléfono registrado puede recibirse como JID o como LID: se compara contra `globalThis.DEFAULT_USER_ROLES` únicamente cuando corresponde a un owner configurado. Una mención o un número escrito por otra persona no conceden permisos.

El resto de los owners no recibe automáticamente permiso para **ejecutar** `gban`, pero sí conserva su protección frente a las sanciones.

La protección no habilita el privilegio excepcional del creador original: el indicador interno de administrador supremo sigue separado de la comprobación general de inmunidad.

## Inmunidad obligatoria

No se permite aplicar `gban` a cuentas que figuren como owner o coowner en los roles predeterminados o en la base de datos persistente. La comprobación incluye el número telefónico, JID, LID y equivalencias conocidas, y se usa en:

- Creación manual de casos de gban.
- Recuperación de sanciones previas de SQLite/estado.
- Consulta del índice de números y LID sancionados.
- Expulsiones automáticas al ingresar a grupos y barridos de grupos ya abiertos.

Los registros heredados detectados para owners protegidos se eliminan del índice y la persistencia durante la conciliación. No se agregan nuevas restricciones a cuentas con identidad validada como owner.

Cuando una cuenta todavía no puede vincularse a un número o LID conocido, la inmunidad depende de la información disponible de WhatsApp, DEFAULT_USER_ROLES y AuraDB. Para evitar errores, las identidades de owners deben mantenerse correctamente vinculadas en la base de datos y comprobarse en grupos de prueba antes de desplegar el barrido automático.

## Uso

- `$gban @usuario motivo` o `$gban número motivo` — solo los operadores autorizados.
- `$checkban @usuario` — consulta el caso sin crear sanciones.
- `$ungban número` — levanta una sanción conforme a los permisos existentes.
- `$antiraid status` — revisa la protección del grupo.

El prefijo `$` es un ejemplo; se respeta el prefijo configurado en cada socket.

## Pruebas realizadas

Archivo: `scripts/test-antiraid-owners.mjs`, con ocho escenarios de política de identidad. La batería prueba autorización antigua y nueva, rechazo de no owners, resolución JID/LID, inmunidad de owner/coowner, rol dinámico, usuarios normales, distinción teléfono/LID y comportamiento cuando falla el repositorio de roles.

Estas pruebas comprueban la política sin iniciar sockets, sin expulsar personas y sin modificar la base de producción. Aún falta comprobar con un socket real y participantes de prueba los flujos integrados de WhatsApp/Anti-Raid y el barrido de grupos.

<!-- Hecho por Lourtnyx Matterssmith [Lou-Nyx]. -->
