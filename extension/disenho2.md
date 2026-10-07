# Diseño de Almacenamiento: Skip List en PostgreSQL

Para llevar nuestra Skip List a PostgreSQL, tenemos que olvidar los `malloc` y los punteros de RAM. Como los datos deben sobrevivir en el disco duro, **cada página física de 8KB actúa como un solo "nodo gigante"** de nuestra estructura.

El problema es: ¿cómo enlazamos estas páginas si ya no podemos usar punteros de C (`Node **`)? 

La magia ocurre en el **Special Space**. Es un espacio seguro que PostgreSQL nos reserva exactamente al final de cada página de 8KB. Ahí incrustamos nuestra estructura de enrutamiento (`SkipListOpaqueData`), la cual tiene dos piezas clave:

*   **`max_level`**: La "altura" (nivel probabilístico) que alcanzó esta página al momento de insertarse.
*   **`forward[]`**: Nuestro reemplazo directo para los punteros `->next`. Es un arreglo de `BlockNumber` (números enteros). En vez de apuntar a una dirección de memoria volátil, cada número es el ID físico de la siguiente página en el disco duro. Si no hay siguiente página, usamos `InvalidBlockNumber` (nuestro equivalente exacto a `NULL`).

```text
[DIAGRAMA LÓGICO: De Memoria Dinámica a Bloques de Disco]

Estructura RAM (C Standalone)       Estructura Disco (PostgreSQL)
+-------------------+               +--------------------------------------+
| struct Node       |               | Página de 8KB (Bloque Físico)        |
| int key = 15;     |               | [Page Header]                        |
|                   |               | [Item Pointers]                      |
| Node **forward ---+--- (RAM) ---> | [Tupla: Llave 15 + TID]              |
+-------------------+               | [Espacio Libre]                      |
                                    |--------------------------------------|
                                    | SPECIAL SPACE (SkipListOpaqueData)   |
                                    |  - max_level: 2                      |
                                    |  - forward[0]: Apunta al Bloque 5    |
                                    |  - forward[1]: Apunta al Bloque 8    |
                                    |  - forward[2]: InvalidBlockNumber    |
                                    +--------------------------------------+