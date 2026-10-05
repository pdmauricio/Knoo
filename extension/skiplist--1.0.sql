
--se recibe memorias internas del motor, no datos como int,etc
CREATE FUNCTION skiplisthandler(internal)
-- retorna la estructura que rceamos con MakeNode
RETURNS index_am_handler
-- postgre reemplazara la extension
AS 'MODULE_PATHNAME'
-- indica que esta en C, y que la funcion tiene
-- que recibir algo no nulo como argumento
LANGUAGE C STRICT;




-- registramos oficialmente esta funcion como un metodo mas de postgre
-- los acccess methods pueden ser type index (pa indices)
-- o type table 
-- handler sirve para vincular el nuevo metodo de acceso 
-- con la funcion 
CREATE ACCESS METHOD skiplist TYPE INDEX HANDLER skiplisthandler;

-- cuando haga CREATE INDEX mi_idx ON mi_tabla USING skiplist (columna);

-- ver que quiero usar skiplist, 
-- busca skiplist en los registros de mi access method,
-- veremos que tiene un handler
-- ejecutara la funcion skiplisthandler que apuntara a module_pathname
-- mi codigo en C retornara la estructura indexAMroutine con los metadatos
-- postgre usara los metadatos para construri mi skiplist CSM

-- Definimos la clase de operadores por defecto para enteros
CREATE OPERATOR CLASS skiplist_int_ops
DEFAULT FOR TYPE int4 USING skiplist AS
    OPERATOR 1 <,
    OPERATOR 2 <=,
    OPERATOR 3 =,
    OPERATOR 4 >=,
    OPERATOR 5 >,
    FUNCTION 1 btint4cmp(int4, int4);


-- Tarea 10: funcion de depuracion que recorre la skip list nivel por nivel
-- y muestra (con NOTICE) las claves y bloques enlazados.
CREATE FUNCTION skiplist_dump(regclass)
RETURNS void
AS 'MODULE_PATHNAME'
LANGUAGE C STRICT;
