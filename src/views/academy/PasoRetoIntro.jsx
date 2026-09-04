import { conNegrillas } from '../../utils/texto.jsx';

// Paso de tipo 'retoIntro': la bienvenida del Centro de novedades. Igual que
// la portada, pero el llamado a la acción va dentro del "sobre", que es una
// imagen de fondo (ver `fondoImagen` en academyDatos.js).
export default function PasoRetoIntro({ paso, onContinuar }) {
  return (
    <>
      <h2 className="academy-reto-titulo">{conNegrillas(paso.titulo)}</h2>
      {paso.subtitulo && (
        <p className="academy-reto-sub">{paso.subtitulo}</p>
      )}

      {paso.personaje && (
        <img className="academy-reto-personaje" src={paso.personaje} alt="" />
      )}

      {/* El texto va encima de la parte crema del PNG del sobre; la altura la
          dice `sobreArriba`. */}
      <div
        className="academy-sobre"
        style={paso.sobreArriba ? { '--sobre-arriba': paso.sobreArriba } : undefined}
      >
        <h3 className="academy-sobre-titulo">{paso.tituloSobre}</h3>
        <p className="academy-sobre-texto">{paso.textoSobre}</p>

        {/* El texto del botón trae \n en los datos: lo respeta el
            white-space:pre-line del CSS. */}
        <button type="button" className="academy-sobre-btn" onClick={onContinuar}>
          {paso.textoBoton}
        </button>
      </div>
    </>
  );
}
