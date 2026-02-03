import { useEffect, useState } from 'react';
import { ArrowLeft, Clock, MapPin, Users, DollarSign, AlertCircle, Loader2 } from 'lucide-react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export function Results() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const origin = searchParams.get('origin') || '';
  const destination = searchParams.get('destination') || '';
  const date = searchParams.get('date') || '';

  const [trips, setTrips] = useState([]);
  const [allRouteMatches, setAllRouteMatches] = useState(false); // Para control del mensaje específico
  const [searchDayLabel, setSearchDayLabel] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Helper para obtener el día de la semana en formato corto (Lun, Mar...)
  const getDayLabel = (dateString) => {
    if (!dateString) return '';
    // Agregamos la hora para asegurar que se interprete en la fecha correcta localmente
    const d = new Date(`${dateString}T12:00:00`);
    const days = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
    return days[d.getDay()];
  };

  useEffect(() => {
    async function fetchRoutes() {
      try {
        setLoading(true);
        setError(null);
        setAllRouteMatches(false);

        // 1. Consulta base: Filtramos por ruta activa y patrón de origen/destino
        let query = supabase.from('rutas')
          .select('*')
          .eq('activa', true);

        if (origin) {
          query = query.ilike('origen', `%${origin}%`);
        }
        
        if (destination) {
          query = query.ilike('destino', `%${destination}%`);
        }

        const { data, error: supabaseError } = await query;

        if (supabaseError) throw supabaseError;

        // 2. Filtrado en Cliente por Días Operativos
        const currentDayLabel = getDayLabel(date);
        setSearchDayLabel(currentDayLabel);

        if (data && data.length > 0) {
          setAllRouteMatches(true); // Encontramos rutas de origen/destino, aunque no sepamos si hay fecha
          
          const filteredTrips = data.filter(route => {
            // Si el array es nulo o vacío, asumimos que opera diario (o podrías asumir lo contrario)
            // Aquí asumimos estricto: debe incluir el día.
            if (!route.dias_operativos || !Array.isArray(route.dias_operativos)) return false;
            return route.dias_operativos.includes(currentDayLabel);
          });

          // 3. Filtrar por Disponibilidad Real (Excluir Agotados)
          if (filteredTrips.length > 0) {
              // Rango del día seleccionado para buscar viajes ya creados
              const startOfDay = new Date(`${date}T00:00:00`).toISOString();
              // Usamos una fecha muy futura o fin del día para asegurar cobertura, 
              // pero para ser precisos con la zona horaria local, mejor buscamos por coincidencia de fecha aproximada o traemos todo lo del día.
              // Dado que guardamos timestamps exactos basados en la fecha + hora_salida de la ruta:
              
              // Vamos a consultar los viajes que coincidan con los IDs de las rutas candidatas
              const routeIds = filteredTrips.map(r => r.id);
              
              const { data: existingTrips, error: tripsError } = await supabase
                .from('viajes')
                .select('ruta_id, asientos_ocupados, fecha_salida')
                .in('ruta_id', routeIds)
                .gte('fecha_salida', startOfDay)
                .lt('fecha_salida', new Date(`${date}T23:59:59`).toISOString()); 

              if (tripsError) throw tripsError;

              // Filtro final: Si existe viaje y está lleno, lo quitamos.
              const availableTrips = filteredTrips.filter(route => {
                  // Reconstruimos la fecha esperada para esa ruta específica para asegurar match
                  // Nota: Esto asume que la hora_salida no cambia dinámicamente.
                  const expectedIso = new Date(`${date}T${route.hora_salida}:00`).toISOString();
                  
                  // Buscamos si hay un viaje registrado para esta ruta en este horario específico
                  // (O relajamos la búsqueda solo por ruta_id si sabemos que hay 1 solo viaje x ruta x día)
                  const tripInstance = existingTrips?.find(t => t.ruta_id === route.id);

                  if (tripInstance) {
                      const seatsLeft = route.capacidad - tripInstance.asientos_ocupados;
                      return seatsLeft > 0; // Solo mostramos si hay al menos 1 asiento
                  }
                  
                  // Si no existe el viaje, significa que nadie ha comprado, está 100% libre.
                  return true;
              });

              setTrips(availableTrips);
          } else {
             setTrips([]);
          }
        } else {
          setTrips([]);
        }

      } catch (err) {
        console.error('Error fetching routes:', err);
        setError('No pudimos cargar los viajes. Por favor intenta de nuevo.');
      } finally {
        setLoading(false);
      }
    }

    fetchRoutes();
  }, [origin, destination, date]);

  const handleReserve = (trip) => {
    const reservation = {
      id: `RES-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
      tripId: trip.id,
      nombre: trip.nombre,
      origin: trip.origen,
      destination: trip.destino,
      departureTime: trip.hora_salida, 
      arrivalTime: trip.hora_llegada,
      date: date,
      price: trip.precio_base,
      stops: trip.paradas || [],
    };
    navigate('/boleto', { state: { reservation } });
  };

  /* Funciones auxiliares para visualización */

  // Muestra precios
  const getDisplayPrice = (trip) => {
    if (trip.precio_base > 0) return trip.precio_base;
    // Si no tiene precio base, intentamos sacar el precio de la última parada
    if (trip.paradas && trip.paradas.length > 0) {
      return trip.paradas[trip.paradas.length - 1].precio;
    }
    return 0;
  };

  // Renderizado
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
         <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
         <p className="text-gray-600 font-medium">Buscando las mejores rutas para el {searchDayLabel}...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-gray-900 mb-2">Hubo un error</h3>
          <p className="text-gray-600 mb-6">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  // Lógica de Empty State Específico
  const showSpecificDayEmptyState = trips.length === 0 && allRouteMatches;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-blue-600 transition"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">Volver a buscar</span>
          </Link>
        </div>
      </header>

      {/* Search Info */}
      <section className="bg-white border-b border-gray-200 py-6 px-4">
        <div className="container mx-auto max-w-4xl">
          <h2 className="text-2xl font-bold text-gray-900 mb-3">
            Resultados de búsqueda
          </h2>
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-blue-600" />
              <span>
                Origen: <strong className="text-gray-900">{origin || 'Cualquiera'}</strong> → 
                Destino: <strong className="text-gray-900">{destination || 'Cualquiera'}</strong>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" />
              {date && (
                <span>{new Date(date + 'T12:00:00').toLocaleDateString('es-MX', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}</span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Trips List */}
      <section className="py-6 px-4">
        <div className="container mx-auto max-w-4xl space-y-4">
          {trips.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl shadow-sm border border-gray-100">
              <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              {showSpecificDayEmptyState ? (
                <>
                  <h3 className="text-lg font-medium text-gray-900">Sin salidas para este día</h3>
                  <p className="text-gray-500 max-w-md mx-auto mt-2">
                    Encontramos rutas para tu destino, pero no operan los <strong>{searchDayLabel}</strong>. 
                    Por favor intenta seleccionar otra fecha.
                  </p>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-medium text-gray-900">No se encontraron viajes</h3>
                  <p className="text-gray-500 mt-2">
                    No tenemos rutas activas que coincidan con tu búsqueda.
                  </p>
                </>
              )}
              <Link to="/" className="inline-block mt-6 px-6 py-2 bg-blue-50 text-blue-600 rounded-lg font-medium hover:bg-blue-100 transition">
                Cambiar Búsqueda
              </Link>
            </div>
          ) : (
            trips.map((trip) => (
              <div
                key={trip.id}
                className="bg-white rounded-xl shadow-sm hover:shadow-md transition border border-gray-100 overflow-hidden"
              >
                <div className="p-6">
                  {/* Trip Header */}
                  <div className="flex flex-col md:flex-row md:items-start justify-between mb-6 gap-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-gray-900 mb-1">{trip.nombre}</h3>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-medium">
                          Ruta Directa
                        </span>
                        <span className="text-xs text-gray-400">
                          {Array.isArray(trip.dias_operativos) ? trip.dias_operativos.join(', ') : ''}
                        </span>
                      </div>
                    </div>

                    {/* Times Display */}
                    <div className="flex items-center gap-4 text-center">
                        <div>
                             <p className="text-sm text-gray-400">Salida</p>
                             <p className="text-xl font-bold text-gray-900">{trip.hora_salida}</p>
                        </div>
                        <div className="hidden md:block">
                            <div className="h-0.5 w-12 bg-gray-300 relative mx-2">
                                {/* Flechita */}
                                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0 h-0 border-t-4 border-t-transparent border-b-4 border-b-transparent border-l-4 border-l-gray-300"></div>
                            </div>
                        </div>
                         <div>
                             <p className="text-sm text-gray-400">Llegada</p>
                             <p className="text-xl font-bold text-gray-900">{trip.hora_llegada}</p>
                        </div>
                    </div>

                    <div className="text-right">
                      <div className="text-2xl font-bold text-blue-600">
                        ${getDisplayPrice(trip)}
                      </div>
                      <div className="text-xs text-gray-500">MXN</div>
                    </div>
                  </div>

                  {/* Timeline of Stops */}
                  {trip.paradas && trip.paradas.length > 0 && (
                    <div className="mb-6 bg-gray-50 p-4 rounded-lg">
                      <h4 className="text-sm font-semibold text-gray-700 mb-3">
                        Itinerario
                      </h4>
                      <div className="relative">
                        {trip.paradas.map((stop, index) => (
                          <div key={index} className="flex gap-4 relative group">
                            {/* Timeline Line */}
                            <div className="flex flex-col items-center">
                              <div
                                className={`w-3 h-3 rounded-full border-2 z-10 ${
                                  index === 0 || index === trip.paradas.length - 1
                                    ? 'bg-blue-600 border-blue-600'
                                    : 'bg-white border-blue-400'
                                }`}
                              ></div>
                              {index < trip.paradas.length - 1 && (
                                <div className="w-0.5 h-full bg-blue-200 absolute top-3 bottom-[-12px]"></div>
                              )}
                            </div>

                            {/* Stop Info */}
                            <div className={`pb-6 ${index === trip.paradas.length - 1 ? 'pb-0' : ''} flex-1`}>
                              <div className="flex items-center justify-between">
                                <div>
                                    <span className="font-medium text-gray-900 block">
                                    {stop.name}
                                    </span>
                                    <span className="text-xs text-gray-500">
                                      {/* Usamos el campo visual 'time' si existe, o calculamos el offset */}
                                      {stop.time ? stop.time : `+ ${stop.timeOffset}`}
                                    </span>
                                </div>
                                {stop.precio > 0 && (
                                    <span className="text-sm text-gray-600 bg-gray-200 px-2 py-1 rounded">
                                        ${stop.precio}
                                    </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Footer */}
                  <div className="flex flex-col sm:flex-row items-center justify-between pt-4 border-t border-gray-100 gap-4">
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-600">
                         Capacidad: <span className="font-medium text-gray-900">{trip.capacidad}</span>
                      </span>
                    </div>
                    <button
                      onClick={() => handleReserve(trip)}
                      className="w-full sm:w-auto bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition flex items-center justify-center gap-2 shadow-sm"
                    >
                      <DollarSign className="w-4 h-4" />
                      Reservar Lugar
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}