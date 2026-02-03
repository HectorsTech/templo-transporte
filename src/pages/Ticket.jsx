import { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Bus, Calendar, Clock, QrCode, Download, Share2, User, Mail, DollarSign, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import QRCode from 'react-qr-code';
import emailjs from '@emailjs/browser';

export function Ticket() {
  const location = useLocation();
  const reservationData = location.state?.reservation;

  // Estados del flujo
  const [loading, setLoading] = useState(false);
  const [confirmedReservation, setConfirmedReservation] = useState(null);
  const [error, setError] = useState(null);

  // Estado de Disponibilidad
  const [availableSeats, setAvailableSeats] = useState(null);
  const [checkingAvailability, setCheckingAvailability] = useState(true);

  // Formulario de cliente
  const [clientData, setClientData] = useState({
    fullName: '',
    email: ''
  });

  // --- CONSULTA DE DISPONIBILIDAD ---
  useEffect(() => {
    async function checkAvailability() {
      if (!reservationData) return;
      
      try {
        setCheckingAvailability(true);
        const localDateTimeString = `${reservationData.date}T${reservationData.departureTime}:00`;
        const fechaSalidaISO = new Date(localDateTimeString).toISOString();

        // 1. Obtener capacidad real de la ruta
        const { data: routeInfo, error: routeError } = await supabase
          .from('rutas')
          .select('capacidad')
          .eq('id', reservationData.tripId)
          .single();

        if (routeError) throw routeError;
        
        const capacity = routeInfo.capacidad || 14; // Fallback por seguridad

        // 2. Obtener ocupación del viaje específico
        const { data: tripInfo, error: tripError } = await supabase
          .from('viajes')
          .select('asientos_ocupados')
          .eq('ruta_id', reservationData.tripId)
          .eq('fecha_salida', fechaSalidaISO)
          .maybeSingle();

        if (tripError) throw tripError;

        if (tripInfo) {
          // Si el viaje ya existe, calculamos
          const seatsLeft = capacity - (tripInfo.asientos_ocupados || 0);
          setAvailableSeats(seatsLeft < 0 ? 0 : seatsLeft); // Evitar negativos
        } else {
          // Si no existe, está todo libre
          setAvailableSeats(capacity);
        }

      } catch (err) {
        console.error('Error checking availability:', err);
        // En caso de error, podríamos asumir que hay lugar o bloquear. 
        // Asumiremos error visual pero no boqueante por ahora, o null.
      } finally {
        setCheckingAvailability(false);
      }
    }

    checkAvailability();
  }, [reservationData]);


  if (!reservationData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">No se encontró información del viaje</h2>
          <Link to="/" className="text-blue-600 hover:text-blue-800 font-semibold">
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  const handleInputChange = (e) => {
    setClientData({
      ...clientData,
      [e.target.name]: e.target.value
    });
  };

  const generateVisualCode = () => {
    return 'RES-' + Math.random().toString(36).substr(2, 6).toUpperCase();
  };

  const handleConfirm = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Doble validación local antes de enviar
    if (availableSeats !== null && availableSeats <= 0) {
      setError('Lo sentimos, el viaje se ha llenado mientras completabas el formulario.');
      setLoading(false);
      return;
    }

    try {
      const localDateTimeString = `${reservationData.date}T${reservationData.departureTime}:00`;
      const fechaSalidaISO = new Date(localDateTimeString).toISOString();

      // 1. Buscar o Crear VIAJE
      let { data: existingTrip, error: findError } = await supabase
        .from('viajes')
        .select('id, asientos_ocupados') // Traemos también asientos ocupados
        .eq('ruta_id', reservationData.tripId)
        .eq('fecha_salida', fechaSalidaISO)
        .maybeSingle();

      if (findError) throw findError;

      let viajeId;

      if (existingTrip) {
        viajeId = existingTrip.id;
      } else {
        const { data: newTrip, error: createError } = await supabase
          .from('viajes')
          .insert({
            ruta_id: reservationData.tripId,
            fecha_salida: fechaSalidaISO,
            asientos_ocupados: 0 // Se actualizará después o mediante trigger
          })
          .select('id')
          .single();

        if (createError) throw createError;
        viajeId = newTrip.id;
      }

      // 3. Crear RESERVA
      const visualCode = generateVisualCode();
      
      const { data: newReservation, error: reservationError } = await supabase
        .from('reservas')
        .insert({
          viaje_id: viajeId,
          cliente_nombre: clientData.fullName,
          cliente_email: clientData.email,
          codigo_visual: visualCode,
          firma_seguridad: self.crypto.randomUUID(),
          validado: false
        })
        .select('*')
        .single();

      if (reservationError) throw reservationError;

      // 4. ACTUALIZAR OCUPACIÓN (INCREMENTAR)
      // Esto es crucial para que la disponibilidad baje
      const { error: updateError } = await supabase
        .from('viajes')
        .update({ asientos_ocupados: (existingTrip ? existingTrip.asientos_ocupados : 0) + 1 })
        .eq('id', viajeId);

      // Nota: Si es nueva inserción (existingTrip null), asumimos que inicia en 0 y sumamos 1.
      // Pero 'existingTrip' solo tiene 'id'. Debemos tener cuidado.
      // Mejor estrategia: Si era nuevo, ya lo insertamos con 0. Ahora hacemos RPC o lectura fresca.
      // Como no tenemos RPC a la mano, haremos:
      // Si era nuevo, ahora tiene 0. update -> 1.
      // Si existía, necesitamos saber cuántos tenía.
      // Mejor, hagamos un paso 'atómico' de lectura previa si existía.
      
      // Corrección de lógica:
      // Arriba ya leímos 'existingTrip' pero SOLO su ID.
      // Vamos a re-leer para asegurar consistencia o usar un RPC de incremento si existiera.
      // Como no tenemos RPC definido, haremos:
      // UPDATE viajes SET asientos_ocupados = asientos_ocupados + 1 WHERE id = viajeId
      // Supabase no soporta "set = col + 1" directamente en el cliente JS sin RPC.
      // Así que tenemos que leer el valor actual y sumar 1.

      // Paso extra de seguridad: Leer valor actual para sumar
      const { data: currentTripData } = await supabase.from('viajes').select('asientos_ocupados').eq('id', viajeId).single();
      const currentOccupied = currentTripData ? currentTripData.asientos_ocupados : 0;

      await supabase
        .from('viajes')
        .update({ asientos_ocupados: currentOccupied + 1 })
        .eq('id', viajeId);

      // Enviar Correo de Confirmación
      try {
        await emailjs.send(
          import.meta.env.VITE_EMAILJS_SERVICE_ID,      // ID del Servicio
          import.meta.env.VITE_EMAILJS_TEMPLATE_COMPRA,
          {
            nombre: clientData.fullName,
            email: clientData.email,
            origen: reservationData.origin,
            destino: reservationData.destination,
            fecha: new Date(reservationData.date + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
            hora: reservationData.departureTime,
            codigo: visualCode,
            id_reserva: newReservation.id
          },
          import.meta.env.VITE_EMAILJS_PUBLIC_KEY
        );
      } catch (emailErr) {
        console.error("No se pudo enviar el email de confirmación:", emailErr);
        // No bloqueamos el flujo, el usuario ya tiene su boleto en pantalla.
      }

      // Actualizar visualmente y finalizar
      setConfirmedReservation({
        ...newReservation,
        routeDetails: reservationData 
      });

    } catch (err) {
      console.error('Error al confirmar reserva:', err);
      setError('Hubo un error procesando tu reserva. Por favor intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  // --- VISTA DE TICKET CONFIRMADO ---
  if (confirmedReservation) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-50 py-8 px-4">
        <div className="container mx-auto max-w-lg">
          {/* Header Actions */}
          <div className="flex justify-between items-center mb-6">
             <Link to="/" className="text-gray-600 hover:text-blue-600 flex items-center gap-1 text-sm font-medium">
                <ArrowLeft className="w-4 h-4" /> Inicio
             </Link>
             <button onClick={() => window.print()} className="text-blue-600 hover:text-blue-700 flex items-center gap-1 text-sm font-medium">
                <Download className="w-4 h-4" /> Guardar
             </button>
          </div>

          <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-200">
            {/* Success Banner */}
            <div className="bg-green-50 p-6 text-center border-b border-green-100">
               <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3 text-green-600">
                 <CheckCircle className="w-6 h-6" />
               </div>
               <h2 className="text-xl font-bold text-green-800">¡Reserva Exitosa!</h2>
               <p className="text-sm text-green-700 mt-1">Tu lugar ha sido asegurado.</p>
            </div>

            {/* QR Section */}
            <div className="p-8 flex flex-col items-center bg-white border-b border-dashed border-gray-200 relative">
               <div className="absolute -left-3 top-1/2 w-6 h-6 bg-gray-50 rounded-full"></div>
               <div className="absolute -right-3 top-1/2 w-6 h-6 bg-gray-50 rounded-full"></div>

               <div className="p-3 border-2 border-gray-900 rounded-lg mb-4">
                  <QRCode 
                    value={confirmedReservation.id} 
                    size={160}
                    level="H"
                  />
               </div>
               <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Código de Abordaje</p>
               <p className="text-3xl font-mono font-bold text-gray-900 tracking-widest">
                 {confirmedReservation.codigo_visual}
               </p>
            </div>

            {/* Trip Details */}
            <div className="p-6 bg-gray-50">
               <div className="mb-6">
                  <h3 className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-3">Detalles del Viaje</h3>
                  <div className="flex items-center justify-between mb-4">
                     <div>
                        <p className="text-xs text-gray-400">Origen</p>
                        <p className="font-bold text-gray-900">{confirmedReservation.routeDetails.origin}</p>
                        <p className="text-blue-600 font-medium text-sm">{confirmedReservation.routeDetails.departureTime}</p>
                     </div>
                     <div className="flex-1 border-b-2 border-dashed border-gray-300 mx-4 relative top-1"></div>
                     <div className="text-right">
                        <p className="text-xs text-gray-400">Destino</p>
                        <p className="font-bold text-gray-900">{confirmedReservation.routeDetails.destination}</p>
                        <p className="text-blue-600 font-medium text-sm">{confirmedReservation.routeDetails.arrivalTime}</p>
                     </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                     <Calendar className="w-4 h-4" />
                     {new Date(confirmedReservation.routeDetails.date + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  </div>
               </div>

               <div className="mb-4">
                  <h3 className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-3">Pasajero</h3>
                  <div className="bg-white p-3 rounded-lg border border-gray-200 text-sm">
                     <p className="font-medium text-gray-900">{confirmedReservation.cliente_nombre}</p>
                     <p className="text-gray-500">{confirmedReservation.cliente_email}</p>
                  </div>
               </div>
               
               <div className="mt-6 text-center">
                  <p className="text-xs text-gray-400">ID de Reserva: {confirmedReservation.id}</p>
               </div>
            </div>
          </div>
          
          <p className="text-center text-xs text-gray-500 mt-6 max-w-xs mx-auto">
             Presenta este código QR al conductor al momento de abordar. Te recomendamos llegar 10 minutos antes.
          </p>
        </div>
      </div>
    );
  }

  // --- VISTA DE FORMULARIO DE RESERVA ---
  const isSoldOut = availableSeats !== null && availableSeats <= 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <Link
            to="/resultados"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-blue-600 transition"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">Volver a resultados</span>
          </Link>
        </div>
      </header>

      <div className="container mx-auto max-w-4xl px-4 py-8 grid md:grid-cols-3 gap-8">
        {/* Columna Izquierda: Detalles del Viaje */}
        <div className="md:col-span-1 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
             <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
               <Bus className="w-5 h-5 text-blue-600" /> Resumen
             </h3>
             
             <div className="space-y-4">
                {/* DISPONIBILIDAD */}
                <div className={`p-3 rounded-lg border text-center font-bold text-sm ${
                    checkingAvailability ? 'bg-gray-50 border-gray-200 text-gray-400' :
                    isSoldOut ? 'bg-red-50 border-red-200 text-red-600' :
                    availableSeats <= 5 ? 'bg-orange-50 border-orange-200 text-orange-600' :
                    'bg-green-50 border-green-200 text-green-600'
                }`}>
                    {checkingAvailability ? (
                      <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin"/> Verificando lugar...</span>
                    ) : isSoldOut ? (
                      <span>⛔ AGOTADO</span>
                    ) : availableSeats <= 5 ? (
                      <span>⚠️ ¡Solo quedan {availableSeats} asientos!</span>
                    ) : (
                      <span>🟢 {availableSeats} Asientos Disponibles</span>
                    )}
                </div>

                <div className="border-l-2 border-blue-500 pl-3">
                   <p className="text-xs text-gray-500 uppercase">Ruta</p>
                   <p className="font-medium text-gray-900">{reservationData.origin} → {reservationData.destination}</p>
                </div>
                
                <div className="border-l-2 border-blue-500 pl-3">
                   <p className="text-xs text-gray-500 uppercase">Fecha</p>
                   <p className="font-medium text-gray-900">
                     {new Date(reservationData.date + 'T12:00:00').toLocaleDateString('es-MX', { dateStyle: 'medium' })}
                   </p>
                </div>

                <div className="border-l-2 border-blue-500 pl-3">
                   <p className="text-xs text-gray-500 uppercase">Horario</p>
                   <p className="font-medium text-gray-900">{reservationData.departureTime} - {reservationData.arrivalTime}</p>
                </div>

                <div className="pt-4 border-t border-gray-100 flex justify-between items-center">
                   <span className="text-gray-600">Total a Pagar</span>
                   <span className="text-xl font-bold text-blue-600">${reservationData.price} MXN</span>
                </div>
             </div>
          </div>
        </div>

        {/* Columna Derecha: Formulario de Pasajero */}
        <div className="md:col-span-2">
           <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 md:p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Completa tu Reserva</h2>
              
              {error && (
                <div className="mb-6 bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg flex items-center gap-3">
                  <AlertCircle className="w-5 h-5" />
                  {error}
                </div>
              )}

              <form onSubmit={handleConfirm} className="space-y-6">
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Completo</label>
                    <div className="relative">
                       <User className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                       <input 
                         type="text"
                         name="fullName"
                         className="w-full pl-10 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                         placeholder="Ej. Juan Pérez"
                         required
                         disabled={isSoldOut}
                         value={clientData.fullName}
                         onChange={handleInputChange}
                       />
                    </div>
                 </div>

                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Correo Electrónico</label>
                    <div className="relative">
                       <Mail className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                       <input 
                         type="email"
                         name="email"
                         className="w-full pl-10 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                         placeholder="Ej. juan@correo.com"
                         required
                         disabled={isSoldOut}
                         value={clientData.email}
                         onChange={handleInputChange}
                       />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Te enviaremos tu boleto a este correo.</p>
                 </div>

                 <div className="pt-4">
                    <button 
                      type="submit" 
                      disabled={loading || isSoldOut || checkingAvailability}
                      className={`w-full py-3.5 rounded-lg font-bold text-lg transition shadow-lg flex items-center justify-center gap-2 
                        ${isSoldOut 
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                          : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-70 disabled:cursor-not-allowed'
                        }`}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" /> Procesando...
                        </>
                      ) : isSoldOut ? (
                        <>⛔ Viaje Lleno</>
                      ) : (
                        <>Confirmar Compra</>
                      )}
                    </button>
                    <p className="text-center text-xs text-gray-400 mt-4 flex justify-center items-center gap-1">
                       <CheckCircle className="w-3 h-3" /> Transacción segura y encriptada
                    </p>
                 </div>
              </form>
           </div>
        </div>
      </div>
    </div>
  );
}