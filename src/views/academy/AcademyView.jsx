import { PUNTO_ACADEMY } from '../../config.js';
import { conNegrillas } from '../../utils/texto.jsx';
import BotonRegresar from '../../components/BotonRegresar.jsx';
import '../../styles/academy.css';

export default function AcademyView({ onRegresar, onEmpezar }) {
  const { logo, nombre, intro } = PUNTO_ACADEMY;

  return (
    <div className="academy-view">
      {/* Fondo propio de la pantalla: naranja plano con un damero muy tenue
          y una forma redondeada abajo. Va en su propia capa para que quede
          por detrás del contenido y no dependa del fondo del body. */}
      <div className="academy-fondo" aria-hidden="true" />

      {/* Badge blanco de Academy, pegado al borde de arriba como en el
          diseño. Si algún día se quita el logo de config.js, cae en el
          nombre en texto para no dejar la pantalla sin encabezado. */}
      <div className="academy-badge">
        {logo
          ? <img src={logo} alt={nombre} />
          : <span className="academy-badge-texto">{nombre}</span>}
      </div>

      <BotonRegresar onClick={onRegresar} flotante />

      <p className="academy-texto">{conNegrillas(intro.texto)}</p>

      <img className="academy-codi" src={intro.imagen} alt="" />

      <button type="button" className="academy-btn" onClick={onEmpezar}>
        {intro.textoBoton}
      </button>
    </div>
  );
}
