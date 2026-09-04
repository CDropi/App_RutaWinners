import { conNegrillas } from '../../utils/texto.jsx';

// Paso de tipo 'misionCompletada': el cierre de toda la experiencia de
// Academy. La barra de avance se muestra llena, con la medalla del premio.
export default function PasoMisionCompletada({ paso }) {
  return (
    <>
      <h2 className="academy-final-titulo">{conNegrillas(paso.titulo)}</h2>

      {paso.personaje && (
        <img className="academy-final-personaje" src={paso.personaje} alt="" />
      )}

      {/* Hoja blanca a sangre con la barra llena. Reusa las clases de la
          barra de avance de las misiones. */}
      <div className="academy-final-hoja">
        <div className="academy-mision-progreso">
          <div
            className="academy-mision-progreso-carril"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={100}
          >
            <div className="academy-mision-progreso-barra" style={{ width: '100%' }} />
          </div>
          <span className="academy-mision-progreso-medalla" aria-hidden="true">
            <span className="academy-mision-progreso-medalla-icono" />
          </span>
        </div>

        {paso.mensaje && (
          <p className="academy-final-mensaje">{conNegrillas(paso.mensaje)}</p>
        )}

      </div>
    </>
  );
}
