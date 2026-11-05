# Aura Reed Bot

![Aura Reed Bot](https://cdn.dix.lat/me/izijnp-c91x-ozzy3t-433130.jpg)

Bot de WhatsApp para grupos y uso personal, construido con `baileys` y un sistema modular de comandos.

## 📌 Descripción

Aura Reed Bot es un bot de WhatsApp con comandos de entretenimiento, administración de grupos, utilidades, stickers y más. Está diseñado para cargarse automáticamente desde la carpeta `commands/` y usar archivos JSON locales para mantener la configuración y datos.

## 🚀 Características

- Gestion de grupos
- Configuracion personalizable
- Versatil
- Estable y rapido

## 🧱 Requisitos

- Version de nodeJS mayor a 22 o superior
- Cuenta de Whatsapp Busisnes **OBLIGATORIO** o Cuenta personal **Opcional**
- Conexión a internet estable
- Un PC o VPS con recursos suficientes

## 📦 Instalación

```bash
git clone https://github.com/jerielweb/Aura-reed-bot.git
cd aura-reed-bot
npm install
```

### Configurar proxies HTTP (opcional)

El bot puede rotar solicitudes HTTP de APIs y descargas entre una lista de proxies. Para cargarla automáticamente, crea `proxies.txt` en la raíz del proyecto (junto a `package.json`) y escribe un proxy por línea:

```text
http://usuario:clave@proxy1:puerto
socks5://usuario:clave@proxy2:puerto
```

También acepta proxies HTTP simples como `192.0.2.10:8080` y el formato `IP:puerto:usuario:contraseña`. Se permiten líneas vacías y comentarios que comiencen con `#`. También puedes indicar otro archivo con `BOT_PROXY_FILE`, o definir las URLs separadas por comas mediante `BOT_PROXY_URLS`. Se admiten `http://`, `https://` y `socks5://`.

No subas archivos con credenciales al repositorio ni compartas sus contenidos. Baileys/WhatsApp no usa esta lista: sus conexiones permanecen directas.

## 🧩 Estructura de carpetas

```
aura-reed-bot/
├── commands/          # Comandos del bot
├── database/          # Base de datos del bot
├── modules/           # Modulos del bot
├── sessions/          # Sesiones del bot
├── tmp/               # Archivos temporales
├── index.js           # Archivo principal
├── package.json       # Dependencias
└── README.md          # Documentacion
```

## 🛠️ Contribuir

1. Haz un fork del repositorio.
2. Crea una rama con tu cambio.
3. Envía un pull request.

## Colaboradores

- [𝕱𝖊𝖗𝖓𝖆𝖓𝖉𝖔](https://github.com/Fer2809fl)
- [Jeriel](https://github.com/jerielweb)
- [DuarteXV](https://github.com/DuarteXV)

## 📄 Licencia

Este proyecto usa licencia `MIT`.
