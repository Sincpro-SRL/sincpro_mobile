# PRD 03 — ORM y base de datos

> SP-2026-1072. 2026-11-05. Contraste con `sincpro_framework` (persistencia
> transaccional, PRD 17). No se implementa hasta que se defina el corte.

## Qué es hoy

`@sincpro/mobile` no tiene un ORM. Tiene un almacén de documentos sobre SQLite.

`DBCursor` abre `distribution.db` en WAL, con foreign keys, y serializa cada
llamada async con un mutex. Cada `mutateDatabase` es una sentencia. No hay una
unidad de trabajo: `PaymentOdooRepositoryImpl.save` recorre los pagos y llama
`mutateDatabase` una vez por fila. Si el proceso muere a mitad, queda una parte.

La fila es `uuid` + `data` (el JSON de la entidad) y unas columnas promocionadas
para filtrar (`remote_id`, `remote_state`, `name`). `findById` lee el JSON y
hace `fromJSON`. `findByCriteria` hace `findAll` y filtra en memoria. `ICriteria`
declara `>`, `<`, `>=` y `<=`; el repositorio de pagos solo distingue `=` del
resto, y el resto cae en distinto.

`@mapped` resuelve un foreign key leyendo SQLite en el acceso a la propiedad,
en el hilo de JS, sin caché. `Kernel.runMigrations` vuelve a ejecutar cada
`CREATE TABLE IF NOT EXISTS` en cada arranque. No hay tabla de versiones: una
columna nueva no altera una tabla que ya existe. `restartDatabase` tira las
tablas que no están en `persistedTables` y las crea de nuevo.

## Qué ya cerró el framework de Python

Un agregado se guarda entero, por una puerta, en una transacción. Los hijos que
son parte del agregado entran en ese mismo flush. Una referencia a otro agregado
no se escribe. `version` rechaza una escritura vieja. El criterio se ejecuta en
SQL, igual en memoria y en la base. Una migración tiene nombre y queda
registrada. La relación se resuelve al leer, dentro de la unidad de trabajo, y
no en cada acceso a la propiedad.

## Qué se queda en mobile

El dispositivo es una base, un proceso y un hilo de JS. El estado de una orden
sigue siendo el documento. No se mapea cada campo a una columna, no se trae
SQLAlchemy, no se calculan agregaciones en el motor y no se pide paridad de
criterios con el servidor. Las columnas promocionadas alcanzan para lo que la
pantalla filtra seguido: id remoto, estado de sync, nombre.

## Cortes, en este orden

1. Una unidad de trabajo en `DBCursor`: `BEGIN` / `COMMIT` / `ROLLBACK` bajo el
   mismo mutex. `save` de una colección y `saveMany` de eventos usan esa puerta.
   Una sentencia que falla deshace el lote.
2. Un registro de migraciones: nombre, y la función corre una vez. `CREATE TABLE
IF NOT EXISTS` se queda para la tabla nueva. Un `ALTER` posterior es otra
   entrada, no un cambio a la función vieja.
3. `findByCriteria` traduce a SQL las columnas promocionadas. El resto del
   documento se filtra en memoria solo después de esa página. Un operador que
   el repositorio no sabe traducir se rechaza, no se evalúa como distinto.
4. La relación se carga cuando el repositorio arma el agregado. `@mapped` deja
   de leer SQLite en el render.

El repositorio base, si aparece, es un repositorio de documentos: JSON, columnas
promocionadas, `remote_id`. No es el `Repository` de Python.
