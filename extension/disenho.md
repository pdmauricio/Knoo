
# Skip List C 
SkipList de C estándar Convertimos cada bloque físico de 8KB en un "macro-nodo" de la estructura.
En lugar de instanciar pequeños nodos dinámicos con malloc y enlazarlos mediante punteros de memoria (Node **), cada inserción reserva una página entera de 8KB. Para vincular estas páginas entre sí sin corromper la cabecera estándar ni los datos insertados, utilizamos el Special Space: una sección de tamaño fijo diseñada por Postgres que se ubica exactamente al final de cada página de índice.

Dentro de este Special Space incrustamos nuestra estructura SkipListOpaqueData, la cual representa la tabla de enrutamiento de ese nodo:

- uint16 max_level: El nivel probabilístico máximo que alcanzó esta página al momento de insertarse.

- BlockNumber forward[SKIPLIST_MAXLEVEL]: El reemplazo directo de los punteros C. Es un arreglo estático de IDs de bloque (enteros). En lugar de apuntar a una dirección de memoria RAM, cada índice apunta al bloque físico de la siguiente página en ese nivel. Se utiliza InvalidBlockNumber como el equivalente exacto a NULL para marcar el final de un nivel.

# Preguntas
## 1. ¿Por qué usamos una página entera de 8KB para almacenar una sola llave en lugar de agruparlas?
Es una decisión de diseño basada en la rúbrica para mantener el modelo simplificado. En un índice B-Tree real, una página agrupa cientos de llaves hasta llenarse y luego se divide (page split). Nosotros omitimos esa complejidad algorítmica y tratamos cada bloque de 8KB como un nodo individual. Es ineficiente a nivel de almacenamiento en disco, pero demuestra perfectamente el uso del Buffer Manager y la lógica de enlaces sin el riesgo de corromper la memoria en el tiempo límite.

## 2. ¿Cómo reemplazamos los punteros de memoria dinámica (->next) en la base de datos?
Usando BlockNumber. En memoria RAM, un puntero apunta a una dirección hexadecimal volátil. En Postgres, un BlockNumber es un número entero (uint32) que representa el ID de un bloque físico en el disco duro. Para decir "este nodo no apunta a nada" (el equivalente a NULL), usamos la constante nativa InvalidBlockNumber.

## 3. ¿Qué es exactamente el Special Space y por qué lo usamos?
Es una sección de tamaño fijo que PostgreSQL nos permite reservar al final de cada página de 8KB. Si metiéramos nuestros metadatos mezclados con los datos del usuario, romperíamos la estructura interna de lectura de Postgres. Al usar el Special Space, aislamos de forma segura nuestro arreglo de punteros forward[] y el nivel probabilístico (max_level) sin interferir con las tuplas reales.

## 4. ¿Qué pasa si olvidamos poner MarkBufferDirty(buffer) después de insertar un nodo?
Es un fallo crítico. Postgres lee las páginas del disco a la memoria RAM compartida. Si insertas datos o cambias un BlockNumber pero no marcas el buffer como "sucio" (dirty), el motor asume que la página no ha cambiado. Cuando necesite liberar RAM, simplemente descartará la página y tus datos jamás se escribirán en el disco duro.

## 5. ¿Cómo funciona la búsqueda sin tener un árbol binario?
La función skiplistgettuple imita los "saltos expresos" de una Skip List clásica. Inicia en el bloque raíz y en el nivel más alto (ej. nivel 3). Lee el BlockNumber de ese nivel; si la llave en ese bloque es menor a la que buscamos, "salta" físicamente a leer ese bloque del disco. Si es mayor, "baja" al nivel 2 en el mismo bloque y vuelve a intentar. Así descarta secciones masivas de datos rápidamente.

## 6. ¿Por qué tuvimos que declarar un CREATE OPERATOR CLASS en el script de SQL?
Porque PostgreSQL es agnóstico a los tipos de datos en los nuevos métodos de acceso. Al motor no le basta saber que vas a usar una skiplist; necesita que le enseñes explícitamente cómo comparar los datos que vas a indexar. Con la clase de operadores, le indicamos que para el tipo de dato int4, soporte 5 operadores de búsqueda (<, <=, =, >=, >) y utilice la función interna de C (btint4cmp) para saber cuál número es mayor.

## 7. En la función de inserción, ¿para qué se usa el parámetro ItemPointer heap_tid?
El índice no guarda los datos completos de la tabla, solo organiza la columna que indexaste (ej. el id). El heap_tid (Tuple Identifier) es la coordenada exacta (número de bloque + offset) donde vive la fila completa en el archivo real de la tabla. Cuando la Skip List encuentra el id buscado, le devuelve este TID a Postgres para que sepa exactamente dónde ir a leer el resto de las columnas.

# Guía Skip List en PostgreSQL

Para exponer este proyecto frente a un tribunal o profesor, estructuraremos la explicación en 5 actos clave. El objetivo es contar cómo resolvimos el problema arquitectónico de adaptar una estructura de memoria volátil (RAM) al almacenamiento persistente (disco) de un motor de bases de datos.

## Acto 1: El Objetivo 
**Mensaje clave: PostgreSQL no es una caja negra; es extensible.**

* **El contexto:** PostgreSQL usa por defecto el *B-Tree* para sus índices. Nuestro objetivo fue inyectarle una estructura de datos completamente distinta: una **Skip List** probabilística.
* **La solución:** No modificamos el código fuente de Postgres. Escribimos una extensión en C que actúa como un nuevo *Access Method* (Método de Acceso), enseñándole al motor cómo organizar y buscar datos usando nuestra propia lógica algorítmica.

## Acto 2: El Reto Arquitectónico (De la RAM al Disco)
**Mensaje clave: No podemos usar `malloc` en una base de datos.**

* **El problema:** En una implementación estándar de C, los nodos se crean dinámicamente con `malloc` y se enlazan con punteros de RAM. En una base de datos, la memoria RAM es volátil; todo debe vivir y persistir en el disco duro.
* **La regla estricta de Postgres:** El disco se lee y se escribe exclusivamente en bloques rígidos de **8KB** (páginas).
* **Nuestra adaptación:** Implementamos un modelo de **Macro-Nodos**. En lugar de crear miles de nodos pequeños, convertimos cada página física de 8KB en un solo nodo de nuestra Skip List, garantizando la compatibilidad con el *Buffer Manager* del motor.

## Acto 3: El Diseño del Nodo (El Special Space)
**Mensaje clave: Reemplazamos punteros de C por IDs de bloques físicos.**

* **Aislamiento de metadatos:** Para no mezclar nuestros metadatos de enrutamiento con los datos reales del usuario (que corrompería la lectura de Postgres), utilizamos el **Special Space**, un área reservada de tamaño fijo al final de cada página de 8KB.
* **Estructura `SkipListOpaqueData`:** Aquí almacenamos el nivel probabilístico (`max_level`) y el reemplazo de los punteros `->next`: un arreglo de **`BlockNumber`**. 
* **`BlockNumber` vs Punteros:** En lugar de apuntar a una dirección hexadecimal en RAM, un `BlockNumber` es un entero que representa el ID físico de la siguiente página en el disco. El equivalente a `NULL` es la constante nativa `InvalidBlockNumber`.

## Acto 4: El Ciclo de Vida (Cómo funciona por dentro)
**Mensaje clave: Respetamos estrictamente el flujo del Buffer Manager.**

1. **`CREATE INDEX` (Inicialización):** El motor llama a `skiplistbuild`. Solicitamos una página nueva (Bloque 0), la inicializamos con sus enlaces vacíos y marcamos el buffer como sucio (`MarkBufferDirty`) para forzar su escritura en disco.
2. **`INSERT` (Inserción):** La función `skiplist_insert_tuple` ejecuta tres fases:
   * Navega leyendo los `BlockNumber` para encontrar a los nodos "predecesores".
   * Calcula el nivel aleatorio (`random_level`).
   * Pide una nueva página de 8KB, guarda la tupla, y actualiza los arreglos `forward[]` de los predecesores apuntando al nuevo `BlockNumber`.
3. **`SELECT` (Búsqueda):** La función `skiplistgettuple` navega saltando por los `BlockNumber`. Al hallar la coincidencia, devuelve el **TID (Tuple Identifier)** a Postgres, indicando el bloque y offset exacto donde vive la fila completa en la tabla original.

## Acto 5: La Integración con SQL
**Mensaje clave: Postgres necesita saber cómo comparar nuestros datos.**

* **Enlace C-SQL:** El script `skiplist--1.0.sql` contiene el comando `CREATE ACCESS METHOD`, el cual vincula la interfaz SQL con nuestro *handler* compilado en C.
* **La Clase de Operadores (`OPERATOR CLASS`):** El motor es agnóstico a los tipos de datos en métodos de acceso externos. Tuvimos que definir una clase de operadores para indicarle que, al indexar un `int4`, debe soportar 5 estrategias de comparación (`<, <=, =, >=, >`) utilizando la función interna en C `btint4cmp`.

---

## Su rica Demostración
Para evidenciar que la estructura está consolidada físicamente en el disco y no simulada en RAM, desarrollamos la función de depuración `skiplist_dump('mi_indice_skip')`. Esta herramienta lee el índice directamente desde el disco e imprime en consola los saltos de bloque a bloque, nivel por nivel, demostrando la integridad de los enlaces físicos de la Skip List.