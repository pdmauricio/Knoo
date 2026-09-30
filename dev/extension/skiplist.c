#include "postgres.h"
#include "fmgr.h"
#include "access/amapi.h"
#include "commands/defrem.h"

/* Macro obligatoria para que Postgres sepa que es un módulo compilado válido */
PG_MODULE_MAGIC;

/* Declarar la función para que sea visible desde SQL */
PG_FUNCTION_INFO_V1(skiplisthandler);

Datum skiplisthandler(PG_FUNCTION_ARGS) {
    /* makeNode asigna memoria palloc0, inicializando todo en NULL (vacío) */
    IndexAmRoutine *amroutine = makeNode(IndexAmRoutine);

    /* Metadatos básicos del índice */
    amroutine->amstrategies = 0;   /* Número de operadores (>, <, =) */
    amroutine->amsupport = 0;      /* Número de funciones de soporte */
    amroutine->amoptsprocnum = 0;  /* Opciones adicionales */
    
    /* 
     * Aquí irán los punteros a tus futuras funciones:
     * amroutine->ambuild = skiplistbuild;
     * amroutine->aminsert = skiplistinsert;
     * etc...
     * 
     * Por ahora, como palloc0 los dejó en NULL, PostgreSQL compilará y 
     * registrará la extensión, pero fallará si intentas crear un índice con él.
     */

    PG_RETURN_POINTER(amroutine);
}