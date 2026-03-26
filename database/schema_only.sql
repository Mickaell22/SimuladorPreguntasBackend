--
-- PostgreSQL database dump
--


-- Dumped from database version 18.1 (Debian 18.1-2)
-- Dumped by pg_dump version 18.1 (Debian 18.1-2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: simulador; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA simulador;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: bloques; Type: TABLE; Schema: simulador; Owner: -
--

CREATE TABLE simulador.bloques (
    id_bloque smallint NOT NULL,
    nombre character varying(50) NOT NULL
);


--
-- Name: examenes; Type: TABLE; Schema: simulador; Owner: -
--

CREATE TABLE simulador.examenes (
    id integer NOT NULL,
    id_usuario integer NOT NULL,
    id_bloque smallint NOT NULL,
    total integer NOT NULL,
    correctas integer NOT NULL,
    puntaje numeric(8,2) NOT NULL,
    fecha timestamp with time zone DEFAULT now()
);


--
-- Name: examenes_id_seq; Type: SEQUENCE; Schema: simulador; Owner: -
--

CREATE SEQUENCE simulador.examenes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: examenes_id_seq; Type: SEQUENCE OWNED BY; Schema: simulador; Owner: -
--

ALTER SEQUENCE simulador.examenes_id_seq OWNED BY simulador.examenes.id;


--
-- Name: informacion_bloque; Type: TABLE; Schema: simulador; Owner: -
--

CREATE TABLE simulador.informacion_bloque (
    id_bloque integer NOT NULL,
    carreras jsonb DEFAULT '[]'::jsonb NOT NULL,
    config_materias jsonb DEFAULT '[]'::jsonb NOT NULL
);


--
-- Name: materias; Type: TABLE; Schema: simulador; Owner: -
--

CREATE TABLE simulador.materias (
    id_materia smallint NOT NULL,
    nombre character varying(100) NOT NULL
);


--
-- Name: materias_por_bloque; Type: TABLE; Schema: simulador; Owner: -
--

CREATE TABLE simulador.materias_por_bloque (
    id_bloque smallint NOT NULL,
    id_materia smallint NOT NULL
);


--
-- Name: preguntas; Type: TABLE; Schema: simulador; Owner: -
--

CREATE TABLE simulador.preguntas (
    id integer NOT NULL,
    id_bloque smallint NOT NULL,
    id_materia smallint NOT NULL,
    id_pregunta_local smallint NOT NULL,
    descripcion text NOT NULL,
    url_imagen text,
    opcion_a text NOT NULL,
    opcion_b text NOT NULL,
    opcion_c text NOT NULL,
    opcion_d text NOT NULL,
    respuesta_correcta character(1) NOT NULL,
    justificacion text,
    url_justificacion text,
    id_unidad smallint,
    id_tema smallint,
    CONSTRAINT preguntas_respuesta_correcta_check CHECK ((respuesta_correcta = ANY (ARRAY['a'::bpchar, 'b'::bpchar, 'c'::bpchar, 'd'::bpchar])))
);


--
-- Name: preguntas_id_seq; Type: SEQUENCE; Schema: simulador; Owner: -
--

CREATE SEQUENCE simulador.preguntas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: preguntas_id_seq; Type: SEQUENCE OWNED BY; Schema: simulador; Owner: -
--

ALTER SEQUENCE simulador.preguntas_id_seq OWNED BY simulador.preguntas.id;


--
-- Name: respuestas_examen; Type: TABLE; Schema: simulador; Owner: -
--

CREATE TABLE simulador.respuestas_examen (
    id_examen integer NOT NULL,
    id_pregunta integer NOT NULL,
    respuesta_usuario character(1),
    correcta boolean NOT NULL
);


--
-- Name: temas; Type: TABLE; Schema: simulador; Owner: -
--

CREATE TABLE simulador.temas (
    id_bloque smallint NOT NULL,
    id_materia smallint NOT NULL,
    id_unidad smallint NOT NULL,
    id_tema smallint NOT NULL,
    nombre_tema text NOT NULL
);


--
-- Name: unidades; Type: TABLE; Schema: simulador; Owner: -
--

CREATE TABLE simulador.unidades (
    id_bloque smallint NOT NULL,
    id_materia smallint NOT NULL,
    id_unidad smallint NOT NULL,
    nombre_unidad text NOT NULL
);


--
-- Name: usuarios; Type: TABLE; Schema: simulador; Owner: -
--

CREATE TABLE simulador.usuarios (
    id integer NOT NULL,
    nombre character varying(100) NOT NULL,
    apellido character varying(100) NOT NULL,
    email character varying(200) NOT NULL,
    cedula character varying(20) NOT NULL,
    telefono character varying(20),
    direccion text,
    tipo_institucion character varying(100),
    contrasena_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    rol character varying(20) DEFAULT 'usuario'::character varying NOT NULL
);


--
-- Name: usuarios_id_seq; Type: SEQUENCE; Schema: simulador; Owner: -
--

CREATE SEQUENCE simulador.usuarios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: usuarios_id_seq; Type: SEQUENCE OWNED BY; Schema: simulador; Owner: -
--

ALTER SEQUENCE simulador.usuarios_id_seq OWNED BY simulador.usuarios.id;


--
-- Name: examenes id; Type: DEFAULT; Schema: simulador; Owner: -
--

ALTER TABLE ONLY simulador.examenes ALTER COLUMN id SET DEFAULT nextval('simulador.examenes_id_seq'::regclass);


--
-- Name: preguntas id; Type: DEFAULT; Schema: simulador; Owner: -
--

ALTER TABLE ONLY simulador.preguntas ALTER COLUMN id SET DEFAULT nextval('simulador.preguntas_id_seq'::regclass);


--
-- Name: usuarios id; Type: DEFAULT; Schema: simulador; Owner: -
--

ALTER TABLE ONLY simulador.usuarios ALTER COLUMN id SET DEFAULT nextval('simulador.usuarios_id_seq'::regclass);


--
-- Name: bloques bloques_pkey; Type: CONSTRAINT; Schema: simulador; Owner: -
--

ALTER TABLE ONLY simulador.bloques
    ADD CONSTRAINT bloques_pkey PRIMARY KEY (id_bloque);


--
-- Name: examenes examenes_pkey; Type: CONSTRAINT; Schema: simulador; Owner: -
--

ALTER TABLE ONLY simulador.examenes
    ADD CONSTRAINT examenes_pkey PRIMARY KEY (id);


--
-- Name: informacion_bloque informacion_bloque_pkey; Type: CONSTRAINT; Schema: simulador; Owner: -
--

ALTER TABLE ONLY simulador.informacion_bloque
    ADD CONSTRAINT informacion_bloque_pkey PRIMARY KEY (id_bloque);


--
-- Name: materias materias_pkey; Type: CONSTRAINT; Schema: simulador; Owner: -
--

ALTER TABLE ONLY simulador.materias
    ADD CONSTRAINT materias_pkey PRIMARY KEY (id_materia);


--
-- Name: materias_por_bloque materias_por_bloque_pkey; Type: CONSTRAINT; Schema: simulador; Owner: -
--

ALTER TABLE ONLY simulador.materias_por_bloque
    ADD CONSTRAINT materias_por_bloque_pkey PRIMARY KEY (id_bloque, id_materia);


--
-- Name: preguntas preguntas_id_bloque_id_materia_id_pregunta_local_key; Type: CONSTRAINT; Schema: simulador; Owner: -
--

ALTER TABLE ONLY simulador.preguntas
    ADD CONSTRAINT preguntas_id_bloque_id_materia_id_pregunta_local_key UNIQUE (id_bloque, id_materia, id_pregunta_local);


--
-- Name: preguntas preguntas_pkey; Type: CONSTRAINT; Schema: simulador; Owner: -
--

ALTER TABLE ONLY simulador.preguntas
    ADD CONSTRAINT preguntas_pkey PRIMARY KEY (id);


--
-- Name: respuestas_examen respuestas_examen_pkey; Type: CONSTRAINT; Schema: simulador; Owner: -
--

ALTER TABLE ONLY simulador.respuestas_examen
    ADD CONSTRAINT respuestas_examen_pkey PRIMARY KEY (id_examen, id_pregunta);


--
-- Name: temas temas_pkey; Type: CONSTRAINT; Schema: simulador; Owner: -
--

ALTER TABLE ONLY simulador.temas
    ADD CONSTRAINT temas_pkey PRIMARY KEY (id_bloque, id_materia, id_unidad, id_tema);


--
-- Name: unidades unidades_pkey; Type: CONSTRAINT; Schema: simulador; Owner: -
--

ALTER TABLE ONLY simulador.unidades
    ADD CONSTRAINT unidades_pkey PRIMARY KEY (id_bloque, id_materia, id_unidad);


--
-- Name: usuarios usuarios_cedula_key; Type: CONSTRAINT; Schema: simulador; Owner: -
--

ALTER TABLE ONLY simulador.usuarios
    ADD CONSTRAINT usuarios_cedula_key UNIQUE (cedula);


--
-- Name: usuarios usuarios_email_key; Type: CONSTRAINT; Schema: simulador; Owner: -
--

ALTER TABLE ONLY simulador.usuarios
    ADD CONSTRAINT usuarios_email_key UNIQUE (email);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: simulador; Owner: -
--

ALTER TABLE ONLY simulador.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- Name: examenes examenes_id_bloque_fkey; Type: FK CONSTRAINT; Schema: simulador; Owner: -
--

ALTER TABLE ONLY simulador.examenes
    ADD CONSTRAINT examenes_id_bloque_fkey FOREIGN KEY (id_bloque) REFERENCES simulador.bloques(id_bloque);


--
-- Name: examenes examenes_id_usuario_fkey; Type: FK CONSTRAINT; Schema: simulador; Owner: -
--

ALTER TABLE ONLY simulador.examenes
    ADD CONSTRAINT examenes_id_usuario_fkey FOREIGN KEY (id_usuario) REFERENCES simulador.usuarios(id);


--
-- Name: informacion_bloque informacion_bloque_id_bloque_fkey; Type: FK CONSTRAINT; Schema: simulador; Owner: -
--

ALTER TABLE ONLY simulador.informacion_bloque
    ADD CONSTRAINT informacion_bloque_id_bloque_fkey FOREIGN KEY (id_bloque) REFERENCES simulador.bloques(id_bloque);


--
-- Name: materias_por_bloque materias_por_bloque_id_bloque_fkey; Type: FK CONSTRAINT; Schema: simulador; Owner: -
--

ALTER TABLE ONLY simulador.materias_por_bloque
    ADD CONSTRAINT materias_por_bloque_id_bloque_fkey FOREIGN KEY (id_bloque) REFERENCES simulador.bloques(id_bloque);


--
-- Name: materias_por_bloque materias_por_bloque_id_materia_fkey; Type: FK CONSTRAINT; Schema: simulador; Owner: -
--

ALTER TABLE ONLY simulador.materias_por_bloque
    ADD CONSTRAINT materias_por_bloque_id_materia_fkey FOREIGN KEY (id_materia) REFERENCES simulador.materias(id_materia);


--
-- Name: preguntas preguntas_id_bloque_fkey; Type: FK CONSTRAINT; Schema: simulador; Owner: -
--

ALTER TABLE ONLY simulador.preguntas
    ADD CONSTRAINT preguntas_id_bloque_fkey FOREIGN KEY (id_bloque) REFERENCES simulador.bloques(id_bloque);


--
-- Name: preguntas preguntas_id_materia_fkey; Type: FK CONSTRAINT; Schema: simulador; Owner: -
--

ALTER TABLE ONLY simulador.preguntas
    ADD CONSTRAINT preguntas_id_materia_fkey FOREIGN KEY (id_materia) REFERENCES simulador.materias(id_materia);


--
-- Name: respuestas_examen respuestas_examen_id_examen_fkey; Type: FK CONSTRAINT; Schema: simulador; Owner: -
--

ALTER TABLE ONLY simulador.respuestas_examen
    ADD CONSTRAINT respuestas_examen_id_examen_fkey FOREIGN KEY (id_examen) REFERENCES simulador.examenes(id);


--
-- Name: respuestas_examen respuestas_examen_id_pregunta_fkey; Type: FK CONSTRAINT; Schema: simulador; Owner: -
--

ALTER TABLE ONLY simulador.respuestas_examen
    ADD CONSTRAINT respuestas_examen_id_pregunta_fkey FOREIGN KEY (id_pregunta) REFERENCES simulador.preguntas(id);


--
-- Name: temas temas_id_bloque_id_materia_id_unidad_fkey; Type: FK CONSTRAINT; Schema: simulador; Owner: -
--

ALTER TABLE ONLY simulador.temas
    ADD CONSTRAINT temas_id_bloque_id_materia_id_unidad_fkey FOREIGN KEY (id_bloque, id_materia, id_unidad) REFERENCES simulador.unidades(id_bloque, id_materia, id_unidad);


--
-- Name: unidades unidades_id_bloque_fkey; Type: FK CONSTRAINT; Schema: simulador; Owner: -
--

ALTER TABLE ONLY simulador.unidades
    ADD CONSTRAINT unidades_id_bloque_fkey FOREIGN KEY (id_bloque) REFERENCES simulador.bloques(id_bloque);


--
-- Name: unidades unidades_id_materia_fkey; Type: FK CONSTRAINT; Schema: simulador; Owner: -
--

ALTER TABLE ONLY simulador.unidades
    ADD CONSTRAINT unidades_id_materia_fkey FOREIGN KEY (id_materia) REFERENCES simulador.materias(id_materia);






--
-- Permisos para usuario de aplicacion
--

DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'simulador_app') THEN
    CREATE ROLE simulador_app LOGIN PASSWORD 'Sim2024AppSecure9x';
  END IF;
END \$\$;

GRANT USAGE ON SCHEMA simulador TO simulador_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA simulador TO simulador_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA simulador TO simulador_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA simulador GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO simulador_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA simulador GRANT USAGE, SELECT ON SEQUENCES TO simulador_app;

--
-- PostgreSQL database dump complete
--
