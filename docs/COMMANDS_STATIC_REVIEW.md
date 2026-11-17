# Auditoría estructural de comandos — rama test

Fecha: 16–17 de noviembre de 2026. Inspección directa de archivos GitHub, sin ejecutar comandos en sockets reales.

## Alcance

Se inspeccionaron **237 archivos** JS/TS dentro de `cmd/` en la rama `test`, distribuidos:

| Categoría | Archivos |
|---|---:|
| AI | 5 |
| NSFW | 4 |
| download | 18 |
| economy | 20 |
| funy | 9 |
| gacha | 25 |
| games | 17 |
| group | 41 |
| interaccion | 1 |
| profile | 13 |
| search | 7 |
| socket | 13 |
| stalk | 1 |
| sticker | 10 |
| system | 40 |
| utils | 13 |
| **TOTAL** | **237** |

En la revisión textual se comprobó presencia de exportación por defecto, método de ejecución y concordancia de categoría con la carpeta. Los wrappers de economía que usan `createEconomyActivity` exponen `run` mediante la fábrica, no literalmente en el archivo de comando.

## Excepciones legítimas del escaneo de nombres

- `cmd/NSFW/interactionsNSFW.ts`: nombres obtenidos de `Object.keys(DATA)` con su JSON.
- `cmd/interaccion/interacciónSFW.ts`: nombres obtenidos de `Object.keys(DATA)` con su JSON.
- `cmd/download/y2Mate.ts`: falso positivo de la búsqueda textual inicial por anotación `name: string`; el comando sí declara un array `name` literal.

Estas tres particularidades no demuestran un fallo. Deben validarse con el analizador AST completo `scripts/audit-static.cjs` o el comando `filecheck`.

## Correcciones guardadas

- `core/gachaActions.ts`: `waifusboard` ahora procesa una mención y devuelve la posición del usuario; sin mención muestra el ranking.
- `cmd/gacha/gachacheck.ts`: consulta de Aura.db con apertura de SQLite de solo lectura y `SELECT COUNT(*)`, sin crear usuarios.
- `scripts/test-gacha-static.cjs`: contempla 25 módulos Gacha, incluido `gachacheck`.

## Validación pendiente, obligatoria para afirmar funcionamiento

- Ejecutar `node scripts/audit-static.cjs` con TypeScript instalado y revisar las incidencias reales.
- Ejecutar `node scripts/test-gacha-static.cjs`.
- Ejecutar `node --import=tsx --test scripts/test-gacha-db.ts` sobre su sandbox SQLite temporal.
- Validar mensajes, permisos, menciones y sesiones desde un socket separado antes de actualizar múltiples sockets.
- Verificar servicios remotos de descargas, IA y búsqueda, que pueden cambiar o fallar independientemente del código.

**Resultado correcto:** estructura observada en 237 archivos. **No equivale a 237 comandos probados**. GitHub Actions presentó trabajos fallidos sin pasos registrados, por lo que no se dispone de resultados de CI válidos.

<!-- Hecho por Lourtnyx Matterssmith [Lou-Nyx]. -->
