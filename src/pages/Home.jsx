import { useState, useEffect } from 'react';
import { Bus, MapPin, Loader2, Clock, ArrowRight, Users, ChevronRight } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const DAYS_OF_WEEK_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DAYS_OF_WEEK_FULL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function Home() {
  const navigate = useNavigate();

  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [selectedDate, setSelectedDate] = useState(null);
  
  // Estados para datos dinámicos
  const [availableOrigins, setAvailableOrigins] = useState([]);
  const [availableDestinations, setAvailableDestinations] = useState([]);
  const [popularRoutes, setPopularRoutes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Estados para días disponibles
  const [availableDays, setAvailableDays] = useState([]);
  const [loadingDays, setLoadingDays] = useState(false);

  // Estado para el modal
  const [selectedRoute, setSelectedRoute] = useState(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('rutas')
          .select('*')
          .eq('activa', true);

        if (error) throw error;

        if (data) {
          const origins = [...new Set(data.map(r => r.origen))].sort();
          const destinations = [...new Set(data.map(r => r.destino))].sort();
          
          setAvailableOrigins(origins);
          setAvailableDestinations(destinations);
          setPopularRoutes(data.slice(0, 3));
        }
      } catch (error) {
        console.error('Error al cargar datos:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  // Cargar días disponibles cuando se seleccionen origen y destino
  useEffect(() => {
    async function fetchAvailableDays() {
      if (!origin || !destination) {
        setAvailableDays([]);
        return;
      }

      try {
        setLoadingDays(true);
        setSelectedDate(null); // Reset selection

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // 1. Buscar rutas que coincidan
        const { data: routes, error: routeError } = await supabase
          .from('rutas')
          .select('*')
          .eq('activa', true)
          .ilike('origen', `%${origin}%`)
          .ilike('destino', `%${destination}%`);

        if (routeError) throw routeError;
        if (!routes || routes.length === 0) {
          setAvailableDays([]);
          return;
        }

        // 2. Generar próximos días basados en días operativos
        const daysToShow = [];
        const daysToGenerate = 30; // Mostrar próximos 30 días

        for (let i = 0; i < daysToGenerate; i++) {
          const currentDate = new Date();
          currentDate.setDate(today.getDate() + i);
          const dayOfWeek = DAYS_OF_WEEK_SHORT[currentDate.getDay()];

          // Buscar rutas que operen ese día
          const routesForDay = routes.filter(route => 
            route.dias_operativos && route.dias_operativos.includes(dayOfWeek)
          );

          if (routesForDay.length > 0) {
            // Para cada ruta, calcular disponibilidad
            for (const route of routesForDay) {
              const dateStr = currentDate.toISOString().split('T')[0];
              const localDateTimeString = `${dateStr}T${route.hora_salida}:00`;
              const fechaSalidaISO = new Date(localDateTimeString).toISOString();

              // Consultar viaje específico
              const { data: tripData } = await supabase
                .from('viajes')
                .select('asientos_ocupados')
                .eq('ruta_id', route.id)
                .eq('fecha_salida', fechaSalidaISO)
                .maybeSingle();

              const ocupados = tripData ? tripData.asientos_ocupados : 0;
              const disponibles = route.capacidad - ocupados;

              if (disponibles > 0) {
                daysToShow.push({
                  routeId: route.id,
                  fecha: dateStr,
                  dia_semana: DAYS_OF_WEEK_FULL[currentDate.getDay()],
                  dia_numero: currentDate.getDate(),
                  mes: MONTHS[currentDate.getMonth()],
                  hora_salida: route.hora_salida,
                  asientos_disponibles: disponibles,
                  asientos_totales: route.capacidad,
                  precio: route.precio_base,
                  nombre_ruta: route.nombre
                });
              }
            }
          }
        }

        // Ordenar por fecha
        daysToShow.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
        setAvailableDays(daysToShow.slice(0, 10)); // Mostrar solo los primeros 10

      } catch (error) {
        console.error('Error al cargar días disponibles:', error);
      } finally {
        setLoadingDays(false);
      }
    }

    fetchAvailableDays();
  }, [origin, destination]);

  const handleSelectDay = (day) => {
    setSelectedDate(day);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (origin && destination && selectedDate) {
      navigate(`/resultados?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&date=${encodeURIComponent(selectedDate.fecha)}`);
    }
  };

  const handleSelectRoute = () => {
    if (selectedRoute) {
      setOrigin(selectedRoute.origen);
      setDestination(selectedRoute.destino);
      setSelectedRoute(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const canShowDays = origin && destination && !loadingDays;
  const canSubmit = origin && destination && selectedDate;

  return (
    <div className="min-h-screen relative bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bus className="w-8 h-8 text-blue-600" />
            <h1 className="font-bold text-xl">Boletera Templo</h1>
          </div>
          <Link
            to="/admin"
            className="text-sm text-gray-600 hover:text-blue-600 transition"
          >
            Admin
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-blue-600 via-blue-700 to-blue-900 text-white py-16 px-4">
        <div className="container mx-auto max-w-4xl text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Viaja seguro, llega rápido
          </h2>
          <p className="text-lg md:text-xl text-blue-100 mb-8">
            Reserva tu lugar en minutos. Sin filas, sin complicaciones.
          </p>
        </div>

        {/* Search Widget */}
        <div className="container mx-auto max-w-2xl">
          <form onSubmit={handleSearch} className="bg-white rounded-xl shadow-2xl p-6 md:p-8">
            <div className="space-y-4">
              {/* Origin */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Origen
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <select
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent text-gray-900"
                    required
                    disabled={loading}
                  >
                    <option value="">Selecciona tu origen</option>
                    {availableOrigins.map((org) => (
                      <option key={org} value={org}>{org}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Destination */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Destino
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <select
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent text-gray-900"
                    required
                    disabled={loading}
                  >
                    <option value="">Selecciona tu destino</option>
                    {availableDestinations.map((dest) => (
                      <option key={dest} value={dest}>{dest}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Available Days Section */}
              {(origin && destination) && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Selecciona día de viaje
                  </label>
                  
                  {loadingDays ? (
                    <div className="flex justify-center items-center py-12 bg-gray-50 rounded-lg border border-gray-200">
                      <Loader2 className="w-6 h-6 text-blue-600 animate-spin mr-2" />
                      <span className="text-gray-600">Buscando viajes disponibles...</span>
                    </div>
                  ) : availableDays.length === 0 ? (
                    <div className="py-8 bg-yellow-50 rounded-lg border border-yellow-200 text-center">
                      <p className="text-yellow-800 font-medium">No hay viajes disponibles para esta ruta</p>
                      <p className="text-yellow-600 text-sm mt-1">Intenta con otro origen o destino</p>
                    </div>
                  ) : (
                    <div className="max-h-96 overflow-y-auto space-y-2 bg-gray-50 p-3 rounded-lg border border-gray-200">
                      {availableDays.map((day, index) => (
                        <button
                          key={`${day.routeId}-${day.fecha}-${index}`}
                          type="button"
                          onClick={() => handleSelectDay(day)}
                          className={`w-full text-left p-4 rounded-lg border-2 transition-all hover:shadow-md ${
                            selectedDate?.fecha === day.fecha && selectedDate?.routeId === day.routeId
                              ? 'border-blue-600 bg-blue-50 shadow-md'
                              : 'border-gray-200 bg-white hover:border-blue-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-bold text-gray-900 capitalize">{day.dia_semana}</span>
                                <span className="text-sm text-gray-500">•</span>
                                <span className="text-sm text-gray-600">{day.dia_numero} de {day.mes}</span>
                              </div>
                              <div className="flex items-center gap-3 text-sm text-gray-600">
                                <span className="flex items-center gap-1">
                                  <Clock className="w-4 h-4" />
                                  {day.hora_salida}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Users className="w-4 h-4" />
                                  {day.asientos_disponibles} disponibles
                                </span>
                              </div>
                            </div>
                            <ChevronRight className={`w-5 h-5 transition-all ${
                              selectedDate?.fecha === day.fecha ? 'text-blue-600' : 'text-gray-400'
                            }`} />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Search Button */}
              <button
                type="submit"
                className={`w-full py-4 rounded-lg font-semibold transition flex items-center justify-center gap-2 shadow-lg ${
                  canSubmit
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
                disabled={!canSubmit}
              >
                <Search className="w-5 h-5" />
                {canSubmit ? 'Ver Horarios' : 'Selecciona origen, destino y fecha'}
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* Popular Routes */}
      <section className="py-12 px-4">
        <div className="container mx-auto max-w-4xl">
          <h3 className="text-2xl font-bold text-gray-900 mb-6">
            Rutas Disponibles
          </h3>
          {loading ? (
             <div className="flex justify-center p-8">
               <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
             </div>
          ) : popularRoutes.length > 0 ? (
            <div className="grid md:grid-cols-3 gap-4">
              {popularRoutes.map((route) => (
                <div
                  key={route.id}
                  onClick={() => setSelectedRoute(route)}
                  className="bg-white rounded-xl p-5 shadow-sm hover:shadow-md transition cursor-pointer border border-gray-100 group relative overflow-hidden transform hover:-translate-y-1"
                >
                  <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition">
                     <div className="bg-blue-50 text-blue-600 p-1 rounded-full">
                       <ArrowRight className="w-4 h-4" />
                     </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-gray-900 font-medium text-lg">
                      <MapPin className="w-5 h-5 text-blue-600" />
                      {route.origen}
                    </div>
                    <div className="pl-2 border-l-2 border-dashed border-gray-200 ml-2.5 py-1"></div>
                    <div className="flex items-center gap-2 text-gray-900 font-medium text-lg">
                      <div className="w-5 h-5 flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full ring-2 ring-gray-300 bg-white"></div>
                      </div>
                      {route.destino}
                    </div>
                    
                    <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between items-center text-sm">
                      <span className="text-gray-500 flex items-center gap-1">
                        <Clock className="w-4 h-4" /> {route.hora_salida || 'Por definir'}
                      </span>
                      <span className="font-bold text-blue-600">
                        ${route.precio_base}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
             <p className="text-gray-500 text-center">No hay rutas activas disponibles.</p>
          )}
        </div>
      </section>

      {/* MODAL DE DETALLES DE RUTA */}
      {selectedRoute && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
           <div 
             className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
             onClick={() => setSelectedRoute(null)}
           ></div>

           <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full relative z-10 overflow-hidden p-6">
              <button 
                 onClick={() => setSelectedRoute(null)} 
                 className="absolute top-4 right-4 p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition"
              >
                 <MapPin className="w-5 h-5 text-gray-600" />
              </button>
              
              <h3 className="text-2xl font-bold text-gray-900 mb-4">
                {selectedRoute.origen} → {selectedRoute.destino}
              </h3>
              
              <p className="text-gray-600 mb-6">
                Haz clic en "Seleccionar" para elegir esta ruta y ver las fechas disponibles.
              </p>

              <button 
                onClick={handleSelectRoute}
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition"
              >
                Seleccionar Ruta
              </button>
           </div>
        </div>
      )}
    </div>
  );
}