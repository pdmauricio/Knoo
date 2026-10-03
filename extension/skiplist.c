#include "postgres.h"
#include "fmgr.h"
#include "access/amapi.h"
#include "access/relscan.h"
#include "commands/defrem.h"
#include "nodes/pathnodes.h"
#include "catalog/index.h"

#include "storage/bufmgr.h"
#include "storage/bufpage.h"
#include "skiplist.h"

/* Macro obligatoria para la compatibilidad del módulo */
PG_MODULE_MAGIC;

/* ====================================================================
 * 1. DECLARACIÓN DE LAS FUNCIONES OBLIGATORIAS (STUBS)
 * ==================================================================== */

static IndexBuildResult *skiplistbuild(Relation heap, Relation index, IndexInfo *indexInfo) {
    IndexBuildResult *result;
    Buffer buffer;
    Page page;
    SkipListOpaque opaque;
    int i;

    /* 1. Pedimos a Postgres que cree un bloque físico nuevo (P_NEW) para este índice */
    buffer = ReadBuffer(index, P_NEW);

    /* 2. Bloqueamos la página en RAM para evitar que otro proceso escriba al mismo tiempo */
    LockBuffer(buffer, BUFFER_LOCK_EXCLUSIVE);

    /* 3. Obtenemos el puntero a los 8192 bytes de la página */
    page = BufferGetPage(buffer);

    /* 4. Inicializamos la página, reservando exactamente el tamaño de nuestro struct al final */
    PageInit(page, BufferGetPageSize(buffer), sizeof(SkipListOpaqueData));

    /* 5. Accedemos al Special Space y configuramos nuestro macro-nodo */
    opaque = (SkipListOpaque) PageGetSpecialPointer(page);
    opaque->max_level = 1; /* Inicia en el nivel base */
    
    for (i = 0; i < SKIPLIST_MAXLEVEL; i++) {
        opaque->forward[i] = InvalidBlockNumber; /* InvalidBlockNumber es el equivalente a NULL en disco */
    }

    /* 6. AVISO CRÍTICO: Marcamos el buffer como sucio para que Postgres lo guarde en disco */
    MarkBufferDirty(buffer);

    /* 7. Soltamos el bloqueo y liberamos el buffer de nuestra memoria */
    UnlockReleaseBuffer(buffer);

    elog(NOTICE, "skiplistbuild: Pagina raiz (Bloque 0) inicializada en el disco exitosamente.");

    /* 8. Preparamos el reporte final de la construcción (0 tuplas por ahora) */
    result = (IndexBuildResult *) palloc0(sizeof(IndexBuildResult));
    result->heap_tuples = 0;
    result->index_tuples = 0;

    return result;
}

static void skiplistbuildempty(Relation index) {
    elog(NOTICE, "skiplistbuildempty: Inicializando indice vacio");
}

static bool skiplistinsert(Relation rel, Datum *values, bool *isnull, 
                           ItemPointer ht_ctid, Relation heapRel, 
                           IndexUniqueCheck checkUnique, 
                           bool indexUnchanged, /* <-- Nuevo parámetro requerido por PG18 */
                           IndexInfo *indexInfo) {
    elog(NOTICE, "skiplistinsert: Insertando dato (Simulacion)");
    return false;
}

static IndexBulkDeleteResult *skiplistbulkdelete(IndexVacuumInfo *info, 
                                                 IndexBulkDeleteResult *stats, 
                                                 IndexBulkDeleteCallback callback, 
                                                 void *callback_state) {
    return NULL;
}

static IndexBulkDeleteResult *skiplistvacuumcleanup(IndexVacuumInfo *info, 
                                                    IndexBulkDeleteResult *stats) {
    return NULL;
}

static bytea *skiplistoptions(Datum reloptions, bool validate) {
    return NULL;
}

static void skiplistcostestimate(PlannerInfo *root, IndexPath *path, double loop_count, 
                                 Cost *indexStartupCost, Cost *indexTotalCost, 
                                 Selectivity *indexSelectivity, double *indexCorrelation, 
                                 double *indexPages) {
    *indexStartupCost = 100.0;
    *indexTotalCost = 100.0;
    *indexSelectivity = 0.5;
    *indexCorrelation = 0.5;
    *indexPages = 1.0;
}

static IndexScanDesc skiplistbeginscan(Relation rel, int nkeys, int norderbys) {
    elog(ERROR, "skiplistbeginscan: Las busquedas aun no estan implementadas");
    return NULL;
}

static void skiplistrescan(IndexScanDesc scan, ScanKey keys, int nkeys, 
                           ScanKey orderbys, int norderbys) {
    /* Vacio por ahora */
}

static bool skiplistgettuple(IndexScanDesc scan, ScanDirection dir) {
    return false;
}

static void skiplistendscan(IndexScanDesc scan) {
    /* Vacio por ahora */
}

/* ====================================================================
 * 2. EL HANDLER PRINCIPAL (El que definiste en SQL)
 * ==================================================================== */

PG_FUNCTION_INFO_V1(skiplisthandler);

Datum skiplisthandler(PG_FUNCTION_ARGS) {
    IndexAmRoutine *amroutine = makeNode(IndexAmRoutine);

    /* Metadatos básicos */
    amroutine->amstrategies = 5;  /* Soportaremos operadores básicos como B-Tree */
    amroutine->amsupport = 1;     /* Función de comparación */
    amroutine->amoptsprocnum = 0;

    /* Capacidades del índice (flags) */
    amroutine->amcanorder = false;
    amroutine->amcanunique = false;
    amroutine->amcanmulticol = false;
    amroutine->amoptionalkey = true;
    amroutine->amsearcharray = false;
    amroutine->amsearchnulls = false;
    // amroutine->amhasgettuple = true;
    // amroutine->amhasgetbitmap = false;
    
    /* Vinculamos la estructura con nuestras funciones de arriba */
    amroutine->ambuild = skiplistbuild;
    amroutine->ambuildempty = skiplistbuildempty;
    amroutine->aminsert = skiplistinsert;
    amroutine->ambulkdelete = skiplistbulkdelete;
    amroutine->amvacuumcleanup = skiplistvacuumcleanup;
    amroutine->amoptions = skiplistoptions;
    amroutine->amcostestimate = skiplistcostestimate;
    amroutine->ambeginscan = skiplistbeginscan;
    amroutine->amrescan = skiplistrescan;
    amroutine->amgettuple = skiplistgettuple;
    amroutine->amendscan = skiplistendscan;

    PG_RETURN_POINTER(amroutine);
}