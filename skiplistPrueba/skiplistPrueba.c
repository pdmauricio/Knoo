#include <stdio.h>
#include <stdlib.h>
#include <time.h>
#include <limits.h>

#define MAX_LEVEL 16
#define P_FACTOR 0.5

// Estructura de un nodo
typedef struct Node {
    int key;
    // En un futuro (Postgres) aquí iría el puntero (TID) a la fila real
    struct Node **forward; 
} Node;

// Estructura de la Skip List
typedef struct SkipList {
    int level; // Nivel máximo actual en uso
    Node *header;
} SkipList;

// Crear un nuevo nodo con un nivel específico
Node* createNode(int key, int level) {
    Node *n = (Node*)malloc(sizeof(Node));
    n->key = key;
    // Asignar memoria para el arreglo de punteros según el nivel
    n->forward = (Node**)malloc(sizeof(Node*) * (level + 1));
    for (int i = 0; i <= level; i++) {
        n->forward[i] = NULL;
    }
    return n;
}

// Inicializar la Skip List
SkipList* createSkipList() {
    SkipList *lst = (SkipList*)malloc(sizeof(SkipList));
    lst->level = 0;
    // El header tiene el nivel máximo posible
    lst->header = createNode(INT_MIN, MAX_LEVEL);
    return lst;
}

// Generar un nivel aleatorio (lanzamiento de moneda)
int randomLevel() {
    int lvl = 0;
    while (((float)rand() / RAND_MAX) < P_FACTOR && lvl < MAX_LEVEL) {
        lvl++;
    }
    return lvl;
}

// Insertar un elemento
void insert(SkipList *lst, int key) {
    Node *current = lst->header;
    Node *update[MAX_LEVEL + 1];

    // Buscar la posición de inserción, guardando el camino en 'update'
    for (int i = lst->level; i >= 0; i--) {
        while (current->forward[i] != NULL && current->forward[i]->key < key) {
            current = current->forward[i];
        }
        update[i] = current;
    }

    current = current->forward[0];

    // Si la llave no existe, insertarla
    if (current == NULL || current->key != key) {
        int rlevel = randomLevel();

        // Si el nuevo nivel es mayor al actual, actualizar el header
        if (rlevel > lst->level) {
            for (int i = lst->level + 1; i <= rlevel; i++) {
                update[i] = lst->header;
            }
            lst->level = rlevel;
        }

        Node *n = createNode(key, rlevel);

        // Reajustar los punteros
        for (int i = 0; i <= rlevel; i++) {
            n->forward[i] = update[i]->forward[i];
            update[i]->forward[i] = n;
        }
        printf("Insertado: %d (Nivel %d)\n", key, rlevel);
    }
}

// Buscar un elemento
void search(SkipList *lst, int key) {
    Node *current = lst->header;

    for (int i = lst->level; i >= 0; i--) {
        while (current->forward[i] != NULL && current->forward[i]->key < key) {
            current = current->forward[i];
        }
    }

    current = current->forward[0];

    if (current != NULL && current->key == key) {
        printf("Encontrado: %d\n", key);
    } else {
        printf("No encontrado: %d\n", key);
    }
}

// Eliminar un elemento
void deleteNode(SkipList *lst, int key) {
    Node *current = lst->header;
    Node *update[MAX_LEVEL + 1];

    // 1. Buscar el nodo y guardar el camino
    for (int i = lst->level; i >= 0; i--) {
        while (current->forward[i] != NULL && current->forward[i]->key < key) {
            current = current->forward[i];
        }
        update[i] = current;
    }

    current = current->forward[0];

    // 2. Si el nodo existe, procedemos a eliminarlo
    if (current != NULL && current->key == key) {
        // 3. Reajustar los punteros para "saltarse" el nodo
        for (int i = 0; i <= lst->level; i++) {
            // Si el puntero en este nivel no apuntaba al nodo a borrar, terminamos el ajuste
            if (update[i]->forward[i] != current) {
                break;
            }
            update[i]->forward[i] = current->forward[i];
        }

        // Liberar la memoria del nodo y de su arreglo de punteros
        free(current->forward);
        free(current);
        printf("Eliminado: %d\n", key);

        // 4. Reducir el nivel máximo de la Skip List si los niveles superiores quedaron vacíos
        while (lst->level > 0 && lst->header->forward[lst->level] == NULL) {
            lst->level--;
        }
    } else {
        printf("Error al eliminar: %d no encontrado.\n", key);
    }
}

// Imprimir la estructura (para depuración)
void printList(SkipList *lst) {
    printf("\n--- Estado de la Skip List ---\n");
    for (int i = 0; i <= lst->level; i++) {
        Node *node = lst->header->forward[i];
        printf("Nivel %d: ", i);
        while (node != NULL) {
            printf("%d -> ", node->key);
            node = node->forward[i];
        }
        printf("NULL\n");
    }
    printf("------------------------------\n\n");
}

int main() {
    srand(time(0));
    SkipList *lst = createSkipList();

    // Inserciones
    insert(lst, 3);
    insert(lst, 6);
    insert(lst, 7);
    insert(lst, 9);
    insert(lst, 12);
    insert(lst, 19);

    printList(lst);

    // Pruebas de búsqueda
    search(lst, 19);
    
    // Pruebas de eliminación
    deleteNode(lst, 7);  // Borrado en el medio
    deleteNode(lst, 19); // Borrado al final
    deleteNode(lst, 100); // Intento de borrar algo que no existe

    printList(lst); // Verificar cómo quedó la estructura

    return 0;
}