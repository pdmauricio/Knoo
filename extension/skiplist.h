#ifndef SKIPLIST_H
#define SKIPLIST_H
#define SKIPLIST_MAXLEVEL 16     // línea 3: lo que agregaste
#include "postgres.h"
#include "storage/block.h"


typedef struct SkipListOpaqueData {
    uint16      max_level;                     
    BlockNumber forward[SKIPLIST_MAXLEVEL];    
} SkipListOpaqueData;

typedef SkipListOpaqueData *SkipListOpaque;

#endif