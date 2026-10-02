# Gravimentes en Docker

Aplicación local para cargar facturas XML/ZIP, revisarlas, asignar cuentas por ítem y generar planos Contai. La imagen utiliza Python 3.13 y la biblioteca estándar: no necesita pip, Node.js ni servicios externos para funcionar.

## Llevar la aplicación y los datos al trabajo

### 1. Preparar el paquete en este equipo

Ejecuta **`Preparar traslado.cmd`** o:

```powershell
python preparar_traslado.py
```

Se crea **`distribucion/Gravimentes-trabajo.zip`** con el código, la configuración Docker y una copia consistente de `conversor/datos/gravimentes.sqlite3`. Incluye empresas, facturas, cuentas por ítem, originales XML e historial. Usa el respaldo de SQLite, por lo que puede prepararse mientras la aplicación local está abierta. El ZIP representa los datos del momento del respaldo; si sigues trabajando, prepara otro antes de trasladarte.

### 2. Arrancar en el equipo de trabajo

1. Instala y abre **Docker Desktop**, usando contenedores Linux. En Linux puedes usar Docker Engine con el complemento Docker Compose.
2. Copia y extrae el ZIP en una carpeta, por ejemplo `C:\Gravimentes`. Extrae también los archivos ocultos `.dockerignore` y `.env.example`.
3. Ejecuta **`Iniciar Docker.cmd`**, o abre una terminal en esa carpeta y ejecuta:

```powershell
docker compose up -d --build
```

4. Abre **http://localhost:8765**.

La primera construcción requiere Internet para descargar la imagen base de Python. Después, la aplicación funciona sin conexión. No necesitas instalar Python en el equipo de trabajo si solo vas a ejecutar Docker.

## Dónde se guardan los datos

```text
Gravimentes/
  compose.yaml
  Dockerfile
  conversor/
    datos/
      gravimentes.sqlite3
```

Docker monta `./conversor/datos` en `/data` dentro del contenedor. Los datos permanecen al detener, eliminar o reconstruir el contenedor. La base de datos **no está incluida dentro de la imagen**: se transporta por separado en el ZIP.

No ejecutes simultáneamente el servidor Python local y Docker sobre esa misma carpeta de datos. Usa una carpeta independiente para probar el ZIP en este equipo, o detén primero la aplicación local.

## Comandos habituales

```powershell
# Ver estado (debe aparecer healthy después del inicio)
docker compose ps

# Consultar registros
docker compose logs --tail 100 -f

# Detener, conservando todos los datos
docker compose down

# Volver a iniciar una imagen ya construida
docker compose up -d

# Aplicar una nueva versión del código, conservando datos
docker compose up -d --build
```

En Windows también puedes usar **`Detener Docker.cmd`**.

## Si el puerto 8765 está ocupado

Copia `.env.example` como `.env` y cambia:

```dotenv
GRAVIMENTES_PUERTO=8766
```

Vuelve a ejecutar `docker compose up -d` y abre http://localhost:8766. El contenedor siempre usa el puerto 8765 internamente; la variable cambia únicamente el puerto del navegador. La publicación predeterminada es local a ese equipo (`127.0.0.1`).

## Llevarlo a un equipo sin Internet

En un equipo con Docker e Internet, construye y guarda la imagen:

```powershell
docker compose build
docker image save -o gravimentes-imagen.tar gravimentes:local
```

Transporta **el ZIP del proyecto con los datos y `gravimentes-imagen.tar`**. En el equipo destino, con Docker instalado, extrae el ZIP, abre una terminal en esa carpeta y ejecuta:

```powershell
docker image load -i gravimentes-imagen.tar
docker compose up -d --no-build --pull never
```

En este caso usa estos comandos, no `Iniciar Docker.cmd`, porque el lanzador solicita construir la imagen. La imagen debe haberse construido para la arquitectura del equipo destino (habitualmente x86-64/amd64 en Windows).

## Respaldar o volver a trasladar desde el trabajo

Si tienes Python instalado, puedes ejecutar `python preparar_traslado.py` para crear un ZIP actualizado, incluso con Docker en ejecución.

Sin Python instalado en el equipo, detén la aplicación con `docker compose down`, copia la carpeta completa del proyecto —incluyendo `conversor/datos`— y vuelve a iniciar con `docker compose up -d`. Para restaurar, detén primero el contenedor y sustituye la carpeta de datos por la del respaldo. Restaurar reemplaza los datos actuales; no mezcla bases de datos.
