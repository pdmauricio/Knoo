#include <math.h>            /* log() para amcostestimate */

#include "postgres.h"
#include "fmgr.h"
#include "access/amapi.h"
#include "access/relscan.h"
#include "commands/defrem.h"
#include "nodes/pathnodes.h"
#include "catalog/index.h"
#include "access/itup.h"
#include "access/tableam.h"  /* Necesario para table_index_build_scan */
#include "storage/bufmgr.h"
#include "storage/bufpage.h"
#include "optimizer/cost.h"  /* random_page_cost, cpu_index_tuple_cost, cpu_operator_cost */
#include "skiplist.h"

/* Macro obligatoria para la compatibilidad del módulo */
PG_MODULE_MAGIC;

/* ====================================================================
 * FUNCIONES AUXILIARES (PIEZAS 1, 2, 3 Y 4)
 * ==================================================================== */

/* Pieza 1: Funciones de lectura y comparación */
static Datum skiplist_get_key(Relation index, BlockNumber blk, bool *isnull) {
    Buffer      buffer;
    Page        page;
    ItemId      itemid;
    IndexTuple  itup;
    Datum       key;

    buffer = ReadBuffer(index, blk);
    LockBuffer(buffer, BUFFER_LOCK_SHARE);
    page = BufferGetPage(buffer);
    itemid = PageGetItemId(page, FirstOffsetNumber);
    itup = (IndexTuple) PageGetItem(page, itemid);
    key = index_getattr(itup, 1, RelationGetDescr(index), isnull);
    UnlockReleaseBuffer(buffer);
    return key;
}

static void skiplist_get_opaque(Relation index, BlockNumber blk, SkipListOpaqueData *out) {
    Buffer buffer;
    Page   page;

    buffer = ReadBuffer(index, blk);
    LockBuffer(buffer, BUFFER_LOCK_SHARE);
    page = BufferGetPage(buffer);
    memcpy(out, PageGetSpecialPointer(page), sizeof(SkipListOpaqueData));
    UnlockReleaseBuffer(buffer);
}

static int32 skiplist_compare(Datum a, Datum b) {
    return DatumGetInt32(a) - DatumGetInt32(b);
}

/* Pieza 2: Generación de nivel aleatorio */
static int skiplist_random_level(void) {
    int lvl = 0;
    while (((double) rand() / RAND_MAX) < 0.5 && lvl < SKIPLIST_MAXLEVEL - 1)
        lvl++;
    return lvl;
}

/* Pieza 3: Función principal de inserción */
static void skiplist_insert_tuple(Relation index, Datum key, ItemPointer heap_tid) {
    BlockNumber update[SKIPLIST_MAXLEVEL];
    BlockNumber old_next[SKIPLIST_MAXLEVEL];
    BlockNumber current_block = 0;      /* 0 = header */
    SkipListOpaqueData current_opaque;
    int         i, new_level;
    Buffer      newbuf;
    Page        newpage;
    SkipListOpaque new_opaque;
    BlockNumber newblk;
    IndexTuple  itup;
    Datum       values[1];
    bool        isnull[1] = { false };

    /* FASE 1: Buscar posición */
    skiplist_get_opaque(index, current_block, &current_opaque);
    for (i = SKIPLIST_MAXLEVEL - 1; i >= 0; i--) {
        while (current_opaque.forward[i] != InvalidBlockNumber) {
            bool   next_isnull;
            Datum  next_key = skiplist_get_key(index, current_opaque.forward[i], &next_isnull);
            if (skiplist_compare(next_key, key) < 0) {
                current_block = current_opaque.forward[i];
                skiplist_get_opaque(index, current_block, &current_opaque);
            } else {
                break;
            }
        }
        update[i] = current_block;
    }

    /* FASE 2: Decidir nivel */
    new_level = skiplist_random_level();

    /* FASE 3: Obtener referencias a predecesores */
    for (i = 0; i <= new_level; i++) {
        SkipListOpaqueData pred_opaque;
        skiplist_get_opaque(index, update[i], &pred_opaque);
        old_next[i] = pred_opaque.forward[i];
    }

    /* FASE 4: Crear la nueva página física */
    newbuf = ReadBuffer(index, P_NEW);
    LockBuffer(newbuf, BUFFER_LOCK_EXCLUSIVE);
    newpage = BufferGetPage(newbuf);
    PageInit(newpage, BufferGetPageSize(newbuf), sizeof(SkipListOpaqueData));
    newblk = BufferGetBlockNumber(newbuf);

    values[0] = key;
    itup = index_form_tuple(RelationGetDescr(index), values, isnull);
    itup->t_tid = *heap_tid;

    if (PageAddItem(newpage, (Item) itup, IndexTupleSize(itup), InvalidOffsetNumber, false, false) == InvalidOffsetNumber) {
        elog(ERROR, "skiplist: no se pudo insertar la tupla en la pagina nueva");
    }

    new_opaque = (SkipListOpaque) PageGetSpecialPointer(newpage);
    new_opaque->max_level = new_level;
    for (i = 0; i < SKIPLIST_MAXLEVEL; i++) {
        new_opaque->forward[i] = (i <= new_level) ? old_next[i] : InvalidBlockNumber;
    }

    MarkBufferDirty(newbuf);
    UnlockReleaseBuffer(newbuf);
    pfree(itup);

    /* FASE 5: Enlazar predecesores al nuevo nodo */
    for (i = 0; i <= new_level; i++) {
        Buffer predbuf = ReadBuffer(index, update[i]);
        LockBuffer(predbuf, BUFFER_LOCK_EXCLUSIVE);
        Page predpage = BufferGetPage(predbuf);
        SkipListOpaque pred_opaque = (SkipListOpaque) PageGetSpecialPointer(predpage);
        pred_opaque->forward[i] = newblk;
        MarkBufferDirty(predbuf);
        UnlockReleaseBuffer(predbuf);
    }
}

/* Pieza 4: Callback de escaneo */
static void skiplist_build_callback(Relation index, ItemPointer tid, Datum *values,
                                   bool *isnull, bool tupleIsAlive, void *state) {
    double *count = (double *) state;
    skiplist_insert_tuple(index, values[0], tid);
    (*count)++;
}

/* ====================================================================
 * 1. DECLARACIÓN DE LAS FUNCIONES OBLIGATORIAS (STUBS Y IMPLEMENTACIÓN)
 * ==================================================================== */

static IndexBuildResult *skiplistbuild(Relation heap, Relation index, IndexInfo *indexInfo) {
    IndexBuildResult *result;
    Buffer buffer;
    Page page;
    SkipListOpaque opaque;
    int i;
    double reltuples = 0;

    /* 1. Pedimos a Postgres que cree un bloque físico nuevo (P_NEW) para este índice */
    buffer = ReadBuffer(index, P_NEW);

    /* 2. Bloqueamos la página en RAM */
    LockBuffer(buffer, BUFFER_LOCK_EXCLUSIVE);

    /* 3. Obtenemos el puntero a la página */
    page = BufferGetPage(buffer);

    /* 4. Inicializamos la página */
    PageInit(page, BufferGetPageSize(buffer), sizeof(SkipListOpaqueData));

    /* 5. Configurar nodo raíz */
    opaque = (SkipListOpaque) PageGetSpecialPointer(page);
    opaque->max_level = 1;
    
    for (i = 0; i < SKIPLIST_MAXLEVEL; i++) {
        opaque->forward[i] = InvalidBlockNumber;
    }

    /* 6. Marcar buffer dirty */
    MarkBufferDirty(buffer);

    /* 7. Soltar bloqueo */
    UnlockReleaseBuffer(buffer);

    elog(NOTICE, "skiplistbuild: Pagina raiz (Bloque 0) inicializada en el disco exitosamente.");

    /* 8. Escaneo de la tabla e inserción de tuplas existentes (Pieza 4) */
    reltuples = table_index_build_scan(heap, index, indexInfo, true, true,
                                        skiplist_build_callback,
                                        (void *) &reltuples, NULL);

    result = (IndexBuildResult *) palloc0(sizeof(IndexBuildResult));
    result->heap_tuples = reltuples;
    result->index_tuples = reltuples;

    return result;
}

static void skiplistbuildempty(Relation index) {
    elog(NOTICE, "skiplistbuildempty: Inicializando indice vacio");
}

static bool skiplistinsert(Relation rel, Datum *values, bool *isnull, 
                           ItemPointer ht_ctid, Relation heapRel, 
                           IndexUniqueCheck checkUnique, 
                           bool indexUnchanged, 
                           IndexInfo *indexInfo) {
    skiplist_insert_tuple(rel, values[0], ht_ctid);
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
                                 double *indexPages)
{
    IndexOptInfo   *index       = path->indexinfo;
    double          num_tuples  = Max(index->tuples, 1.0);
    double          num_pages   = Max(index->pages,  1.0);

    /*
     * Selectividad: si hay cláusulas de igualdad (=) asumimos 1/num_tuples,
     * es decir una sola fila.  Si hay rango (<, >) asumimos 10 % de la tabla.
     * Si no hay cláusulas (escaneo completo) usamos 1.0.
     */
    if (path->indexclauses != NIL)
    {
        /* Estimado conservador: una fracción pequeña de las filas */
        *indexSelectivity = 1.0 / num_tuples;
        /* Clamp entre 1 tupla y el 10 % de la tabla */
        if (*indexSelectivity < 1.0 / num_tuples)
            *indexSelectivity = 1.0 / num_tuples;
        if (*indexSelectivity > 0.1)
            *indexSelectivity = 0.1;
    }
    else
    {
        *indexSelectivity = 1.0;   /* sin filtro → toda la tabla */
    }

    /*
     * Páginas estimadas a leer: el skip list tiene profundidad log2(N).
     * Añadimos 1 para la página raíz (cabecera).
     */
    *indexPages = 1.0 + log(num_pages) / log(2.0);

    /*
     * Costos:
     *   - Startup : costar de bajar por los niveles del skip list (≈ log N * random_page_cost)
     *   - Total   : startup + páginas a leer × random_page_cost + CPU por tupla devuelta
     */
    *indexStartupCost = *indexPages * random_page_cost;
    *indexTotalCost   = *indexStartupCost
                        + (*indexSelectivity * num_tuples) * cpu_index_tuple_cost
                        + (*indexSelectivity * num_tuples) * cpu_operator_cost;

    /*
     * Correlación: el skip list mantiene orden, así que la correlación
     * con el heap es moderada-positiva (similar a un B-tree con inserciones
     * aleatorias).  Usamos 0.5 como aproximación conservadora.
     */
    *indexCorrelation = 0.5;
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
 * 2. EL HANDLER PRINCIPAL
 * ==================================================================== */

PG_FUNCTION_INFO_V1(skiplisthandler);

Datum skiplisthandler(PG_FUNCTION_ARGS) {
    IndexAmRoutine *amroutine = makeNode(IndexAmRoutine);

    amroutine->amstrategies = 5;
    amroutine->amsupport = 1;
    amroutine->amoptsprocnum = 0;

    amroutine->amcanorder = false;
    amroutine->amcanunique = false;
    amroutine->amcanmulticol = false;
    amroutine->amoptionalkey = true;
    amroutine->amsearcharray = false;
    amroutine->amsearchnulls = false;

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