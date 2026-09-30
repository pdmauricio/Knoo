-- Declaramos la función en C que actuará como "manejador" (handler)
CREATE FUNCTION skiplisthandler(internal)
RETURNS index_am_handler
AS 'MODULE_PATHNAME'
LANGUAGE C STRICT;

-- Registramos el Access Method en el motor
CREATE ACCESS METHOD skiplist TYPE INDEX HANDLER skiplisthandler;