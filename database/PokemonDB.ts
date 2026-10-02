import DataBase from "better-sqlite3";
import { mkdirSync, existsSync } from "fs";

const DATA_BASE_DIR = globalThis.DATA_BASE_DIR;
if (!existsSync(DATA_BASE_DIR)) {mkdirSync(DATA_BASE_DIR, { recursive: true })}

const PokemonDB = new DataBase(`${DATA_BASE_DIR}/pokemon.db`);
PokemonDB.pragma("journal_mode = WAL");
PokemonDB.pragma("synchronous = NORMAL");
PokemonDB.pragma("foreign_keys = ON");
PokemonDB.pragma("wal_checkpoint = 1000");
PokemonDB.pragma("busy_timeout = 2000");
PokemonDB.pragma("cache_size = -4000");

