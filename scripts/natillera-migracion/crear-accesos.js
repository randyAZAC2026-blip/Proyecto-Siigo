#!/usr/bin/env node
// Crea los accesos de los socios a la natillera: cédula + PIN de 6 dígitos.
//
// Cada acceso es un usuario de Supabase Auth con un correo interno
// <cedula>@<dominio> (el socio nunca lo ve) y su PIN como contraseña, más
// una fila en perfiles_natillera que lo une a su socio y su rol.
//
// Corre SOLO en tu computador: usa la service_role key, que nunca debe ir
// al navegador ni a Netlify.
//
// Uso:
//   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=... node crear-accesos.js
//       → crea acceso a cada socio activo con cédula que aún no tenga uno.
//   ... node crear-accesos.js --admin 1001234567
//       → da rol admin a esa cédula (le crea acceso si no tiene).
//   ... node crear-accesos.js --reset 1001234567
//       → genera un PIN nuevo para esa cédula.
//   ... --dry-run   → muestra qué haría sin cambiar nada.
//
// Los PIN nuevos quedan en accesos_natillera_<fecha>.csv (está en .gitignore):
// repártelos y borra el archivo.

import { randomInt } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";

const URL_SB = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
// Debe coincidir con VITE_NAT_DOMINIO_CORREO de natillera-app.
const DOMINIO = process.env.NAT_DOMINIO_CORREO || "natillera.local";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const valorDe = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const limpiarCedula = (v) => String(v ?? "").replace(/\D/g, "");
const correoDe = (cedula, dominio = DOMINIO) => `${limpiarCedula(cedula)}@${dominio}`;
const nuevoPin = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

async function api(ruta, { method = "GET", body, headers = {} } = {}) {
  const res = await fetch(`${URL_SB}${ruta}`, {
    method,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const texto = await res.text();
  const datos = texto ? JSON.parse(texto) : null;
  if (!res.ok) {
    const msg = datos?.msg || datos?.message || datos?.error_description || texto;
    const err = new Error(`${method} ${ruta} → ${res.status}: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return datos;
}

async function usuariosAuth() {
  const porCorreo = new Map();
  for (let page = 1; ; page++) {
    const r = await api(`/auth/v1/admin/users?page=${page}&per_page=1000`);
    const lista = r?.users ?? [];
    for (const u of lista) if (u.email) porCorreo.set(u.email.toLowerCase(), u);
    if (lista.length < 1000) return porCorreo;
  }
}

// Crea el usuario o, si ya existía en Auth, le pone el PIN nuevo.
async function asegurarUsuario(cedula, pin, existentes) {
  const email = correoDe(cedula);
  const previo = existentes.get(email);
  if (previo) {
    await api(`/auth/v1/admin/users/${previo.id}`, { method: "PUT", body: { password: pin } });
    return previo.id;
  }
  const u = await api("/auth/v1/admin/users", {
    method: "POST",
    body: { email, password: pin, email_confirm: true, user_metadata: { cedula } },
  });
  return u.id ?? u.user?.id;
}

async function guardarPerfil(perfil) {
  await api("/rest/v1/perfiles_natillera?on_conflict=user_id", {
    method: "POST",
    body: [perfil],
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
  });
}

function escribirCsv(filas) {
  if (!filas.length) return null;
  // Nunca sobrescribe: un archivo anterior puede tener PINs aún sin repartir.
  const fecha = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  let archivo = `accesos_natillera_${fecha}.csv`;
  for (let n = 2; existsSync(archivo); n++) archivo = `accesos_natillera_${fecha}_${n}.csv`;
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lineas = ["socio,cedula,pin,rol", ...filas.map((f) => [f.socio, f.cedula, f.pin, f.rol].map(esc).join(","))];
  writeFileSync(archivo, "﻿" + lineas.join("\n") + "\n");
  return archivo;
}

async function main() {
  if (!URL_SB || !KEY) {
    console.error("Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno.");
    process.exit(1);
  }
  const [socios, perfiles, existentes] = await Promise.all([
    api("/rest/v1/socios?select=id,nombre,identificacion,tipo,estado&order=nombre"),
    api("/rest/v1/perfiles_natillera?select=user_id,socio_id,rol,cedula"),
    usuariosAuth(),
  ]);
  const perfilPorCedula = new Map(perfiles.map((p) => [p.cedula, p]));
  const socioPorCedula = new Map(
    socios.filter((s) => limpiarCedula(s.identificacion)).map((s) => [limpiarCedula(s.identificacion), s]),
  );
  const nuevos = [];
  const accion = DRY ? "(simulación) " : "";

  const reset = valorDe("--reset");
  const admin = valorDe("--admin");

  if (reset) {
    const cedula = limpiarCedula(reset);
    const perfil = perfilPorCedula.get(cedula);
    if (!perfil) throw new Error(`La cédula ${cedula} no tiene acceso todavía. Corre el script sin --reset para crearlo.`);
    const pin = nuevoPin();
    if (!DRY) await api(`/auth/v1/admin/users/${perfil.user_id}`, { method: "PUT", body: { password: pin } });
    const socio = socios.find((s) => s.id === perfil.socio_id);
    nuevos.push({ socio: socio?.nombre ?? "(sin socio)", cedula, pin, rol: perfil.rol });
    console.log(`${accion}PIN nuevo para ${cedula}.`);
  } else if (admin) {
    const cedula = limpiarCedula(admin);
    if (!cedula) throw new Error("--admin necesita una cédula.");
    const socio = socioPorCedula.get(cedula);
    const perfil = perfilPorCedula.get(cedula);
    if (perfil) {
      if (!DRY) await guardarPerfil({ ...perfil, rol: "admin" });
      console.log(`${accion}${cedula} ahora es admin (conserva su PIN).`);
    } else {
      const pin = nuevoPin();
      if (!DRY) {
        const user_id = await asegurarUsuario(cedula, pin, existentes);
        await guardarPerfil({ user_id, socio_id: socio?.id ?? null, rol: "admin", cedula });
      }
      nuevos.push({ socio: socio?.nombre ?? "(administrador)", cedula, pin, rol: "admin" });
      console.log(`${accion}Acceso admin creado para ${cedula}${socio ? ` (${socio.nombre})` : ""}.`);
    }
  } else {
    const personas = socios.filter((s) => s.tipo === "persona" && s.estado === "activo");
    const sinCedula = personas.filter((s) => !limpiarCedula(s.identificacion));
    for (const s of personas) {
      const cedula = limpiarCedula(s.identificacion);
      if (!cedula || perfilPorCedula.has(cedula)) continue;
      const pin = nuevoPin();
      if (!DRY) {
        const user_id = await asegurarUsuario(cedula, pin, existentes);
        await guardarPerfil({ user_id, socio_id: s.id, rol: "socio", cedula });
      }
      nuevos.push({ socio: s.nombre, cedula, pin, rol: "socio" });
    }
    console.log(`${accion}${nuevos.length} accesos nuevos · ${perfiles.length} ya existían.`);
    if (sinCedula.length) {
      console.log(`\n${sinCedula.length} socios activos sin cédula (llénala en la tabla socios, columna identificacion, y vuelve a correr):`);
      for (const s of sinCedula) console.log(`  #${s.id} ${s.nombre}`);
    }
  }

  if (DRY) {
    for (const f of nuevos) console.log(`  ${f.cedula}  ${f.socio}  (${f.rol})`);
    return;
  }
  const archivo = escribirCsv(nuevos);
  if (archivo) console.log(`\nPINs en ${archivo}. Repártelos a cada socio y borra el archivo.`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
