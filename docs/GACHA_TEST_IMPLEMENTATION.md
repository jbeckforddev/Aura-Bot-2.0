# Gacha extendido — estado en rama test

Repositorio: jbeckforddev/Aura-Bot-2.0. Destino exclusivo: test; master no se modifica en este desarrollo.

## Fases guardadas

1. Persistencia — database/gachaMarketDB.ts. Tablas de ofertas, intercambios, favoritos, votos, mensajes personalizados y tiempos de robo. Operaciones sobre GachaOwnership y GachaImageOwnership existentes. Las transferencias usan transacciones SQLite y comprueban al propietario.
2. Operaciones — core/gachaActions.ts. Resolución de personajes y variantes por nombre/ID, destinatarios por mención o cita, valores, paginación y errores.
3. Catálogo y consulta — animeinfo, animelist, wimage, winfo, gtop, htop, waifusboard, tiendawaifus.
4. Colecciones e intercambios — givechar, giveallharem, trade, accepttrade, deletechar. Intercambios con identificador único, caducidad de 10 minutos y aceptación única; eliminación con confirmación.
5. Economía y preferencias — sell, removerventa, buyc, vote, setfav, setclaim, robwaifu. Mercado por grupo, saldo Aura.db, favoritos por grupo, un voto por usuario/personaje/grupo, robo 20% y enfriamiento 12 horas.
6. Comandos preexistentes — ampliación de alias en claim, rw, harem y ginfo; claim por respuesta o por nombre de tirada pendiente (60 segundos); mensaje personalizable; valores con votos en rw, harem y ginfo.
7. Pruebas añadidas — scripts/test-gacha-static.cjs (24 contratos, alias, sintaxis y autoría) y scripts/test-gacha-db.ts (SQLite temporal aislado, compras, JID/LID, regalos, intercambios, votos, favoritos, robo y reclamación).

## Uso

- .rw y .claim respondiendo a una tirada, o .claim Nombre #ID antes de 60 segundos.
- .winfo Nombre, .wimage Nombre #ID, .animeinfo Serie, .animelist 1.
- .sell Nombre #ID 5000, .wshop, .buyc Nombre #ID, .removerventa Nombre #ID.
- .givechar @usuario Nombre #ID y .giveallharem @usuario.
- .trade @usuario NombrePropio #ID / NombreAjeno #ID; destinatario .accepttrade ID.
- .deletechar Nombre #ID confirmar.
- .setfav Nombre #ID; .setfav consulta favorito propio; .wfav top de favoritos; .delfav elimina.
- .setclaim Hola {user}: reclamaste {character}; .delclaimmsg restablece.
- .vote Nombre, .robwaifu @usuario, .gtop 1, .htop 1, .waifusboard 1.

Los prefijos son ejemplos; se usa el prefijo real de cada grupo/socket.
Para cartas antiguas sin número de imagen, usar el selector #antiguo (por ejemplo .sell Nombre #antiguo 5000).

## Revisión verificable de GitHub

- 24 archivos de comandos Gacha comprobados directamente en test.
- 67 alias literales encontrados, sin duplicados dentro de la categoría Gacha.
- Los 20 nuevos comandos tienen su acción correspondiente en core/gachaActions.ts.
- Los 24 archivos incluyen la nota de autoría final.
- Estas comprobaciones son estáticas y no sustituyen pruebas de ejecución.

## Integridad y limitaciones

- No se cambian sesiones, credenciales ni bases activas.
- La propiedad de cartas y los intercambios se comprueban transaccionalmente por grupo.
- La compra debita y abona monedas con una transacción SQLite que incluye Aura.db adjunta. En modo WAL, un corte eléctrico extremo durante un commit de dos archivos puede dejar estados divergentes. Respaldar Aura.db y GachaAura.db de forma coordinada antes del despliegue.
- El catálogo de series es global y compartido por los sockets, no exclusivo de cada socket.
- No se han confirmado pruebas SQLite del servidor ni ejecución en un socket real. Los workflows GitHub Actions observados fallan sin pasos o logs recuperables. No declarar validación completa.
- No fusionar con master hasta probar compras, intercambios, reclamaciones y robo en un socket aislado y ejecutar los scripts de pruebas.

<!-- Hecho por Lourtnyx Matterssmith [Lou-Nyx]. -->
