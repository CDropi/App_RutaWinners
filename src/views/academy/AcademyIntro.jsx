import { conNegrillas } from '../../utils/texto.jsx';
import BotonRegresar from '../../components/BotonRegresar.jsx';

// Pantalla 1 de Academy: bienvenida. El contenido viene de
// academyDatos.js (ACADEMY.intro) y lo pasa AcademyView.
export default function AcademyIntro({ logo, nombre, intro, onSalir, onEmpezar }) {
  return (
    <div className="academy-view">
      {/* Fondo propio de la pantalla: naranja plano con un damero muy tenue
          y una forma redondeada abajo. Va en su propia capa para que quede
          por detrás del contenido y no dependa del fondo del body. */}
      <div className="academy-fondo" aria-hidden="true" />

      {/* Badge blanco de Academy, pegado al borde de arriba como en el
          diseño. Si algún día se quita el logo de academyDatos.js, cae en el
          nombre en texto para no dejar la pantalla sin encabezado. */}
      <div className="academy-badge">
        {logo
          ? <img src={logo} alt={nombre} />
          : <span className="academy-badge-texto">{nombre}</span>}
      </div>

      {/* Flecha (no casa): esta es la primera pantalla de Academy, así que
          "atrás" y "salir al mapa" son lo mismo y la flecha se entiende
          mejor. La casa se usa en las pantallas de más adentro, donde sí hay
          diferencia entre devolverse un paso y salir de Academy. */}
      <BotonRegresar
        onClick={onSalir}
        flotante
        etiqueta="Volver a la Ruta Winner"
      />

      <p className="academy-texto">{conNegrillas(intro.texto)}</p>

      <img className="academy-codi" src={intro.imagen} alt="" />

      <button type="button" className="academy-btn" onClick={onEmpezar}>
        {intro.textoBoton}
      </button>
    </div>
  );
}
