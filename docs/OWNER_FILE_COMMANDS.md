# Comandos de código para owners — Aura Reed

## Origen y estructura

Basado en los archivos entregados savefile.js y getcode.js. Los originales utilizaban handler.exec, handler.alias y handler.owner. La adaptación usa CommandPlugin con export default, name, category, ownerOnly y run(ctx).

- cmd/system/savefile.ts: alias savefile, guardararchivo, creararchivo.
- cmd/system/getcode.ts: alias getcode, getfile, gc.
- core/ownerFileWorkspace.ts: seguridad de rutas, lectura, extracción de citas y almacenamiento aislado.
- scripts/test-owner-files.mjs y scripts/test-owner-file-commands.mjs: pruebas automatizadas.

Se descartaron los alias genéricos save y guardar para evitar futuras colisiones.

## Comandos

Se muestran con el prefijo de ejemplo $, que puede cambiar por socket o grupo:

- $savefile cmd/system/ejemplo.ts — responde a un mensaje que contiene el código o escribe el código después de la ruta.
- $savefile cmd/system/ejemplo.ts — crea el archivo preparado o, si ya existe, lo actualiza directamente sin argumento adicional.
- $getcode ping — busca el archivo por nombre y envía el código del comando activo.
- $getcode ping.ts — también admite la extensión del archivo.
- $getcode filech — permite buscar mediante el inicio del nombre; si hay varias coincidencias igualmente relevantes, lista las rutas.
- $getcode cmd/system/ping.ts — la ruta exacta continúa siendo opcional.
- $getcode cmd/system — lista archivos y carpetas autorizadas.
- $getcode staged/cmd/system/ejemplo.ts — recupera el código preparado.

Estas acciones exigen el rol owner global, tanto en grupos como en chats privados. Nunca se admiten solicitudes de usuarios sin el rol owner verificado por el bot. La ejecución en grupos es visible para sus integrantes: no se deben compartir archivos de código sensibles allí.

## Diseño visual oficial de Aura Reed

Se revisaron `cmd/system/filecheck.ts`, `cmd/system/ping.ts`, `cmd/system/sysdiag.ts` y las plantillas originales en `src/langs/es.lang.json`. `savefile` y `getcode` emplean desde ahora el mismo formato estilizado en respuestas y leyendas de documentos:

- Encabezado `╭〔 ... AURA REED ... 〕━⬣` con `fytBold` y el nombre traducible del bot.
- Separador `╰━━━━━━━━━━━━⬣` y bloques informativos `╭─〔 ... 〕` con filas `┃`.
- Estados visuales de ayuda, éxito y error, finalizando en `╰〔 ⚡ SYSTEM INFO 〕⬣`.
- Captions de documentos que mantienen nombre, ruta, tamaño, resultado y seguridad en el mismo marco.
- Un único generador reutilizable en `core/ownerFileDesign.ts` para evitar divergencias entre comandos.

El diseño no cambia las operaciones, permisos, búsqueda por nombre ni aislamiento. Las respuestas del bot mantienen su formato visible también en chats grupales. No se ha alterado el sistema central de traducciones.

Prueba adicional: `scripts/test-owner-file-design.mjs`. Se ejecutaron localmente las tres baterías de comandos, rutas y diseño visual mediante Node.js 22.16.0: **26 pruebas aprobadas; 0 fallidas**. Las huellas de los cuatro archivos nuevos/editados usados en las pruebas locales coinciden con los archivos de la rama `test`.

## Aislamiento y seguridad

savefile almacena los archivos en la carpeta local .aura-owner-staging/ dentro de la raíz del proyecto. Esta carpeta no se importa mediante el cargador de comandos y se excluye mediante .gitignore. Ningún cambio generado por savefile se instala directamente en cmd/, core/ o la rama master. Las escrituras no actualizan GitHub automáticamente: para asegurar los archivos preparados en GitHub se requiere una revisión y commit normal.

El sistema rechaza rutas absolutas, enlaces simbólicos, ascensos de directorio, barras invertidas, archivos ocultos, nombres relacionados con credenciales, sesiones, claves, variables de entorno, configuración privada y copias de seguridad. Se usan extensiones autorizadas y límites de tamaño (128 KiB al guardar; 1 MiB al leer). El mismo comando crea o sobrescribe automáticamente el archivo preparado; no es necesario usar --replace. Los ficheros se guardan de manera atómica con permisos restrictivos.

La búsqueda por nombre recorre las carpetas autorizadas, sin leer el contenido durante el recorrido; ignora enlaces simbólicos y ubicaciones sensibles. Prioriza coincidencias exactas y los comandos de cmd/ frente a sus copias de test/. Si encuentra múltiples resultados de igual prioridad, informa sus rutas para elegir el archivo correcto. La lectura conserva el nombre y extensión real del archivo, y se entrega como documento de texto. No se recomienda compartir los archivos recibidos: un archivo de código permitido podría tener información sensible incrustada.

## Pruebas

Ejecución local con Node.js 22.16.0:

node --experimental-strip-types --test scripts/test-owner-files.mjs scripts/test-owner-file-commands.mjs scripts/test-owner-file-design.mjs

La batería incluye las pruebas originales y casos adicionales de ejecución en grupos. El resultado consolidado requiere volver a ejecutar el CI después de estos cambios. Se verifica:
- Lectura permitida, listado de directorios y búsqueda de archivos por nombre sin ruta.
- Bloqueo de rutas ascendentes, secretos y sesiones incluso durante búsquedas por nombre.
- Creación en área aislada sin tocar el archivo real.
- Rechazo de enlaces simbólicos y de tamaño excesivo.
- Extracción de código de un mensaje citado.
- Rechazo de usuarios no owner en grupos y privados; ejecución correcta de ambos comandos por owners dentro de grupos.
- Recuperación de archivos preparados con getcode indicando únicamente su nombre.
- Reemplazo automático del archivo preparado, manteniendo intactos los archivos activos.
- Errores seguros al consultar rutas prohibidas.

El workflow de auditoría está preparado para ejecutar las pruebas. El resultado local no demuestra funcionamiento de un socket real ni reemplaza la ejecución de GitHub Actions.

## Integración

Desarrollar en test, ejecutar la auditoría y fusionar a master una vez validados los cambios. La fusión en GitHub no actualiza automáticamente el servidor: comprobar el commit cargado en la instancia activa antes de dar por completado el despliegue. No reiniciar todos los sockets.

<!-- Hecho por Lourtnyx Matterssmith [Lou-Nyx]. -->
