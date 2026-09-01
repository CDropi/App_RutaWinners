import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  EVENTO, MODO_PRUEBA, VIDEO_INTRO, IMAGEN_INTRO,
  IMAGEN_POPUP_PROMO, IMAGEN_FONDO_LOGIN, LOGO_LOGIN, LOGO_APP, URL_REGISTRO_LANDING,
  IMAGEN_MAPA_PLANO, STANDS, PREGUNTAS_EJEMPLO
} from '../config.js';
import {
  buscarPersonaPorId, obtenerTicketsDePersona, elegirDia,
  obtenerStandsCompletados, marcarStandCompletado,
  obtenerPremiosPersona, confirmarPremios, reiniciarDatosDePrueba
} from '../lib/dataLayer.js';
import { useEsMobil } from '../hooks/useEsMobil.js';
import SoloMobil from '../components/SoloMobil.jsx';
import '../styles/ingreso.css';

const TEST_IDS = ["3001234567", "3007654321", "3012223344", "3019998877", "3005556677"];

// Convierte "texto **resaltado** normal" en JSX: las partes entre
// **asteriscos** quedan en <strong>, y cada \n se vuelve un salto de línea
// real (<br />). Así, en config.js, cada marca controla negrillas y saltos
// de línea de su "bienvenida" sin tocar código.
function conNegrillas(texto) {
  if (!texto) return texto;
  return texto.split('\n').map((linea, i, arr) => (
    <span key={i}>
      {linea.split(/\*\*(.+?)\*\*/g).map((parte, j) =>
        j % 2 === 1 ? <strong key={j}>{parte}</strong> : parte
      )}
      {i < arr.length - 1 && <br />}
    </span>
  ));
}

// ---- Contraste automático del color de cada marca -----------------
// Sirve para decidir si el texto que va ENCIMA del color de una marca
// debe ser blanco o negro, según qué tan oscuro o claro sea ese color.
// Así, en config.js solo hay que poner el `colorPrimario` de cada marca
// y la app se encarga del contraste sola.

// Umbral de decisión (0 = negro absoluto, 1 = blanco absoluto).
// Si la luminancia del color es MENOR a este valor => el color es
// "oscuro" y el texto va blanco. Si es MAYOR => texto negro.
// Subirlo hace que más colores usen texto negro; bajarlo, más blanco.
const UMBRAL_OSCURIDAD = 0.35;

// Pasa un color hex ("#0DE8C0", "0de8c0", "#fff") a {r, g, b} (0-255).
// Si el valor no se puede leer, devuelve null.
function hexARgb(color) {
  if (typeof color !== 'string') return null;
  let hex = color.trim().replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join(''); // #fff -> #ffffff
  if (hex.length !== 6 || /[^0-9a-f]/i.test(hex)) return null;
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

// Luminancia relativa (norma WCAG). Devuelve un número de 0 a 1:
// 0 = negro, 1 = blanco. Pondera más el verde porque el ojo humano
// lo percibe más brillante que el rojo y el azul.
function luminancia(color) {
  const rgb = hexARgb(color);
  if (!rgb) return 0.5; // valor neutro si el color no se pudo leer
  const canal = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * canal(rgb.r) + 0.7152 * canal(rgb.g) + 0.0722 * canal(rgb.b);
}

// Devuelve el color de texto legible sobre el color dado:
// blanco si el fondo es oscuro, casi-negro si el fondo es claro.
function textoSobre(color) {
  return luminancia(color) < UMBRAL_OSCURIDAD ? '#FFFFFF' : '#111111';
}


const NAV_ITEMS = [
  { key: 'tickets', label: 'Tickets', icon: '/media/Tickets.svg', iconActivo: '/media/Tickets_2.svg' },
  { key: 'perfil', label: 'Perfil', icon: '/media/Perfil.svg', iconActivo: '/media/Perfil_2.svg' },
  { key: 'mapa', label: 'Mapa', icon: '/media/Mapa.svg', iconActivo: '/media/Mapa_2.svg' },
];

export default function Ingreso() {
  const esMobil = useEsMobil();
  const [introDone, setIntroDone] = useState(false);
  const [docValue, setDocValue] = useState('');
  const [errorHtml, setErrorHtml] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [persona, setPersona] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [tab, setTab] = useState('proximos');
  const [promoOpen, setPromoOpen] = useState(false);
  const [ticketModal, setTicketModal] = useState(null); // { dia, ticket } | null
  const [navActive, setNavActive] = useState(0);
  const [standActivo, setStandActivo] = useState(null); // stand elegido en el mapa (o null si estamos en el mapa)
  const [standsCompletados, setStandsCompletados] = useState([]); // ids de stands ya "pre-desbloqueados"
  const [premios, setPremios] = useState({ seleccionados: [], confirmado: false, entregados: [] });
  const [premiosAbierto, setPremiosAbierto] = useState(false); // pantalla de elegir/ver premios
  const navHoleX = `${navActive * 50}%`;

  const videoRef = useRef(null);

  // ---- Fondo de la pantalla (solo la imagen) ----
  useEffect(() => {
    document.body.style.backgroundImage = `url("${IMAGEN_FONDO_LOGIN}")`;
    return () => { document.body.style.backgroundImage = ''; };
  }, []);

  // ---- Cortinilla de video ----
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const terminar = () => setIntroDone(true);
    v.addEventListener('ended', terminar);
    v.addEventListener('error', terminar);
    v.play().catch(terminar);
    return () => {
      v.removeEventListener('ended', terminar);
      v.removeEventListener('error', terminar);
    };
  }, []);

  // ---- Escape cierra cualquier modal abierto ----
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        cerrarTicketModal();
        setPromoOpen(false);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [persona]);

  if (!esMobil) return <SoloMobil />;

  async function buscarEntrada(idOverride) {
    const idValue = (idOverride ?? docValue).trim();
    setErrorHtml('');
    if (!idValue) {
      setErrorHtml('Por favor <strong>ingresa tu número de celular</strong>.');
      return;
    }
    setBuscando(true);
    try {
      const personaEncontrada = await buscarPersonaPorId(idValue);
      if (!personaEncontrada) {
        setErrorHtml('Este número no se encuentra <strong>registrado</strong>.<br>Verifica el número o contacta a soporte.');
        return;
      }
      const misTickets = await obtenerTicketsDePersona(idValue);
      setPersona(personaEncontrada);
      setTickets(misTickets);
      setTab('proximos');
      obtenerStandsCompletados(idValue).then(setStandsCompletados).catch(() => {});
      obtenerPremiosPersona(idValue).then(setPremios).catch(() => {});
      // [TEMPORAL - oculto para la primera versión de prueba, no borrar]
      setPromoOpen(true);
    } catch (err) {
      console.error(err);
      setErrorHtml('Ocurrió un error al buscar tu registro. Intenta de nuevo.');
    } finally {
      setBuscando(false);
    }
  }

  async function handleElegirDia(dia) {
    const nuevoTicket = await elegirDia(persona.id, persona.nombre, dia.id);
    setTickets(prev => [...prev, nuevoTicket]);
    setTab('misEntradas');
  }

  // Se llama quien ya escaneó el QR correcto de un stand. Actualiza el
  // progreso local (para el mapa y el trofeo) sin tener que recargar todo.
  function manejarStandCompletado(standId) {
    setStandsCompletados(prev => (prev.includes(standId) ? prev : [...prev, standId]));
  }

  // Confirma la selección de premios de forma DEFINITIVA (no se puede
  // deshacer ni volver a llamar una vez que ya quedó confirmada).
  async function manejarConfirmarPremios(idsSeleccionados) {
    const actualizado = await confirmarPremios(persona.id, idsSeleccionados);
    setPremios(actualizado);
  }

  // ---- SOLO MODO_PRUEBA: para poder ver el flujo de premios completo sin
  // tener que escanear los 7 QR reales uno por uno. No toca Firebase; en
  // modo prueba todo vive en localStorage (ver dataLayer.js).
  async function simularCompletarTodosLosStands() {
    if (!MODO_PRUEBA || !persona) return;
    for (const stand of STANDS) {
      await marcarStandCompletado(persona.id, stand.id);
    }
    setStandsCompletados(await obtenerStandsCompletados(persona.id));
  }

  async function simularReiniciarProgreso() {
    if (!MODO_PRUEBA || !persona) return;
    reiniciarDatosDePrueba();
    const [misTickets, standsFrescos, premiosFrescos] = await Promise.all([
      obtenerTicketsDePersona(persona.id),
      obtenerStandsCompletados(persona.id),
      obtenerPremiosPersona(persona.id),
    ]);
    setTickets(misTickets);
    setStandsCompletados(standsFrescos);
    setPremios(premiosFrescos);
  }

  // Vuelve a consultar Firestore antes de mostrar "Mis entradas", para que
  // se refleje de inmediato si el staff ya escaneó alguna entrada (los
  // tickets solo se cargaban una vez, al iniciar sesión, y no se
  // actualizaban solos).
  async function abrirMisEntradas() {
    setTab('misEntradas');
    try {
      const misTickets = await obtenerTicketsDePersona(persona.id);
      setTickets(misTickets);
    } catch (err) {
      console.error(err);
    }
  }

  // Antes de abrir el modal con el QR, confirma el estado más reciente del
  // ticket (por si el staff lo escaneó justo antes de que la persona lo tocara).
  async function abrirTicket(dia, ticketPrevio) {
    try {
      const misTickets = await obtenerTicketsDePersona(persona.id);
      setTickets(misTickets);
      const fresco = misTickets.find(t => t.dia === dia.id) || ticketPrevio;
      setTicketModal({ dia, ticket: fresco });
    } catch (err) {
      console.error(err);
      setTicketModal({ dia, ticket: ticketPrevio });
    }
  }

  // Cierra el modal del ticket y de paso refresca los tickets — así, si el
  // staff escaneó la entrada mientras la persona tenía el QR abierto, al
  // cerrarlo ya ve el estado correcto sin tener que salir de la pestaña.
  async function cerrarTicketModal() {
    setTicketModal(null);
    if (!persona) return;
    try {
      const misTickets = await obtenerTicketsDePersona(persona.id);
      setTickets(misTickets);
    } catch (err) {
      console.error(err);
    }
  }

  const ticketsPorDia = (diaId) => tickets.find(t => t.dia === diaId);

  return (
    <>
      {!introDone && (
        <div id="introOverlay" style={{ backgroundImage: `url("${IMAGEN_INTRO}")` }}>
          <video ref={videoRef} src={VIDEO_INTRO} muted playsInline autoPlay preload="auto" />
        </div>
      )}

      <div id="mainContent" className={introDone ? 'visible' : ''}>

        {!persona && (
          <div className="login-card" id="loginCard">
            <h1 className="login-title">Bienvenido</h1>
            <img className="login-logo" src={LOGO_LOGIN} alt="Logo" />
            <p className="login-subtitle">Ingresa con <strong>tu número celular</strong></p>
            <label htmlFor="docInput" className="sr-only">Número de celular</label>
            <input
              id="docInput"
              className="login-input"
              inputMode="tel"
              autoComplete="off"
              value={docValue}
              onChange={e => setDocValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') buscarEntrada(); }}
            />
            {errorHtml && <div className="error-msg" style={{ display: 'block' }} dangerouslySetInnerHTML={{ __html: errorHtml }} />}
            <button id="btnBuscar" className="login-button" disabled={buscando} onClick={() => buscarEntrada()}>
              {buscando ? <><span className="spinner" />Buscando...</> : 'Ingresar'}
            </button>
            <div className="login-register">
              ¿Aún no tienes una cuenta? <br />
              <a href={URL_REGISTRO_LANDING} target="_blank" rel="noopener noreferrer">Regístrate aquí</a>
            </div>
            {MODO_PRUEBA && (
              <div className="test-ids" style={{ display: 'flex' }}>
                {TEST_IDS.map(id => (
                  <button key={id} type="button" onClick={() => { setDocValue(id); buscarEntrada(id); }}>{id}</button>
                ))}
              </div>
            )}
          </div>
        )}

        {persona && standActivo && (
          <div className="app-shell">
            <div className="app-scroll app-scroll--full">
              <ActividadStand
                key={standActivo.id}
                stand={standActivo}
                persona={persona}
                completado={standsCompletados.includes(standActivo.id)}
                standsCompletados={standsCompletados}
                onCompletar={manejarStandCompletado}
                onRegresar={() => setStandActivo(null)}
              />
            </div>
          </div>
        )}

        {persona && !standActivo && premiosAbierto && (
          <div className="app-shell">
            <div className="app-scroll">
              <PremiosView
                standsCompletados={standsCompletados}
                premios={premios}
                onConfirmar={manejarConfirmarPremios}
                onRegresar={() => setPremiosAbierto(false)}
              />
            </div>
          </div>
        )}

        {persona && !standActivo && !premiosAbierto && (
          <div className="app-shell">
            <div className={`app-scroll ${navActive === 2 ? 'app-scroll--full' : ''}`}>
              {navActive === 0 && (
                <>
                  <div className="app-header">
                    <img className="app-header-logo" src={LOGO_APP} alt="Logo" />
                    <h1 className="app-greeting">¡Hola <strong>{persona.nombre.split(' ')[0].toUpperCase()}</strong>!</h1>
                    <p className="app-greeting-sub">
                      Selecciona el día al que asistirás. Al <strong>elegir tu entrada</strong>, podrás{' '}
                      <strong>visualizar el código QR</strong> que deberás presentar en el ingreso al evento.
                    </p>
                  </div>

                  <div className="tabs">
                    <button type="button" className={`tab-btn ${tab === 'proximos' ? 'active' : ''}`} onClick={() => setTab('proximos')}>
                      Eventos Próximos
                    </button>
                    <button type="button" className={`tab-btn ${tab === 'misEntradas' ? 'active' : ''}`} onClick={abrirMisEntradas}>
                      Mis entradas
                      {tickets.filter(t => !t.checkedIn).length > 0 && (
                        <span className="tab-badge">{tickets.filter(t => !t.checkedIn).length}</span>
                      )}
                    </button>
                  </div>

                  {tab === 'proximos' && (
                    <div>
                      {EVENTO.dias.map(dia => (
                        <EventCard
                          key={dia.id}
                          dia={dia}
                          ticket={ticketsPorDia(dia.id)}
                          modo="proximo"
                          onElegir={() => handleElegirDia(dia)}
                        />
                      ))}
                    </div>
                  )}

                  {tab === 'misEntradas' && (
                    <div>
                      {EVENTO.dias
                        .map(dia => ({ dia, ticket: ticketsPorDia(dia.id) }))
                        .filter(x => x.ticket)
                        .map(({ dia, ticket }) => (
                          <EventCard
                            key={dia.id}
                            dia={dia}
                            ticket={ticket}
                            modo="entrada"
                            onAbrir={() => abrirTicket(dia, ticket)}
                          />
                        ))}
                      {tickets.length === 0 && (
                        <div className="empty-state" style={{ display: 'block' }}>
                          Aún no has adquirido ninguna entrada.<br />Ve a "Eventos Próximos" para elegir tu día.
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {navActive === 1 && (
                <PerfilView
                  persona={persona}
                  standsCompletados={standsCompletados}
                  premios={premios}
                  onAbrirPremios={() => setPremiosAbierto(true)}
                />
              )}
              {navActive === 2 && (
                <MapaView
                  onIniciar={setStandActivo}
                  standsCompletados={standsCompletados}
                  premios={premios}
                  onAbrirPremios={() => setPremiosAbierto(true)}
                  onSimularCompletarTodos={simularCompletarTodosLosStands}
                  onSimularReiniciar={simularReiniciarProgreso}
                />
              )}
            </div>

            <div className="nav-wrapper">
              <nav
                className="bottom-nav"
                style={{ '--nav-hole-x': navHoleX }}
              >
                <div className="nav-items-row">
                  {NAV_ITEMS.map((item, i) => (
                    <button
                      key={item.key}
                      type="button"
                      className={`nav-item ${i === navActive ? 'active' : ''}`}
                      aria-label={item.label}
                      onClick={() => setNavActive(i)}
                    >
                      <img src={item.icon} alt="" width={24} height={24} />
                    </button>
                  ))}
                </div>
              </nav>
              <div className="nav-indicator" style={{ transform: `translateX(${navActive * 100}%)` }}>
                <div className="nav-indicator-circle">
                  <img src={NAV_ITEMS[navActive].iconActivo} alt="" width={26} height={26} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {ticketModal && (
        <div className="ticket-modal open" onClick={e => { if (e.target === e.currentTarget) cerrarTicketModal(); }}>
          <div className="ticket-modal-inner">
            <button type="button" className="ticket-modal-close" onClick={cerrarTicketModal}>✕</button>
            <TicketCompleto dia={ticketModal.dia} ticket={ticketModal.ticket} nombre={persona?.nombre} />
          </div>
        </div>
      )}

      {promoOpen && (
        <div className="promo-modal open" onClick={e => { if (e.target === e.currentTarget) setPromoOpen(false); }}>
          <div className="promo-modal-inner">
            <button type="button" className="promo-modal-close" onClick={() => setPromoOpen(false)}>✕</button>
            <img src={IMAGEN_POPUP_PROMO} alt="Promoción" />
          </div>
        </div>
      )}
    </>
  );
}

function MapaView({ onIniciar, standsCompletados, premios, onAbrirPremios, onSimularCompletarTodos, onSimularReiniciar }) {
  const [pinAbierto, setPinAbierto] = useState(null); // id del stand con el tooltip abierto, o null
  const [trofeoAbierto, setTrofeoAbierto] = useState(false);

  // Cuánto hay que correr el popup en horizontal para que no se salga del
  // plano. 0 = centrado sobre el pin (el caso normal). Solo se usa en los
  // stands que están muy pegados al borde, como ATOM (x:9) o Chatea (x:91).
  const [corrimiento, setCorrimiento] = useState(0);
  const tooltipRef = useRef(null);

  function alternarPin(stand) {
    setPinAbierto(actual => (actual === stand.id ? null : stand.id));
  }

  const standAbierto = STANDS.find(s => s.id === pinAbierto) || null;
  const todosCompletados = standsCompletados.length === STANDS.length;

  // El panel del trofeo separa los stands en dos grupos. Se calculan a partir
  // de STANDS (y no reordenando el array original) para que el orden dentro de
  // cada grupo siga siendo el mismo que en config.js.
  const standsBloqueados = STANDS.filter(s => !standsCompletados.includes(s.id));
  const standsDesbloqueados = STANDS.filter(s => standsCompletados.includes(s.id));

  // Fila de un stand dentro del panel: isotipo de la marca a la izquierda,
  // nombre y estado a la derecha. Cuando está bloqueado el isotipo se atenúa
  // en escala de grises y se le pone el candado encima; al pre-desbloquearse
  // el candado desaparece y el isotipo se ve completo y a todo color.
  const ItemStand = ({ stand, hecho }) => (
    <div className={`trofeo-item ${hecho ? 'hecho' : ''}`}>
      <div className="trofeo-item-marca">
        {stand.isotipo
          ? <img className="trofeo-item-isotipo" src={stand.isotipo} alt="" />
          : <span className="trofeo-item-inicial">{stand.nombre.charAt(0)}</span>}
        {!hecho && (
          <span className="trofeo-item-candado" aria-hidden="true">
            <img src="/media/Candado.svg" alt="" />
          </span>
        )}
      </div>
      <span className="trofeo-item-nombre">{stand.nombre}</span>
      <span className="trofeo-item-estado">{hecho ? 'Pre-desbloqueado' : 'Bloqueado'}</span>
    </div>
  );

  // Cierra el popup al tocar cualquier parte de la pantalla que no sea un
  // pin ni el popup mismo (el mapa, el encabezado, el nav de abajo, etc.).
  // Se usa 'pointerdown' en el documento y no una capa invisible porque la
  // capa tapaba el nav inferior mientras el popup estuviera abierto.
  // 'pointerdown' se dispara antes que el onClick del pin, así que al pasar
  // de un pin a otro el toque se ignora aquí y lo maneja el propio pin.
  useEffect(() => {
    if (!pinAbierto) return;

    function alTocarFuera(e) {
      if (!(e.target instanceof Element)) return;
      if (e.target.closest('.mapa-pin, .mapa-tooltip')) return;
      setPinAbierto(null);
    }

    document.addEventListener('pointerdown', alTocarFuera);
    return () => document.removeEventListener('pointerdown', alTocarFuera);
  }, [pinAbierto]);

  // Se mide con useLayoutEffect (no useEffect) para que el corrimiento se
  // aplique ANTES de que el navegador pinte: así el popup no aparece
  // primero cortado y luego salta a su lugar.
  // Se usan offsetWidth/clientWidth y no getBoundingClientRect porque el
  // popup entra con una animación de scale, y el rect daría el ancho
  // reducido de la animación en curso.
  useLayoutEffect(() => {
    if (!standAbierto || !tooltipRef.current) {
      setCorrimiento(0);
      return;
    }
    const MARGEN = 10; // aire mínimo entre el popup y el borde del plano
    const popup = tooltipRef.current;
    const plano = popup.parentElement;
    const anchoPlano = plano.clientWidth;
    const anchoPopup = popup.offsetWidth;

    // Si el popup no cabe ni con márgenes, se centra en el plano y ya.
    if (anchoPopup + MARGEN * 2 >= anchoPlano) {
      setCorrimiento(anchoPlano / 2 - (standAbierto.x / 100) * anchoPlano);
      return;
    }

    const centroSobrePin = (standAbierto.x / 100) * anchoPlano;
    const centroMinimo = anchoPopup / 2 + MARGEN;
    const centroMaximo = anchoPlano - anchoPopup / 2 - MARGEN;
    const centroFinal = Math.min(Math.max(centroSobrePin, centroMinimo), centroMaximo);
    setCorrimiento(centroFinal - centroSobrePin);
  }, [standAbierto]);

  return (
    <div className="mapa-view">
      <div className="mapa-plano-wrap">
        {/* La capa invisible que cerraba el tooltip se reemplazó por un
            listener de 'pointerdown' en el documento (ver arriba): la capa
            era position:fixed inset:0 y bloqueaba el nav de abajo mientras
            el popup estuviera abierto.
            Versión anterior, por si se necesita revertir:
            {pinAbierto && <div className="mapa-plano-backdrop" onClick={() => setPinAbierto(null)} />}
        */}

        <div
          className="mapa-plano"
          style={IMAGEN_MAPA_PLANO ? { backgroundImage: `url("${IMAGEN_MAPA_PLANO}")` } : undefined}
        >
          {/* Capas de stands encendidos. Cada una es el plano completo
              (1080x1920) con un solo stand pintado en el color de su marca y
              el resto transparente, así que se superpone al plano base con
              las mismas reglas de tamaño y posición y calza exacto en
              cualquier pantalla.
              Solo se monta la del stand completado: así no se descargan las
              7 imágenes de entrada, que en el wifi del evento importa.
              Un stand sin `imagenMapaCompletado` simplemente no enciende, no
              se rompe nada. */}
          {STANDS.filter(
            stand => stand.imagenMapaCompletado && standsCompletados.includes(stand.id)
          ).map(stand => (
            <div
              key={`encendido-${stand.id}`}
              className="mapa-stand-encendido"
              style={{ backgroundImage: `url("${stand.imagenMapaCompletado}")` }}
              aria-hidden="true"
            />
          ))}
          {/* Encabezado del mapa: título + texto de apoyo. Van juntos en un
              contenedor para que el texto quede siempre pegado debajo del
              título, sin depender de un "top" calculado a mano. */}
          <div className="mapa-encabezado">
            <h2 className="mapa-titulo">Ruta <strong>Winners</strong></h2>
            <p className="mapa-texto">
              Explora el mapa de Expowinners y visita las marcas participantes.
            </p>
          </div>
          <img className="mapa-logo" src={LOGO_APP} alt="Expo Winners" />
          <button type="button" className="mapa-trofeo-btn" aria-label="Ver progreso" onClick={() => setTrofeoAbierto(true)}>
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M7 4h10v4.2c0 2.87-2.24 5.2-5 5.2s-5-2.33-5-5.2V4Z" fill="#fff"/>
              <path d="M7 5H4.5A1.5 1.5 0 0 0 3 6.5v.75C3 9.55 4.68 11 6.75 11H7" stroke="#fff" strokeWidth="1.6" strokeLinecap="round"/>
              <path d="M17 5h2.5A1.5 1.5 0 0 1 21 6.5v.75C21 9.55 19.32 11 17.25 11H17" stroke="#fff" strokeWidth="1.6" strokeLinecap="round"/>
              <path d="M12 13.4v3.1" stroke="#fff" strokeWidth="1.6" strokeLinecap="round"/>
              <path d="M8.3 20h7.4c.3-1.2-.4-2.2-1.6-2.4a12 12 0 0 0-4.2 0c-1.2.2-1.9 1.2-1.6 2.4Z" fill="#fff"/>
            </svg>
            {standsCompletados.length > 0 && (
              <span className="mapa-trofeo-badge">{standsCompletados.length}</span>
            )}
          </button>

          {!IMAGEN_MAPA_PLANO && (
            <div className="mapa-plano-placeholder">Plano en diseño — próximamente</div>
          )}

          {STANDS.map(stand => (
            <button
              key={stand.id}
              type="button"
              className={`mapa-pin ${pinAbierto === stand.id ? 'active' : ''} ${standsCompletados.includes(stand.id) ? 'done' : ''}`}
              style={{
                left: `${stand.x}%`,
                top: `${stand.y}%`,
                // El punto vuelve a ser naranja para todas las marcas, así
                // que el pin ya no necesita recibir --stand-color.
                // '--stand-color': stand.colorPrimario,
              }}
              onClick={() => alternarPin(stand)}
              aria-label={stand.nombre}
            >
              <span className="mapa-pin-dot" />
            </button>
          ))}

          {standAbierto && (
            <div
              className="mapa-tooltip"
              ref={tooltipRef}
              style={{
                left: `${standAbierto.x}%`,
                top: `${standAbierto.y}%`,
                // Corrimiento horizontal para que no se salga del plano.
                '--corrimiento': `${corrimiento}px`,
                // El botón del popup usa el color de la marca, y las letras
                // se calculan solas (blancas o negras) según qué tan oscuro
                // sea ese color. Misma lógica que en las pantallas de stand.
                '--stand-color': standAbierto.colorPrimario,
                '--stand-texto': textoSobre(standAbierto.colorPrimario),
              }}
            >
              <div className="mapa-tooltip-titulo">
                {standAbierto.logo
                  ? <img className="mapa-tooltip-logo" src={standAbierto.logo} alt={standAbierto.nombre} />
                  : <span>{standAbierto.nombre}</span>}
              </div>
              <button type="button" className="mapa-tooltip-btn" onClick={() => onIniciar(standAbierto)}>
                {standsCompletados.includes(standAbierto.id) ? 'Completado ✓' : 'Iniciar'}
              </button>
            </div>
          )}

          {/* Botón de premios, debajo de los stands. Queda deshabilitado
              hasta completar los 7; el contador se muestra solo mientras
              está bloqueado, para que se entienda por qué todavía no se
              puede tocar. */}
          <button
            type="button"
            className="mapa-reclamar"
            disabled={!todosCompletados}
            onClick={onAbrirPremios}
          >
            <span>{premios.confirmado ? 'Ver mis premios' : 'Reclamar premios'}</span>
            {!todosCompletados && (
              <span className="mapa-reclamar-contador">
                {standsCompletados.length}/{STANDS.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {trofeoAbierto && (
        <div className="trofeo-overlay" onClick={e => { if (e.target === e.currentTarget) setTrofeoAbierto(false); }}>
          <div className="trofeo-panel">
            <div className="trofeo-panel-header">
              <h3 className="trofeo-panel-titulo">Ruta <strong>Winners</strong></h3>
              <button type="button" className="trofeo-panel-cerrar" onClick={() => setTrofeoAbierto(false)} aria-label="Cerrar">✕</button>
            </div>
            <p className="trofeo-panel-progreso">
              {standsCompletados.length} de {STANDS.length} stands completados
            </p>
            {/* VERSIÓN ANTERIOR (una sola lista con ✓ / 🔒 como texto) — se
                deja comentada por si se necesita revertir:
            <div className="trofeo-lista">
              {STANDS.map(stand => {
                const hecho = standsCompletados.includes(stand.id);
                return (
                  <div key={stand.id} className={`trofeo-item ${hecho ? 'hecho' : ''}`}>
                    <span className="trofeo-item-icono">{hecho ? '✓' : '🔒'}</span>
                    <span className="trofeo-item-nombre">{stand.nombre}</span>
                    <span className="trofeo-item-estado">{hecho ? 'Pre-desbloqueado' : 'Bloqueado'}</span>
                  </div>
                );
              })}
            </div>
            */}

            {/* Lista agrupada: primero lo que falta (bloqueados) y debajo lo
                ya conseguido (pre-desbloqueados), con el isotipo de cada marca
                como identidad visual. Si un grupo queda vacío su encabezado no
                se renderiza, así que al completar los 7 stands el panel
                muestra solo la sección de pre-desbloqueados. */}
            <div className="trofeo-lista">
              {standsBloqueados.length > 0 && (
                <div className="trofeo-grupo">
                  <div className="trofeo-grupo-titulo">
                    Bloqueados
                    <span className="trofeo-grupo-contador">{standsBloqueados.length}</span>
                  </div>
                  {standsBloqueados.map(stand => (
                    <ItemStand key={stand.id} stand={stand} hecho={false} />
                  ))}
                </div>
              )}

              {standsDesbloqueados.length > 0 && (
                <div className="trofeo-grupo">
                  <div className="trofeo-grupo-titulo">
                    Pre-desbloqueados
                    <span className="trofeo-grupo-contador hecho">{standsDesbloqueados.length}</span>
                  </div>
                  {standsDesbloqueados.map(stand => (
                    <ItemStand key={stand.id} stand={stand} hecho />
                  ))}
                </div>
              )}
            </div>
            <p className="trofeo-panel-nota">
              {todosCompletados
                ? (premios.confirmado
                    ? 'Ya confirmaste tu selección de premios.'
                    : '¡Completaste toda la ruta! Ya puedes elegir tus premios.')
                : 'Los beneficios se desbloquean por completo cuando termines los 7 stands.'}
            </p>
            {todosCompletados && (
              <button
                type="button"
                className="actividad-btn trofeo-panel-cta"
                onClick={() => { setTrofeoAbierto(false); onAbrirPremios(); }}
              >
                {premios.confirmado ? 'Ver mis premios' : 'Elegir mis premios'}
              </button>
            )}

            {MODO_PRUEBA && (
              <div className="trofeo-panel-test">
                <div className="trofeo-panel-test-label">🧪 Solo modo prueba (no toca Firebase)</div>
                {!todosCompletados && (
                  <button type="button" className="trofeo-panel-test-btn" onClick={onSimularCompletarTodos}>
                    Completar los 7 stands
                  </button>
                )}
                <button type="button" className="trofeo-panel-test-btn secundario" onClick={onSimularReiniciar}>
                  Reiniciar progreso de prueba
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ActividadStand({ stand, persona, completado, standsCompletados, onCompletar, onRegresar }) {
  const preguntas = stand.preguntas || PREGUNTAS_EJEMPLO;
  const [paso, setPaso] = useState(completado ? 'yaCompletado' : 'portada');
  const [seleccionada, setSeleccionada] = useState(null); // índice de la opción marcada (preguntas de selección única)
  const [seleccionMultiple, setSeleccionMultiple] = useState([]); // índices marcados (preguntas de selección múltiple, ej. países de Fénix)
  const [errorQR, setErrorQR] = useState('');

  // Pregunta actual (solo tiene sentido cuando paso es un número, es decir,
  // cuando estamos en el flujo de preguntas y no en portada/scanner/éxito).
  const preguntaActual = typeof paso === 'number' ? preguntas[paso] : null;
  const esMultiple = !!preguntaActual?.multiple;
  const haySeleccion = esMultiple ? seleccionMultiple.length > 0 : seleccionada !== null;

  function comenzar() { setPaso(0); }

  function siguientePregunta() {
    if (!haySeleccion) return;
    setSeleccionada(null);
    setSeleccionMultiple([]);
    setErrorQR('');
    if (paso + 1 < preguntas.length) setPaso(paso + 1);
    else setPaso('scanner');
  }

  function alternarOpcion(i) {
    if (esMultiple) {
      setSeleccionMultiple((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));
    } else {
      setSeleccionada(i);
    }
  }

  // Enciende la cámara solo mientras estamos en el paso del scanner, y la
  // apaga apenas salimos de él (o se desmonta el componente).
  useEffect(() => {
    if (paso !== 'scanner') return;

    const qr = new Html5Qrcode('reader-actividad');
    let escaneando = false;
    let desmontado = false;
    let procesando = false;

    async function manejarCodigo(textoDecodificado) {
      if (procesando) return;
      const codigo = textoDecodificado.trim().toUpperCase();
      if (codigo !== stand.qrCode.toUpperCase()) {
        setErrorQR('Este QR no corresponde a este stand. Verifica que sea el código correcto.');
        return;
      }
      procesando = true;
      setErrorQR('');
      try {
        await marcarStandCompletado(persona.id, stand.id);
        onCompletar(stand.id);
        setPaso('exito');
      } catch (err) {
        console.error(err);
        setErrorQR('Ocurrió un error al validar tu código. Intenta de nuevo.');
        procesando = false;
      }
    }

    qr.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 220, height: 220 } },
      (decodedText) => manejarCodigo(decodedText),
      () => {}
    ).then(() => {
      escaneando = true;
      if (desmontado) qr.stop().catch(() => {});
    }).catch(() => {
      setErrorQR('No se pudo acceder a la cámara. Revisa los permisos e intenta de nuevo.');
    });

    return () => {
      desmontado = true;
      if (!escaneando) return;
      try {
        qr.stop().catch(() => {});
      } catch (e) {
        // no-op
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso]);

  // --stand-color: el color de la marca (viene de config.js).
  // --stand-texto: el color de las LETRAS que van encima de ese color.
  //   Se calcula solo: si el color de la marca es oscuro (ej. Fénix
  //   #0d1a5e) las letras quedan blancas; si es claro (ej. Groupack
  //   #fbea20) quedan negras. No hay que configurar nada por marca.
  // const estiloMarca = { '--stand-color': stand.colorPrimario }; // versión anterior (sin contraste automático)
  const estiloMarca = {
    '--stand-color': stand.colorPrimario,
    '--stand-texto': textoSobre(stand.colorPrimario),
  };
  if (stand.imagenFondo) estiloMarca['--stand-bg-image'] = `url("${stand.imagenFondo}")`;
  const claseMarca = `actividad-stand ${stand.imagenFondo ? 'tiene-fondo' : ''}`;

  // ---- SOLO MODO_PRUEBA: simula un escaneo exitoso del QR de este stand,
  // para poder probar el flujo completo sin tener el código físico a mano.
  async function simularEscaneoQR() {
    setErrorQR('');
    try {
      await marcarStandCompletado(persona.id, stand.id);
      onCompletar(stand.id);
      setPaso('exito');
    } catch (err) {
      console.error(err);
      setErrorQR('Ocurrió un error al validar tu código. Intenta de nuevo.');
    }
  }

  const Marca = ({ tamano = 'grande' }) => {
    const src = tamano === 'chico' ? (stand.isotipo || stand.logo) : stand.logo;
    return src
      ? <img className={`actividad-marca-logo ${tamano}`} src={src} alt={stand.nombre} />
      : <span className={`actividad-marca-texto ${tamano}`}>{stand.nombre}</span>;
  };

  const BotonAtras = () => (
    <button type="button" className="actividad-regresar" onClick={onRegresar} aria-label="Regresar">
      <img src="/media/Atras.svg" alt="" />
    </button>
  );

  if (paso === 'yaCompletado' || paso === 'exito') {
    // El beneficio específico solo se revela cuando la persona ya completó
    // TODOS los stands de la Ruta Winner. Así evitamos que alguien complete
    // un solo stand y vaya directo a reclamar el premio sin terminar el
    // recorrido — mientras falten stands, ve un mensaje genérico.
    const rutaCompleta = standsCompletados.length === STANDS.length;
    // Si la persona vuelve a entrar a un stand que ya había completado antes
    // (no lo acaba de validar ahora mismo), mostramos una versión reducida:
    // solo el logo y la caja del beneficio, sin el título "VALIDACIÓN
    // EXITOSA" ni el check — ese momento de celebración ya se mostró antes.
    const esRevisita = paso === 'yaCompletado';

    return (
      <div className={claseMarca} style={estiloMarca}>
        <BotonAtras />
        <div className="actividad-marca-header scanner"><Marca tamano="mediano" /></div>
        <div className={`actividad-exito ${esRevisita ? 'reducida' : ''}`}>
          {!esRevisita && (
            <>
              <h2 className="actividad-exito-titulo">
                VALIDACIÓN<br /><strong>EXITOSA</strong>
              </h2>
              <div className="actividad-exito-check">
                <img src="/media/Check.svg" alt="Validación exitosa" />
              </div>
            </>
          )}
          {esRevisita && (
            <h2 className="actividad-exito-titulo reducido">¡FELICIDADES!</h2>
          )}
          <div className="actividad-exito-premio">
            <span className="actividad-exito-premio-kicker">
              <svg viewBox="0 0 24 24" fill="#fff" xmlns="http://www.w3.org/2000/svg" width="11" height="11">
                <path d="M12 2.5l2.9 6.4 6.9.7-5.2 4.8 1.5 6.9L12 17.9l-6.1 3.4 1.5-6.9-5.2-4.8 6.9-.7Z"/>
              </svg>
              {rutaCompleta ? 'Beneficio desbloqueado' : 'Beneficio obtenido'}
            </span>
            <p className="actividad-exito-premio-texto">
              {rutaCompleta
                ? conNegrillas(stand.mensajeExito || `**¡Felicidades!**\nYa obtuviste el beneficio de ${stand.nombre}.\n\nCompletaste toda la Ruta Winner.`)
                : conNegrillas(`Ya tienes el beneficio de ${stand.nombre} (${standsCompletados.length}/${STANDS.length}).\n\nCompleta **todos los stands** de la Ruta Winner para descubrir cuál es tu beneficio.`)}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={claseMarca} style={estiloMarca}>
      <BotonAtras />

      {paso === 'portada' && (
        <div className="actividad-portada">
          <div className="actividad-portada-marca">
            <span className="actividad-portada-bienvenido">BIENVENIDO A</span>
            <Marca />
          </div>
          <div className="actividad-portada-card-wrap">
            <div className="actividad-portada-card">
              <p className="actividad-portada-texto">
                {conNegrillas(stand.bienvenida || 'Responde las siguientes preguntas y continúa tu recorrido para ganar una **nueva estrella**.')}
              </p>
              <button type="button" className="actividad-btn" onClick={comenzar}>Comenzar</button>
            </div>
          </div>
          <p className="actividad-portada-nota">
            <strong>¡Activa tus beneficios!</strong><br></br>Completa los stands respondiendo las preguntas y <strong>obtén beneficios durante tu recorrido.</strong>
          </p>
        </div>
      )}

      {typeof paso === 'number' && (
        <div className="actividad-pregunta">
          <div className="actividad-progreso-fila">
            <div className="actividad-progreso-label">RESPONDE Y<br/>PARTICIPA</div>
            <div className="actividad-progreso">
              <div className="actividad-progreso-track">
                <div className="actividad-progreso-barra" style={{ width: `${((paso + 1) / preguntas.length) * 100}%` }} />
              </div>
              <span className="actividad-progreso-frac">{paso + 1}/{preguntas.length}</span>
              <svg className="actividad-progreso-estrella" viewBox="0 0 24 24" fill="#fff" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2.5l2.9 6.4 6.9.7-5.2 4.8 1.5 6.9L12 17.9l-6.1 3.4 1.5-6.9-5.2-4.8 6.9-.7Z"/>
              </svg>
            </div>
          </div>

          <div className={`actividad-pregunta-card-wrap ${paso + 1 === preguntas.length ? 'es-ultima' : ''}`}>
            {paso + 1 < preguntas.length && <div className="actividad-pregunta-card-sombra" />}
            <div className="actividad-pregunta-card">
              <div className="actividad-pregunta-marca"><Marca tamano="chico" /></div>
              <h3 className="actividad-pregunta-texto">
                PREGUNTA <span> {paso + 1}</span>
              </h3>
              <p className="actividad-pregunta-enunciado">{preguntas[paso].texto}</p>
              <div className="actividad-opciones">
                {preguntas[paso].opciones.map((opcion, i) => {
                  const marcada = esMultiple ? seleccionMultiple.includes(i) : seleccionada === i;
                  return (
                    <button
                      key={i}
                      type="button"
                      className={`actividad-opcion ${marcada ? 'marcada' : ''}`}
                      onClick={() => alternarOpcion(i)}
                    >
                      <span className="actividad-opcion-letra">{String.fromCharCode(65 + i)}</span>
                      <span className="actividad-opcion-texto">{opcion}</span>
                      <span className="actividad-opcion-radio" />
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                className={`actividad-siguiente-btn ${paso + 1 === preguntas.length ? 'final' : ''}`}
                onClick={siguientePregunta}
                disabled={!haySeleccion}
              >
                {paso + 1 === preguntas.length ? 'Enviar respuestas' : 'Siguiente'}
              </button>
            </div>
          </div>

          {/*<p className="actividad-portada-nota">
            Contesta las preguntas y obtén <strong>la estrella de {stand.nombre}.</strong>
          </p>*/}
        </div>
      )}

      {paso === 'scanner' && (
        <div className="actividad-scanner">
          <div className="actividad-marca-header scanner"><Marca tamano="mediano" /></div>
          <h3 className="actividad-scanner-titulo">
            VALIDA TU<br /><strong>PARTICIPACIÓN</strong>
          </h3>
          <div className="actividad-scanner-frame">
            <div id="reader-actividad" />
            <span className="actividad-scanner-corner tl" />
            <span className="actividad-scanner-corner br" />
          </div>
      <p className="actividad-portada-nota">
            Escanea el QR del stand <strong>para validar tu visita</strong> y desbloquear su beneficio
          </p>
          {errorQR && <div className="actividad-scanner-error">{errorQR}</div>}
          {MODO_PRUEBA && (
            <button type="button" className="actividad-btn-prueba" onClick={simularEscaneoQR}>
              (Prueba) Simular escaneo exitoso
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function PremiosView({ standsCompletados, premios, onConfirmar, onRegresar }) {
  const total = STANDS.length;
  const completo = standsCompletados.length === total;
  const [seleccion, setSeleccion] = useState(premios.seleccionados || []);
  const [confirmando, setConfirmando] = useState(false);

  function alternarPremio(standId) {
    if (premios.confirmado) return; // ya quedó bloqueada, no se puede tocar
    setSeleccion(prev => prev.includes(standId) ? prev.filter(id => id !== standId) : [...prev, standId]);
  }

  async function confirmar() {
    if (seleccion.length === 0 || confirmando) return;
    setConfirmando(true);
    try {
      await onConfirmar(seleccion);
    } finally {
      setConfirmando(false);
    }
  }

  return (
    <div className="premios-view">
      <button type="button" className="stand-detalle-regresar" onClick={onRegresar}>
        <span className="stand-detalle-regresar-flecha">←</span> Regresar
      </button>

      <h2 className="premios-titulo">Mis premios</h2>

      {!completo && (
        <div className="premios-bloqueado">
          <p className="premios-bloqueado-texto">
            Completa los {total} stands de la Ruta Winner para desbloquear la elección de tus premios.
          </p>
          <p className="premios-bloqueado-progreso">{standsCompletados.length} de {total} completados</p>
        </div>
      )}

      {completo && !premios.confirmado && (
        <>
          <p className="premios-sub">
            Elige cuáles de tus {total} premios quieres reclamar. Puedes elegir todos, algunos, o solo uno —
            tú decides. <strong>Ojo:</strong> una vez que confirmes, tu elección queda definitiva y no se puede cambiar.
          </p>
          <div className="premios-lista">
            {STANDS.map(stand => {
              const elegido = seleccion.includes(stand.id);
              return (
                <button
                  type="button"
                  key={stand.id}
                  className={`premio-card ${elegido ? 'elegido' : ''}`}
                  onClick={() => alternarPremio(stand.id)}
                >
                  <span className="premio-card-check">{elegido ? '✓' : ''}</span>
                  <span className="premio-card-textos">
                    <span className="premio-card-nombre">{stand.premio.nombre}</span>
                    <span className="premio-card-desc">{stand.premio.descripcion}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="actividad-btn premios-confirmar-btn"
            onClick={confirmar}
            disabled={seleccion.length === 0 || confirmando}
          >
            {confirmando ? 'Confirmando...' : `Confirmar selección (${seleccion.length})`}
          </button>
        </>
      )}

      {completo && premios.confirmado && (
        <>
          <p className="premios-sub">Esta es tu selección definitiva de premios.</p>
          <div className="premios-lista">
            {STANDS.filter(stand => premios.seleccionados.includes(stand.id)).map(stand => {
              const entregado = premios.entregados?.includes(stand.id);
              return (
                <div key={stand.id} className={`premio-card confirmado ${entregado ? 'entregado' : ''}`}>
                  <span className="premio-card-check">✓</span>
                  <span className="premio-card-textos">
                    <span className="premio-card-nombre">{stand.premio.nombre}</span>
                    <span className="premio-card-desc">{stand.premio.descripcion}</span>
                  </span>
                  <span className="premio-card-estado">{entregado ? 'Entregado' : 'Pendiente de entrega'}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function PerfilView({ persona, standsCompletados, premios, onAbrirPremios }) {
  const total = STANDS.length;
  const completo = standsCompletados.length === total;

  return (
    <div className="perfil-view">
      <div className="app-header">
        <h1 className="app-greeting">Hola <strong>{persona.nombre.split(' ')[0].toUpperCase()}</strong></h1>
        <p className="app-greeting-sub">Más funciones de tu perfil, próximamente.</p>
      </div>

      <button type="button" className="perfil-premios-card" onClick={onAbrirPremios}>
        <div className="perfil-premios-card-texto">
          <span className="perfil-premios-card-titulo">Mis premios — Ruta Winner</span>
          <span className="perfil-premios-card-sub">
            {premios.confirmado
              ? 'Ya confirmaste tu selección'
              : completo
                ? '¡Ya puedes elegir tus premios!'
                : `${standsCompletados.length} de ${total} stands completados`}
          </span>
        </div>
        <span className="perfil-premios-card-flecha">→</span>
      </button>
    </div>
  );
}

function SeccionNoDisponible() {
  return (
    <div className="snd">
      <img className="snd-logo" src={LOGO_APP} alt="Logo" />
      <h2 className="snd-title">        
        <span className="snd-title-l1">ESTA SECCIÓN</span>
        <span className="snd-title-l2">SE ACTIVARÁ CUANDO</span>
        <span className="snd-title-l3">INICIE EXPO WINNERS</span> 
      </h2>
      <div className="snd-icon">
        <img src="/media/Codi.png" alt=""/>;
      </div>      
      <p className="snd-text">
        ¡Te esperamos para vivir<br /><strong>la experiencia completa!</strong>
      </p>
    </div>
  );
}

function EventCard({ dia, ticket, modo, onElegir, onAbrir }) {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const partesFecha = dia.fecha.split(' '); // ["25", "JUL"]
  const yaElegida = modo === 'proximo' && !!ticket;

  async function handleElegir() {
    setCargando(true);
    setError('');
    try {
      await onElegir();
    } catch (err) {
      console.error(err);
      setError('Ocurrió un error al generar tu entrada. Intenta de nuevo.');
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className={`event-card ${yaElegida ? 'ya-elegida' : ''}`}>
      <div className="event-card-row-top">
        <div className="event-card-media-wrap">
          <img
            className="event-card-media"
            src={dia.imagen}
            alt={`${EVENTO.nombre} — ${dia.etiqueta}`}
            onError={e => { e.target.style.background = 'var(--bg)'; e.target.removeAttribute('src'); }}
          />
          <div className="event-card-tag">{dia.etiqueta}</div>
        </div>
        <div className="event-card-datebox">
          <div className="day">{partesFecha[0]}</div>
          <div className="month">{partesFecha[1]}</div>
          <div className="year">{EVENTO.anio}</div>
        </div>
      </div>

      <div className="event-card-row-bottom">
        <div className="event-card-namevenue">
          <div className="event-card-title">{EVENTO.nombre}</div>
          <div className="event-card-venue">{EVENTO.lugar}, {EVENTO.ciudad}</div>
        </div>

        <div className="event-card-action">
          {modo === 'proximo' && !ticket && (
            <button type="button" className="event-card-cta" disabled={cargando} onClick={handleElegir}>
              {cargando ? 'Generando...' : 'Adquirir Entrada'}
            </button>
          )}
          {modo === 'proximo' && ticket && (
            <div className="event-card-status">{ticket.checkedIn ? 'Ingreso registrado' : 'Adquirida'}</div>
          )}
          {modo === 'entrada' && (
            <div
              className={`event-card-status ${ticket.checkedIn ? 'used' : 'valid clickable'}`}
              onClick={ticket.checkedIn ? undefined : onAbrir}
            >
              {ticket.checkedIn ? 'Ingreso registrado' : 'Ver mi QR'}
            </div>
          )}
        </div>
      </div>

      {error && <div className="event-card-cta-error">{error}</div>}
    </div>
  );
}

function TicketCompleto({ dia, ticket, nombre }) {
  const partesFecha = dia.fecha.split(' ');
  return (
    <div className="ticket">
      <div className="t-top">
        <div className="t-brand">
          <div className="name">{EVENTO.nombre}</div>
          <div className={`status-chip ${ticket.checkedIn ? 'used' : 'valid'}`}>
            {ticket.checkedIn ? 'INGRESO REGISTRADO' : 'VÁLIDA'}
          </div>
        </div>
        <div className="t-datebox">
          <div>
            <div className="date-num">{partesFecha[0]}</div>
            <div className="date-sub">{partesFecha.slice(1).join(' ')}</div>
          </div>
          <div className="divider" />
          <div>
            <div className="venue">{dia.etiqueta}</div>
            <div className="venue-sub">{EVENTO.lugar} · {EVENTO.ciudad}</div>
          </div>
          <div className="divider" />
          <div className="attendee-name">{nombre}</div>
        </div>
      </div>
      <div className="perforation"><div className="notch left" /><div className="notch right" /></div>
      <div className="t-bottom">        
        <div className="qr-holder">
          <QRCodeSVG value={ticket.ticketCode} size={168} fgColor="#10131C" bgColor="#ffffff" level="M" />
        </div>
        <div className="ticket-code">{ticket.ticketCode}</div>
        <div className="InfoTicket">
          <p><strong>¡Importante!</strong> Presenta este código QR para entrar al evento. Recuerda que tu código es personal e intransferible.</p>
        </div>
      </div>
    </div>
  );
}
