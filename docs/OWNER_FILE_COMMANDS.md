# Adaptación de savefile y getcode a Aura Reed — rama test

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
- $savefile cmd/system/ejemplo.ts --replace — sustituye una versión preparada anteriormente; no modifica el comando operativo.
- $getcode cmd/system/ping.ts — envía el código autorizado como documento.
- $getcode cmd/system — lista archivos y carpetas autorizadas.
- $getcode staged/cmd/system/ejemplo.ts — recupera el código preparado.

Estas acciones exigen el rol owner global, tanto en grupos como en chats privados. Nunca se admiten solicitudes de usuarios sin el rol owner verificado por el bot. La ejecución en grupos es visible para sus integrantes: no se deben compartir archivos de código sensibles allí.

## Aislamiento y seguridad

savefile almacena los archivos en la carpeta local .aura-owner-staging/ dentro de la raíz del proyecto. Esta carpeta no se importa mediante el cargador de comandos y se excluye mediante .gitignore. Ningún cambio generado por savefile se instala directamente en cmd/, core/ o la rama master. Las escrituras no actualizan GitHub automáticamente: para asegurar los archivos preparados en GitHub se requiere una revisión y commit normal.

El sistema rechaza rutas absolutas, enlaces simbólicos, ascensos de directorio, barras invertidas, archivos ocultos, nombres relacionados con credenciales, sesiones, claves, variables de entorno, configuración privada y copias de seguridad. Se usan extensiones autorizadas y límites de tamaño (128 KiB al guardar; 1 MiB al leer). Se exige --replace para sustituir un archivo ya preparado. Los ficheros se guardan de manera atómica con permisos restrictivos.

La lectura conserva el nombre y extensión real del archivo, y se entrega como documento de texto. No se recomienda compartir los archivos recibidos: un archivo de código permitido podría tener información sensible incrustada.

## Pruebas

Ejecución local con Node.js 22.16.0:

node --experimental-strip-types --test scripts/test-owner-files.mjs scripts/test-owner-file-commands.mjs

La batería incluye las pruebas originales y casos adicionales de ejecución en grupos. El resultado consolidado requiere volver a ejecutar el CI después de estos cambios. Se verifica:
- Lectura permitida y listado de directorios.
- Bloqueo de rutas ascendentes, secretos y sesiones.
- Creación en área aislada sin tocar el archivo real.
- Rechazo de enlaces simbólicos y de tamaño excesivo.
- Extracción de código de un mensaje citado.
- Rechazo de usuarios no owner en grupos y privados; ejecución correcta de ambos comandos por owners dentro de grupos.
- Recuperación de archivos preparados con getcode.
- Reemplazo únicamente mediante --replace.
- Errores seguros al consultar rutas prohibidas.

El workflow de auditoría está preparado para ejecutar las pruebas. El resultado local no demuestra funcionamiento de un socket real ni reemplaza la ejecución de GitHub Actions.

## Integración

Conservar los cambios exclusivamente en test hasta validar un socket de ensayo en un chat privado y en un grupo de prueba y comprobar la auditoría. No reiniciar todos los sockets ni fusionar a master por el mero hecho de que el código exista.

<!-- Hecho por Lourtnyx Matterssmith [Lou-Nyx]. -->
