import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Link } from 'react-router-dom';
import emailjs from '@emailjs/browser';
import { 
  ArrowLeft, Save, Plus, Trash2, Clock, MapPin, DollarSign, 
  Loader2, CheckCircle, AlertCircle, Edit2, X, RotateCcw, Power, QrCode, Calendar, Users, ChevronDown, ChevronUp, BellRing, Bus
} from 'lucide-react';

const DAYS_OF_WEEK = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];

// Helper para formatear teléfonos para WhatsApp
function formatTelefonoWhatsApp(telefono) {
  if (!telefono) return '';
  // Limpiar el número
  let numero = telefono.replace(/[\s\-\(\)]/g, '');
  
  // Si no tiene código de país, agregar +52 (México)
  if (!numero.startsWith('+')) {
    numero = '+52' + numero;
  }
  
  return numero;
}

export function AdminDashboard() {
  // Estados de UI y Datos
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [message, setMessage] = useState(null);
  const [routesList, setRoutesList] = useState([]);
  const [editingId, setEditingId] = useState(null);

  // Estados de Gestión de Viajes (Modal)
  const [selectedRouteForTrips, setSelectedRouteForTrips] = useState(null);
  const [tripsList, setTripsList] = useState([]);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [processingCancellation, setProcessingCancellation] = useState(null); // ID del viaje cancelando
  const [expandedTripId, setExpandedTripId] = useState(null); // ID del viaje expandido (acordeon)

  // Estados de Estadísticas
  const [stats, setStats] = useState({
    totalBoletos: 0,
    totalIngresos: 0,
    viajesActivos: 0
  });

  // Estados del formulario
  const [formData, setFormData] = useState({
    nombre: '',
    origen: '',
    destino: '',
    capacidad: 14,
    horaSalida: '08:00',
    horaLlegada: '10:00',
    precioBase: 0
  });

  const [activa, setActiva] = useState(true);
  const [selectedDays, setSelectedDays] = useState(DAYS_OF_WEEK);
  const [stops, setStops] = useState([]);

  // Cargar lista de rutas al iniciar
  useEffect(() => {
    fetchRoutes();
    calculateStats();
  }, []);

  async function calculateStats() {
    try {
        // 1. Ingresos y Boletos
        const { data: reservations, error: resError } = await supabase
            .from('reservas')
            .select(`
                id,
                viajes (
                    rutas (
                        precio_base
                    )
                )
            `);
            
        if (resError) throw resError;

        let income = 0;
        let tickets = 0;

        if (reservations) {
            tickets = reservations.length;
            reservations.forEach(res => {
                // Navegar la respuesta anidada: res.viajes.rutas.precio_base
                // Nota: res.viajes puede ser array o objeto dependiendo de la relación, usalmente objeto si es N:1
                // En este caso reserva -> viaje es N:1. viaje -> ruta es N:1.
                const price = res.viajes?.rutas?.precio_base || 0;
                income += price;
            });
        }

        // 2. Viajes Activos (Futuros)
        const today = new Date().toISOString();
        const { count: tripsCount, error: tripsError } = await supabase
            .from('viajes')
            .select('id', { count: 'exact', head: true })
            .gte('fecha_salida', today);
            
        if (tripsError) throw tripsError;

        setStats({
            totalBoletos: tickets,
            totalIngresos: income,
            viajesActivos: tripsCount || 0
        });

    } catch (err) {
        console.error("Error calculando estadísticas:", err);
    }
  }

  async function fetchRoutes() {
    try {
      setFetching(true);
      const { data, error } = await supabase
        .from('rutas')
        .select('*')
        .eq('activa', true)
        .order('id', { ascending: false });

      if (error) throw error;
      setRoutesList(data || []);
    } catch (error) {
      console.error('Error fetching routes:', error);
    } finally {
      setFetching(false);
    }
  }

  // --- Lógica de Gestión de Viajes (Nuevo Modal) ---

  const openTripsModal = async (route) => {
    setSelectedRouteForTrips(route);
    setTripsList([]);
    setExpandedTripId(null);
    setLoadingTrips(true);
    
    // Solo trae viajes a futuro (o hoy) con reservas
    try {
        const today = new Date().toISOString();
        const { data, error } = await supabase
            .from('viajes')
            .select(`
                *,
                reservas (
                    id,
                    cliente_nombre,
                    cliente_email,
                    cliente_telefono,
                    codigo_visual,
                    validado
                )
            `)
            .eq('ruta_id', route.id)
            .gte('fecha_salida', today)
            .order('fecha_salida', { ascending: true });
        
        if (error) throw error;
        setTripsList(data || []);

    } catch (err) {
        console.error("Error cargando viajes:", err);
        setMessage({ type: 'error', text: 'Error cargando viajes activos.' });
    } finally {
        setLoadingTrips(false);
    }
  };

  const closeTripsModal = () => {
    setSelectedRouteForTrips(null);
    setTripsList([]);
  };

  const cancelTripAndNotify = async (tripId, passengers, tripDateStr) => {
     if (!window.confirm(`¿Estás SEGURO? Esto cancelará el viaje y enviará correo a ${passengers.length} pasajeros. Esta acción es irreversible.`)) {
         return;
     }

     setProcessingCancellation(tripId);

     try {
        // 1. Enviar correos (Bucle)
        // Nota: En producción esto debería hacerse en Backend (Edge Function), pero Frontend es aceptable para demo controlada.
        const notificationPromises = passengers.map(p => {
             return emailjs.send(
                 import.meta.env.VITE_EMAILJS_SERVICE_ID,      // 1. ID del Servicio
                 import.meta.env.VITE_EMAILJS_TEMPLATE_CANCEL, // 2. ID del Template
                 {
                     to_email: p.cliente_email,
                     to_name: p.cliente_nombre,
                     route_name: `${selectedRouteForTrips.origen} - ${selectedRouteForTrips.destino}`, // Ajustar placeholder
                     trip_date: new Date(tripDateStr).toLocaleDateString(),
                     message: 'Lamentamos informar que su viaje ha sido cancelado por motivos operativos. Contáctenos para un reembolso.'
                 },
                 import.meta.env.VITE_EMAILJS_PUBLIC_KEY // Placeholder
             ).catch(err => console.warn(`Fallo al enviar correo a ${p.cliente_email}`, err));
        });

        await Promise.all(notificationPromises);

        // 2. Eliminar de Supabase (Cascade borrará reservas si está configurado, o borramos manual)
        // Asumiendo ON DELETE CASCADE en la FK de reservas. Si no, borrar reservas primero.
        const { error: deleteError } = await supabase
            .from('viajes')
            .delete()
            .eq('id', tripId);
        
        if (deleteError) throw deleteError;

        // 3. UI Update
        setTripsList(current => current.filter(t => t.id !== tripId));
        alert('Viaje cancelado y notificaciones enviadas.');

     } catch (err) {
         console.error("Error cancelando:", err);
         alert("Hubo un error al cancelar. Verifica la consola.");
     } finally {
         setProcessingCancellation(null);
     }
  };


  // --- Lógica del Formulario ---

  const calculateMinutesDiff = (startTime, endTime) => {
    if (!startTime || !endTime) return 0;
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);

    const startTotal = startH * 60 + startM;
    let endTotal = endH * 60 + endM;

    if (endTotal < startTotal) {
      endTotal += 24 * 60; 
    }
    return endTotal - startTotal;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleStopChange = (index, field, value) => {
    const newStops = [...stops];
    newStops[index][field] = value;
    setStops(newStops);
  };

  const addStop = () => {
    const lastTime = stops.length > 0 ? stops[stops.length - 1].time : formData.horaSalida;
    setStops([...stops, { name: '', time: lastTime, precio: 0 }]);
  };

  const removeStop = (index) => {
    setStops(stops.filter((_, i) => i !== index));
  };

  const toggleDay = (day) => {
    if (selectedDays.includes(day)) {
      setSelectedDays(selectedDays.filter(d => d !== day));
    } else {
      setSelectedDays([...selectedDays, day]);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setFormData({
      nombre: '',
      origen: '',
      destino: '',
      capacidad: 14,
      horaSalida: '08:00',
      horaLlegada: '10:00',
      precioBase: 0
    });
    setStops([]);
    setActiva(true);
    setSelectedDays(DAYS_OF_WEEK);
    setMessage(null);
  };

  const handleEdit = (route) => {
    setMessage(null);
    setEditingId(route.id);
    
    setFormData({
      nombre: route.nombre,
      origen: route.origen,
      destino: route.destino,
      capacidad: route.capacidad,
      horaSalida: route.hora_salida || '08:00',
      horaLlegada: route.hora_llegada || '10:00',
      precioBase: route.precio_base
    });

    setActiva(route.activa ?? true); 
    setSelectedDays(route.dias_operativos || DAYS_OF_WEEK);

    if (route.paradas && Array.isArray(route.paradas)) {
      setStops(route.paradas.map(p => ({
        name: p.name,
        time: p.time || formData.horaSalida,
        precio: p.precio || 0
      })));
    } else {
      setStops([]);
    }

    // Si el modal está abierto, cerrarlo para evitar conflictos
    if(selectedRouteForTrips) closeTripsModal();

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteRoute = async (id, e) => {
    e.stopPropagation(); 

    // Safety Check: Verificar si hay viajes futuros con reservas
    try {
        const today = new Date().toISOString();
        const { count, error: countError } = await supabase
            .from('viajes')
            .select('reservas(count)', { count: 'exact', head: true }) // Solo contar
            .eq('ruta_id', id)
            .gte('fecha_salida', today)
            .not('reservas', 'is', null); // Filtro básico, mejor revisar lógica específica si es compleja

        // Alternativa más segura: Traer viajes y checar sus reservas manualmente si la query compleja falla
        const { data: futureTrips } = await supabase
             .from('viajes')
             .select('id, reservas(id)')
             .eq('ruta_id', id)
             .gte('fecha_salida', today);
        
        const hasActiveReservations = futureTrips?.some(t => t.reservas.length > 0);

        if (hasActiveReservations) {
            alert('⚠️ ¡ALTO! Hay pasajeros con boletos comprados para fechas futuras en esta ruta. \n\nPor favor usa el botón "Ver Salidas" para cancelar esos viajes individualmente y notificar a los clientes primero.');
            return;
        }

    } catch (err) {
        console.error("Error verificando seguridad:", err);
        // Si falla la verificación, mejor prevenir
        if(!window.confirm("No pudimos verificar si hay viajes futuros. ¿Deseas borrar de todas formas?")) return;
    }

    if (!window.confirm('¿Estás seguro de archivar esta ruta? Desaparecerá de la lista pública y del admin, pero el historial se conservará.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('rutas')
        .update({ activa: false })
        .eq('id', id);

      if (error) throw error;

      setMessage({ type: 'success', text: 'Ruta archivada correctamente' });

      if (editingId === id) {
        resetForm();
      }
      fetchRoutes();

    } catch (error) {
      console.error('Error removing route:', error);
      setMessage({ type: 'error', text: 'Error al eliminar: ' + error.message });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    if (Number(formData.capacidad) < 1) {
      setMessage({ type: 'error', text: 'La capacidad debe ser al menos 1 pasajero.' });
      setLoading(false);
      return;
    }

    try {
      const mappedStops = stops.map(stop => {
        const timeOffset = calculateMinutesDiff(formData.horaSalida, stop.time);
        return {
          name: stop.name,
          timeOffset: `${timeOffset} min`,
          time: stop.time,
          precio: Number(stop.precio)
        };
      });

      const payload = {
        nombre: formData.nombre,
        origen: formData.origen,
        destino: formData.destino,
        capacidad: Number(formData.capacidad),
        hora_salida: formData.horaSalida,
        hora_llegada: formData.horaLlegada,
        precio_base: Number(formData.precioBase),
        paradas: mappedStops,
        activa: activa,
        dias_operativos: selectedDays
      };

      let error;
      
      if (editingId) {
        const { error: updateError } = await supabase
          .from('rutas')
          .update(payload)
          .eq('id', editingId);
        error = updateError;
      } else {
        const { error: insertError } = await supabase
          .from('rutas')
          .insert([payload]);
        error = insertError;
      }

      if (error) throw error;

      setMessage({ 
        type: 'success', 
        text: editingId ? '¡Ruta actualizada correctamente!' : '¡Nueva ruta creada exitosamente!' 
      });
      
      if (!editingId) resetForm(); 
      fetchRoutes(); 

    } catch (error) {
      console.error('Error saving route:', error);
      setMessage({ type: 'error', text: 'Error: ' + error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-12 relative">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-20">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-gray-600 hover:text-blue-600 transition">
              <ArrowLeft className="w-6 h-6" />
            </Link>
            <h1 className="font-bold text-xl text-gray-900">
              {editingId ? 'Editando Ruta' : 'Gestión de Rutas'}
            </h1>
          </div>
          <div className="flex items-center gap-3">
             <Link 
               to="/admin/scanner" 
               className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-gray-800 transition shadow-sm"
             >
               <QrCode className="w-4 h-4" />
               Scanner
             </Link>
             <div className="text-sm font-medium bg-blue-50 text-blue-700 px-3 py-1 rounded-full">
               Admin
             </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        
        {/* STATS PANEL */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-blue-100 flex items-center gap-4">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                    <Users className="w-8 h-8" />
                </div>
                <div>
                    <p className="text-sm text-gray-500 font-medium">Boletos Vendidos</p>
                    <h3 className="text-2xl font-bold text-gray-900">{stats.totalBoletos}</h3>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-green-100 flex items-center gap-4">
                <div className="p-3 bg-green-50 text-green-600 rounded-lg">
                    <DollarSign className="w-8 h-8" />
                </div>
                <div>
                    <p className="text-sm text-gray-500 font-medium">Ingresos Totales</p>
                    <h3 className="text-2xl font-bold text-gray-900">
                        ${stats.totalIngresos.toLocaleString('es-MX')} MXN
                    </h3>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-orange-100 flex items-center gap-4">
                <div className="p-3 bg-orange-50 text-orange-600 rounded-lg">
                    <Bus className="w-8 h-8" /> 
                </div>
                <div>
                    <p className="text-sm text-gray-500 font-medium">Viajes Programados</p>
                    <h3 className="text-2xl font-bold text-gray-900">{stats.viajesActivos}</h3>
                </div>
            </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8 items-start">
        
        {/* COLUMNA IZQUIERDA: Formulario */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
               <div>
                  <h2 className="text-lg font-semibold text-gray-800">
                    {editingId ? 'Editar Información' : 'Crear Nueva Ruta'}
                  </h2>
                  <p className="text-sm text-gray-500">Configura todos los detalles del viaje</p>
               </div>
               {editingId && (
                 <button 
                    onClick={resetForm}
                    className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 bg-white border border-gray-200 px-3 py-1 rounded-lg"
                 >
                   <X className="w-4 h-4" /> Cancelar Edición
                 </button>
               )}
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-8">
              {message && (
                <div className={`p-4 rounded-lg flex items-center gap-3 ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                  {message.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                  {message.text}
                </div>
              )}

              {/* Status & Days */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-4">
                 <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-700">Estado de la Ruta</span>
                    <button
                      type="button"
                      onClick={() => setActiva(!activa)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition ${
                        activa ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'
                      }`}
                    >
                      <Power className="w-4 h-4" />
                      {activa ? 'Activa (Visible)' : 'Inactiva (Oculta)'}
                    </button>
                 </div>
                 
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Días Operativos</label>
                    <div className="flex flex-wrap gap-2">
                      {DAYS_OF_WEEK.map(day => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleDay(day)}
                          className={`px-3 py-1.5 text-sm rounded-md border transition ${
                            selectedDays.includes(day)
                              ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                              : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                          }`}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                    {selectedDays.length === 0 && (
                      <p className="text-xs text-red-500 mt-1">Selecciona al menos un día</p>
                    )}
                 </div>
              </div>

              {/* General Fields */}
               <div className="grid md:grid-cols-2 gap-x-6 gap-y-4">
                 <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                    <input type="text" name="nombre" placeholder="Nombre interno de la ruta" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={formData.nombre} onChange={handleChange} required />
                 </div>
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Origen</label>
                    <input type="text" name="origen" className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none" value={formData.origen} onChange={handleChange} required />
                 </div>
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Destino</label>
                    <input type="text" name="destino" className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none" value={formData.destino} onChange={handleChange} required />
                 </div>
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Salida</label>
                    <input type="time" name="horaSalida" className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none" value={formData.horaSalida} onChange={handleChange} required />
                 </div>
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Llegada</label>
                    <input type="time" name="horaLlegada" className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none" value={formData.horaLlegada} onChange={handleChange} required />
                 </div>
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Precio ($)</label>
                    <input type="number" name="precioBase" className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none" value={formData.precioBase} onChange={handleChange} required />
                 </div>
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Capacidad</label>
                    <input type="number" name="capacidad" min="1" className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none" value={formData.capacidad} onChange={handleChange} required />
                 </div>
              </div>

              {/* Stops Configuration */}
              <div className="border-t border-gray-200 pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-gray-800">Paradas Intermedias</h3>
                    <button
                      type="button"
                      onClick={addStop}
                      className="text-sm flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium"
                    >
                      <Plus className="w-4 h-4" /> Agregar Parada
                    </button>
                  </div>

                  <div className="space-y-3 bg-gray-50 p-4 rounded-xl border border-gray-100">
                    {stops.length === 0 && (
                      <p className="text-sm text-gray-500 text-center py-2">No hay paradas configuradas.</p>
                    )}
                    {stops.map((stop, index) => (
                      <div key={index} className="flex flex-col sm:flex-row gap-3 items-end bg-white p-3 rounded-lg shadow-sm border border-gray-200">
                        <div className="flex-1 w-full">
                          <label className="text-xs text-gray-500 mb-1 block">Lugar</label>
                          <input type="text" className="w-full text-sm p-2 border border-gray-300 rounded outline-none" value={stop.name} onChange={(e) => handleStopChange(index, 'name', e.target.value)} required />
                        </div>
                        <div className="w-full sm:w-32">
                           <label className="text-xs text-gray-500 mb-1 block">Hora</label>
                           <input type="time" className="w-full text-sm p-2 border border-gray-300 rounded outline-none" value={stop.time} onChange={(e) => handleStopChange(index, 'time', e.target.value)} required />
                        </div>
                        <div className="w-full sm:w-24">
                           <label className="text-xs text-gray-500 mb-1 block">Precio ($)</label>
                           <input type="number" className="w-full text-sm p-2 border border-gray-300 rounded outline-none" value={stop.precio} onChange={(e) => handleStopChange(index, 'precio', e.target.value)} min="0" />
                        </div>
                        <button type="button" onClick={() => removeStop(index)} className="p-2 text-red-500 hover:bg-red-50 rounded transition mb-[1px]">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
              </div>

              <div className="flex items-center justify-end pt-4 gap-4">
                {editingId && (
                  <button type="button" onClick={resetForm} className="px-6 py-3 rounded-lg font-medium text-gray-600 hover:bg-gray-100 transition">Cancelar</button>
                )}
                <button type="submit" disabled={loading} className="bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-700 transition flex items-center gap-2 shadow-lg disabled:opacity-70">
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                  {editingId ? 'Actualizar Ruta' : 'Crear Ruta'}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* COLUMNA DERECHA: Lista de Rutas */}
        <div className="lg:col-span-1">
           <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden sticky top-24">
             <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <h3 className="font-semibold text-gray-800">Rutas Existentes</h3>
                <button 
                  onClick={fetchRoutes} 
                  className="text-gray-500 hover:text-blue-600"
                  title="Recargar lista"
                >
                  <RotateCcw className={`w-4 h-4 ${fetching ? 'animate-spin' : ''}`} />
                </button>
             </div>
             
             <div className="max-h-[calc(100vh-200px)] overflow-y-auto p-2 space-y-2">
                {fetching ? (
                  <div className="text-center py-8 text-gray-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Cargando...
                  </div>
                ) : routesList.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    No hay rutas creadas.
                  </div>
                ) : (
                  routesList.map(route => (
                    <div 
                      key={route.id}
                      onClick={() => handleEdit(route)}
                      className={`p-3 rounded-lg border cursor-pointer transition relative group ${
                        editingId === route.id 
                          ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-300' 
                          : 'bg-white border-gray-100 hover:border-blue-300 hover:shadow-sm'
                      }`}
                    >
                      {/* Delete Button */}
                      <button
                        onClick={(e) => handleDeleteRoute(route.id, e)}
                        className="absolute top-2 right-2 p-1.5 bg-white text-red-500 rounded-md shadow-sm hover:bg-red-50 z-10 opacity-0 group-hover:opacity-100 transition"
                        title="Eliminar ruta"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      <div className="flex items-start justify-between mb-1">
                        <span className="font-semibold text-gray-800 text-sm line-clamp-1 pr-6">
                          {route.nombre}
                        </span>
                        <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${route.activa ? 'bg-green-500' : 'bg-gray-300'}`} title={route.activa ? 'Activa' : 'Inactiva'}></div>
                      </div>
                      
                      <div className="flex items-center gap-1 text-xs text-gray-500 mb-2">
                         <span>{route.origen}</span>
                         <span>→</span>
                         <span>{route.destino}</span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
                          {route.hora_salida}
                        </span>
                        
                        <div className="flex items-center gap-2">
                           {/* See Trips Button */}
                           <button 
                             onClick={(e) => {
                                 e.stopPropagation();
                                 openTripsModal(route);
                             }}
                             className="p-1 px-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded text-[10px] font-medium flex items-center gap-1 transition-all hover:scale-105"
                           >
                              <Calendar className="w-3 h-3" /> Ver Salidas
                           </button>

                           {editingId !== route.id && (
                             <div className="opacity-0 group-hover:opacity-100 transition text-blue-600">
                               <Edit2 className="w-3 h-3" />
                             </div>
                           )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
             </div>
           </div>
        </div>

        </div>
      </main>

      {/* MODAL DE GESTIÓN DE SALIDAS */}
      {selectedRouteForTrips && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
           <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
              
              {/* Header Modal */}
              <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                 <div>
                    <h2 className="text-lg font-bold text-gray-800">Próximas Salidas</h2>
                    <p className="text-sm text-gray-500">{selectedRouteForTrips.nombre} ({selectedRouteForTrips.origen} → {selectedRouteForTrips.destino})</p>
                 </div>
                 <button onClick={closeTripsModal} className="p-2 hover:bg-gray-200 rounded-full text-gray-500 transition">
                    <X className="w-5 h-5" />
                 </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50">
                 {loadingTrips ? (
                    <div className="text-center py-10">
                       <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" />
                       <p className="text-gray-500 mt-2">Cargando salidas...</p>
                    </div>
                 ) : tripsList.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-lg border border-dashed border-gray-300">
                       <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                       <p className="text-gray-500 font-medium">No hay viajes programados con reservas activas</p>
                       <p className="text-xs text-gray-400 mt-1">Los viajes se crean automáticamente cuando alguien compra</p>
                    </div>
                 ) : (
                    <div className="space-y-3">
                       {tripsList.map(trip => {
                          const dateObj = new Date(trip.fecha_salida);
                          const isExpanded = expandedTripId === trip.id;
                          const reservationsCount = trip.reservas ? trip.reservas.length : 0;
                          
                          return (
                            <div key={trip.id} className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                               <div 
                                 className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition"
                                 onClick={() => setExpandedTripId(isExpanded ? null : trip.id)}
                               >
                                  <div className="flex items-center gap-4">
                                     <div className="bg-blue-100 text-blue-700 w-12 h-12 rounded-lg flex flex-col items-center justify-center font-bold text-xs uppercase shadow-sm">
                                        <span>{dateObj.toLocaleString('es-MX', { day: 'numeric' })}</span>
                                        <span>{dateObj.toLocaleString('es-MX', { month: 'short' }).replace('.', '')}</span>
                                     </div>
                                     <div>
                                        <h4 className="font-semibold text-gray-800">
                                           {dateObj.toLocaleDateString('es-MX', { weekday: 'long' })}
                                        </h4>
                                        <div className="flex items-center gap-3 text-sm text-gray-500">
                                            <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {dateObj.toLocaleTimeString('es-MX', { hour: '2-digit', minute:'2-digit' })}</span>
                                            <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {reservationsCount} Pasajeros</span>
                                        </div>
                                     </div>
                                  </div>
                                  {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                               </div>

                               {/* Expandable Content */}
                               {isExpanded && (
                                  <div className="border-t border-gray-100 bg-gray-50 p-4 animate-in slide-in-from-top-2 duration-200">
                                     <h5 className="text-xs font-semibold text-gray-500 uppercase mb-3 flex items-center gap-2">
                                        <Users className="w-3 h-3" /> Lista de Pasajeros
                                     </h5>
                                     
                                     {reservationsCount > 0 ? (
                                        <div className="space-y-2 mb-6">
                                           {trip.reservas.map(res => (
                                              <div key={res.id} className="flex justify-between items-center bg-white p-2 rounded border border-gray-200 text-sm">
                                                 <div>
                                                    <p className="font-medium text-gray-800">{res.cliente_nombre}</p>
                                                    <p className="text-xs text-gray-500">{res.cliente_email}</p>
                                                 </div>
                                                 <div className="text-right">
                                                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${res.validado ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                        {res.validado ? 'Abordó' : 'Pendiente'}
                                                    </span>
                                                    <p className="font-mono text-xs text-gray-400 mt-0.5">{res.codigo_visual}</p>
                                                 </div>
                                              </div>
                                           ))}
                                        </div>
                                     ) : (
                                        <p className="text-sm text-gray-400 italic mb-4">Sin pasajeros registrados.</p>
                                     )}

                                     <div className="bg-red-50 border border-red-100 rounded-lg p-3">
                                        <h6 className="text-red-800 font-bold text-xs flex items-center gap-1 mb-1">
                                           <AlertCircle className="w-3 h-3" /> Zona de Peligro
                                        </h6>
                                        <p className="text-xs text-red-600 mb-3">
                                           Cancelar este viaje notificará por correo a todos los pasajeros y eliminará el registro permanentemente.
                                        </p>
                                        <button 
                                          onClick={() => cancelTripAndNotify(trip.id, trip.reservas, trip.fecha_salida)}
                                          disabled={processingCancellation === trip.id}
                                          className="w-full bg-white border border-red-200 text-red-600 hover:bg-red-600 hover:text-white transition rounded py-2 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                                        >
                                           {processingCancellation === trip.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellRing className="w-4 h-4" />}
                                           {processingCancellation === trip.id ? 'Notificando...' : 'Cancelar Viaje y Notificar'}
                                        </button>
                                     </div>
                                  </div>
                               )}
                            </div>
                          );
                       })}
                    </div>
                 )}
              </div>
           </div>
        </div>
      )}

    </div>
  );
}