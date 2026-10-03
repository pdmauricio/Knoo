#ifndef SKIPLIST_H
#define SKIPLIST_H

#include "postgres.h"
#include "storage/block.h"


#define SKIPLIST_MAXLEVEL 4 

typedef struct SkipListOpaqueData {
    uint16      max_level;                     
    BlockNumber forward[SKIPLIST_MAXLEVEL];    
} SkipListOpaqueData;

typedef SkipListOpaqueData *SkipListOpaque;

#endif