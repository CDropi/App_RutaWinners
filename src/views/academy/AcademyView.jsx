import { useState } from 'react';
import { ACADEMY } from '../../data/academyDatos.js';
import AcademyIntro from './AcademyIntro.jsx';
import AcademyCamino from './AcademyCamino.jsx';
import AcademyMision from './AcademyMision.jsx';
import '../../styles/academy.css';

// Contenedor de la mini experiencia de Academy. Academy tiene varias
// pantallas propias, así que aquí solo se decide cuál se muestra y se guarda
// el avance; el contenido de cada una vive en academyDatos.js y el dibujo en
// los componentes de esta misma carpeta.
//
// `onSalir` cierra Academy y devuelve al mapa de la Ruta Winner.
// `completada` es lo único que se guarda en la base de datos: si esta persona
//   ya terminó la actividad. Cuando llega en true se entra directo a la
//   pantalla de cierre, igual que un stand ya visitado.
// `onCompletar` avisa que se llegó al final para dejar el registro.
export default function AcademyView({ onSalir, completada = false, onCompletar }) {
  const estaciones = ACADEMY.camino.estaciones;

  // La estación y el paso que cierran la experiencia. Se buscan por la
  // bandera `marcaCompletado` en vez de dejarlos escritos acá, para que
  // reordenar o agregar pasos no rompa esta pantalla.
  const estacionFinal = estaciones.find(e => e.pasos?.some(p => p.marcaCompletado));
  const indiceFinal = estacionFinal
    ? estacionFinal.pasos.findIndex(p => p.marcaCompletado)
    : 0;

  // Pantalla visible: 'intro' | 'camino' | 'mision'.
  const [pantalla, setPantalla] = useState(completada && estacionFinal ? 'mision' : 'intro');

  // Estación cuya misión se está haciendo (solo cuando pantalla === 'mision').
  const [estacionActiva, setEstacionActiva] = useState(
    completada && estacionFinal ? estacionFinal : null
  );
  // Paso por el que arranca esa misión: el cierre si ya estaba completada.
  const [indiceInicial, setIndiceInicial] = useState(
    completada && estacionFinal ? indiceFinal : 0
  );

  // Avance de las estaciones dentro de la sesión. Si la persona ya completó
  // la actividad, todas se muestran en verde: se dio por hecho el recorrido
  // completo. En la base de datos solo está el sí/no, no el detalle.
  const [completadas, setCompletadas] = useState(
    () => (completada ? estaciones.map(e => e.id) : [])
  );

  function abrirEstacion(estacion) {
    setEstacionActiva(estacion);
    setIndiceInicial(0);
    setPantalla('mision');
  }

  function volverAlCamino() {
    setEstacionActiva(null);
    setIndiceInicial(0);
    setPantalla('camino');
  }

  function terminarMision() {
    if (estacionActiva) {
      setCompletadas(actuales =>
        actuales.includes(estacionActiva.id) ? actuales : [...actuales, estacionActiva.id]
      );
    }
    volverAlCamino();
  }

  if (pantalla === 'mision' && estacionActiva) {
    return (
      <AcademyMision
        // La key fuerza a rearmar la misión al cambiar de estación o de paso
        // de arranque, para que el índice interno no se quede pegado.
        key={`${estacionActiva.id}-${indiceInicial}`}
        logo={ACADEMY.logo}
        logoNaranja={ACADEMY.logoNaranja}
        nombre={ACADEMY.nombre}
        estacion={estacionActiva}
        indiceInicial={indiceInicial}
        onVolver={volverAlCamino}
        onTerminar={terminarMision}
        onSalir={onSalir}
        onCompletar={onCompletar}
      />
    );
  }

  if (pantalla === 'camino') {
    return (
      <AcademyCamino
        logo={ACADEMY.logo}
        nombre={ACADEMY.nombre}
        camino={ACADEMY.camino}
        completadas={completadas}
        onSalir={onSalir}
        onAbrirEstacion={abrirEstacion}
      />
    );
  }

  return (
    <AcademyIntro
      logo={ACADEMY.logo}
      nombre={ACADEMY.nombre}
      intro={ACADEMY.intro}
      onSalir={onSalir}
      onEmpezar={() => setPantalla('camino')}
    />
  );
}
