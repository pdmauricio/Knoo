#include <math.h>            /* log() para amcostestimate */

#include "postgres.h"
#include "fmgr.h"
#include "access/amapi.h"
#include "access/genam.h"
#include "access/relscan.h"
#include "commands/defrem.h"
#include "nodes/pathnodes.h"
#include "catalog/index.h"
#include "access/itup.h"
#include "access/tableam.h"  /* Necesario para table_index_build_scan */
#include "lib/stringinfo.h"
#include "storage/bufmgr.h"
#include "storage/bufpage.h"
#include "optimizer/cost.h"
#include "optimizer/optimizer.h"  
#include "utils/rel.h"
#include "skiplist.h"

/* Macro obligatoria para la compatibilidad del módulo */
PG_MODULE_MAGIC;

/* ====================================================================
 * FUNCIONES AUXILIARES
 * ==================================================================== */

 /*
  * Crea una pagina nueva al final del indice y la devuelve bloqueada
  * en modo EXCLUSIVE. PG16+ usa ExtendBufferedRel; antes, P_NEW.
  */
static Buffer skiplist_new_buffer(Relation index) {
#if PG_VERSION_NUM >= 160000
    return ExtendBufferedRel(BMR_REL(index), MAIN_FORKNUM, NULL, EB_LOCK_FIRST);
#else
    Buffer buf = ReadBuffer(index, P_NEW);
    LockBuffer(buf, BUFFER_LOCK_EXCLUSIVE);
    return buf;
#endif
}

/* Pieza 1: Funciones de lectura y comparación */
static Datum skiplist_get_key(Relation index, BlockNumber blk, bool* isnull) {
    Buffer      buffer;
    Page        page;
    ItemId      itemid;
    IndexTuple  itup;
    Datum       key;

    buffer = ReadBuffer(index, blk);
    LockBuffer(buffer, BUFFER_LOCK_SHARE);
    page = BufferGetPage(buffer);
    itemid = PageGetItemId(page, FirstOffsetNumber);
    itup = (IndexTuple)PageGetItem(page, itemid);
    key = index_getattr(itup, 1, RelationGetDescr(index), isnull);
    UnlockReleaseBuffer(buffer);
    return key;   /* valido para int4 (pass-by-value) */
}

static void skiplist_get_opaque(Relation index, BlockNumber blk, SkipListOpaqueData* out) {
    Buffer buffer;
    Page   page;

    buffer = ReadBuffer(index, blk);
    LockBuffer(buffer, BUFFER_LOCK_SHARE);
    page = BufferGetPage(buffer);
    memcpy(out, PageGetSpecialPointer(page), sizeof(SkipListOpaqueData));
    UnlockReleaseBuffer(buffer);
}

/* Comparacion segura (la resta de int32 puede desbordar) */
static int32 skiplist_compare(Datum a, Datum b) {
    int32 x = DatumGetInt32(a);
    int32 y = DatumGetInt32(b);
    return (x < y) ? -1 : (x > y) ? 1 : 0;
}

/* Pieza 2: Generación de nivel aleatorio */
static int skiplist_random_level(void) {
    int lvl = 0;
    while (((double)rand() / RAND_MAX) < 0.5 && lvl < SKIPLIST_MAXLEVEL - 1)
        lvl++;
    return lvl;
}

/*
 * Pieza 3: Funcion principal de insercion.
 * La usan tanto ambuild (via callback) como aminsert.
 */
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

    /* FASE 1: Buscar posición (predecesor en cada nivel) */
    skiplist_get_opaque(index, current_block, &current_opaque);
    for (i = SKIPLIST_MAXLEVEL - 1; i >= 0; i--) {
        while (current_opaque.forward[i] != InvalidBlockNumber) {
            bool   next_isnull;
            Datum  next_key = skiplist_get_key(index, current_opaque.forward[i], &next_isnull);
            if (skiplist_compare(next_key, key) < 0) {
                current_block = current_opaque.forward[i];
                skiplist_get_opaque(index, current_block, &current_opaque);
            }
            else {
                break;
            }
        }
        update[i] = current_block;
    }

    /* FASE 2: Decidir nivel */
    new_level = skiplist_random_level();

    /* FASE 3: Obtener referencias a sucesores actuales de los predecesores */
    for (i = 0; i <= new_level; i++) {
        SkipListOpaqueData pred_opaque;
        skiplist_get_opaque(index, update[i], &pred_opaque);
        old_next[i] = pred_opaque.forward[i];
    }

    /* FASE 4: Crear la nueva página física */
    newbuf = skiplist_new_buffer(index);
    newpage = BufferGetPage(newbuf);
    PageInit(newpage, BufferGetPageSize(newbuf), sizeof(SkipListOpaqueData));
    newblk = BufferGetBlockNumber(newbuf);

    values[0] = key;
    itup = index_form_tuple(RelationGetDescr(index), values, isnull);
    itup->t_tid = *heap_tid;

    if (PageAddItem(newpage, (Item)itup, IndexTupleSize(itup), InvalidOffsetNumber, false, false) == InvalidOffsetNumber) {
        elog(ERROR, "skiplist: no se pudo insertar la tupla en la pagina nueva");
    }

    new_opaque = (SkipListOpaque)PageGetSpecialPointer(newpage);
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
        {
            Page predpage = BufferGetPage(predbuf);
            SkipListOpaque pred_opaque = (SkipListOpaque)PageGetSpecialPointer(predpage);
            pred_opaque->forward[i] = newblk;
        }
        MarkBufferDirty(predbuf);
        UnlockReleaseBuffer(predbuf);
    }
}

/* Pieza 4: Callback de escaneo (ambuild) */
static void skiplist_build_callback(Relation index, ItemPointer tid, Datum* values,
    bool* isnull, bool tupleIsAlive, void* state) {
    double* count = (double*)state;

    if (isnull[0])      /* los NULL no se indexan */
        return;

    skiplist_insert_tuple(index, values[0], tid);
    (*count)++;
}

/* ====================================================================
 * Pieza 5: Estado de un escaneo (búsqueda) en curso
 * ==================================================================== */
typedef struct SkipListScanOpaqueData {
    Datum   search_key;        /* el valor que busca el WHERE columna = X */
    bool    key_is_set;        /* ¿ya nos dieron un valor para buscar? */
    bool    already_returned;  /* como es busqueda por igualdad, hay máximo 1 resultado */
} SkipListScanOpaqueData;

typedef SkipListScanOpaqueData *SkipListScanOpaque;

/* ====================================================================
 * 1. FUNCIONES DEL ACCESS METHOD
 * ==================================================================== */

static IndexBuildResult* skiplistbuild(Relation heap, Relation index, IndexInfo* indexInfo) {
    IndexBuildResult* result;
    Buffer buffer;
    Page page;
    SkipListOpaque opaque;
    int i;
    double reltuples = 0;

    /* 1-2. Pagina nueva (bloque 0 = header), ya bloqueada EXCLUSIVE */
    buffer = skiplist_new_buffer(index);

    /* 3-4. Inicializar la pagina */
    page = BufferGetPage(buffer);
    PageInit(page, BufferGetPageSize(buffer), sizeof(SkipListOpaqueData));

    /* 5. Configurar nodo raíz (header) */
    opaque = (SkipListOpaque)PageGetSpecialPointer(page);
    opaque->max_level = SKIPLIST_MAXLEVEL - 1;
    for (i = 0; i < SKIPLIST_MAXLEVEL; i++) {
        opaque->forward[i] = InvalidBlockNumber;
    }

    /* 6-7. Dirty y soltar */
    MarkBufferDirty(buffer);
    UnlockReleaseBuffer(buffer);

    elog(NOTICE, "skiplistbuild: Pagina raiz (Bloque 0) inicializada en el disco exitosamente.");

    /* 8. Escaneo de la tabla e insercion de tuplas existentes */
    table_index_build_scan(heap, index, indexInfo, true, true,
        skiplist_build_callback,
        (void*)&reltuples, NULL);

    result = (IndexBuildResult*)palloc0(sizeof(IndexBuildResult));
    result->heap_tuples = reltuples;
    result->index_tuples = reltuples;

    return result;
}

static void skiplistbuildempty(Relation index) {
    elog(NOTICE, "skiplistbuildempty: Inicializando indice vacio");
}

static bool skiplistinsert(Relation rel, Datum* values, bool* isnull,
    ItemPointer ht_ctid, Relation heapRel,
    IndexUniqueCheck checkUnique,
    bool indexUnchanged,
    IndexInfo* indexInfo) {
    if (isnull[0])      /* los NULL no se indexan */
        return false;

    skiplist_insert_tuple(rel, values[0], ht_ctid);
    return false;       /* no es indice unique: no hay "check" que reportar */
}

static IndexBulkDeleteResult* skiplistbulkdelete(IndexVacuumInfo* info,
    IndexBulkDeleteResult* stats,
    IndexBulkDeleteCallback callback,
    void* callback_state) {
    return NULL;
}

static IndexBulkDeleteResult* skiplistvacuumcleanup(IndexVacuumInfo* info,
    IndexBulkDeleteResult* stats) {
    return NULL;
}

static bytea* skiplistoptions(Datum reloptions, bool validate) {
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

    if (path->indexclauses != NIL)
    {
        *indexSelectivity = 1.0 / num_tuples;
        if (*indexSelectivity < 1.0 / num_tuples)
            *indexSelectivity = 1.0 / num_tuples;
        if (*indexSelectivity > 0.1)
            *indexSelectivity = 0.1;
    }
    else
    {
        *indexSelectivity = 1.0;
    }

    *indexPages = 1.0 + log(num_pages) / log(2.0);

    *indexStartupCost = *indexPages * random_page_cost;
    *indexTotalCost   = *indexStartupCost
                        + (*indexSelectivity * num_tuples) * cpu_index_tuple_cost
                        + (*indexSelectivity * num_tuples) * cpu_operator_cost;

    *indexCorrelation = 0.5;
}

/* ====================================================================
 * CICLO DE BÚSQUEDA (Issue #11)
 * ==================================================================== */

static IndexScanDesc skiplistbeginscan(Relation rel, int nkeys, int norderbys) {
    IndexScanDesc scan;
    scan = RelationGetIndexScan(rel, nkeys, norderbys);
    scan->opaque = palloc0(sizeof(SkipListScanOpaqueData));
    return scan;
}

static void skiplistrescan(IndexScanDesc scan, ScanKey keys, int nkeys,
                           ScanKey orderbys, int norderbys) {
    SkipListScanOpaque so = (SkipListScanOpaque) scan->opaque;
    so->key_is_set = false;
    so->already_returned = false;
    if (nkeys > 0 && keys != NULL) {
        so->search_key = keys[0].sk_argument;
        so->key_is_set = true;
    }
}

static bool skiplistgettuple(IndexScanDesc scan, ScanDirection dir) {
    SkipListScanOpaque so = (SkipListScanOpaque) scan->opaque;
    Relation    index = scan->indexRelation;
    BlockNumber current_block = 0;      /* header */
    SkipListOpaqueData current_opaque;
    int         i;
    BlockNumber candidate;
    Datum       candidate_key;
    bool        candidate_isnull;

    if (!so->key_is_set || so->already_returned)
        return false;

    so->already_returned = true;

    skiplist_get_opaque(index, current_block, &current_opaque);
    for (i = SKIPLIST_MAXLEVEL - 1; i >= 0; i--) {
        while (current_opaque.forward[i] != InvalidBlockNumber) {
            bool  next_isnull;
            Datum next_key = skiplist_get_key(index, current_opaque.forward[i], &next_isnull);
            if (skiplist_compare(next_key, so->search_key) < 0) {
                current_block = current_opaque.forward[i];
                skiplist_get_opaque(index, current_block, &current_opaque);
            } else {
                break;
            }
        }
    }

    candidate = current_opaque.forward[0];
    if (candidate == InvalidBlockNumber)
        return false;

    candidate_key = skiplist_get_key(index, candidate, &candidate_isnull);
    if (skiplist_compare(candidate_key, so->search_key) != 0)
        return false;

    {
        Buffer     buf = ReadBuffer(index, candidate);
        Page       page;
        ItemId     itemid;
        IndexTuple itup;

        LockBuffer(buf, BUFFER_LOCK_SHARE);
        page = BufferGetPage(buf);
        itemid = PageGetItemId(page, FirstOffsetNumber);
        itup = (IndexTuple) PageGetItem(page, itemid);

        scan->xs_heaptid = itup->t_tid;
        scan->xs_recheck = false;
        UnlockReleaseBuffer(buf);
    }

    return true;
}

static void skiplistendscan(IndexScanDesc scan) {
    if (scan->opaque)
        pfree(scan->opaque);
}

/* ====================================================================
 * 2. FUNCION DE DEPURACION
 * ==================================================================== */

PG_FUNCTION_INFO_V1(skiplist_dump);

Datum skiplist_dump(PG_FUNCTION_ARGS) {
    Oid                relid = PG_GETARG_OID(0);
    Relation           index = index_open(relid, AccessShareLock);
    SkipListOpaqueData head, node;
    int                lvl;

    skiplist_get_opaque(index, 0, &head);

    for (lvl = SKIPLIST_MAXLEVEL - 1; lvl >= 0; lvl--) {
        StringInfoData buf;
        BlockNumber    blk = head.forward[lvl];

        initStringInfo(&buf);
        appendStringInfo(&buf, "nivel %d: HEAD", lvl);
        while (blk != InvalidBlockNumber) {
            bool   isnull;
            Datum k = skiplist_get_key(index, blk, &isnull);
            appendStringInfo(&buf, " -> %d(bloque %u)", DatumGetInt32(k), blk);
            skiplist_get_opaque(index, blk, &node);
            blk = node.forward[lvl];
        }
        elog(NOTICE, "%s", buf.data);
        pfree(buf.data);
    }

    index_close(index, AccessShareLock);
    PG_RETURN_VOID();
}

/* ====================================================================
 * 3. EL HANDLER PRINCIPAL
 * ==================================================================== */

PG_FUNCTION_INFO_V1(skiplisthandler);

Datum skiplisthandler(PG_FUNCTION_ARGS) {
    IndexAmRoutine* amroutine = makeNode(IndexAmRoutine);

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