import { useState, useEffect, useCallback, useMemo } from 'react';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, Polyline, Circle, useMapEvents, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MapPin, Navigation, Trash2, Save, Bus, Plus,
  Hash, ChevronRight, Loader2, Route as RouteIcon,
  Sparkles, Wand2, User, ChevronDown, CheckCircle2
} from 'lucide-react';
import { transportApi } from '@/features/transport/api';
import { useApp } from '@/shared/contexts/AppContext';
import { cn } from '@/shared/lib/utils';
import { findNearestPointOnPath, sortStopsByPath } from '@/shared/lib/geoUtils';

const defaultCenter: [number, number] = [12.9716, 77.5946];

// --- Custom Leaflet Icons ---
const getStopIcon = (order: number) => new L.DivIcon({
  className: 'custom-stop-icon bg-transparent border-none',
  html: `<div style="width: 28px; height: 28px; background-color: #6366f1; border: 3px solid white; border-radius: 50%; box-shadow: 0 0 10px rgba(99, 102, 241, 0.8); display: flex; align-items: center; justify-content: center; color: white; font-weight: 900; font-size: 12px; transform: translate(-2px, -2px);">${order}</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14]
});

// --- Types ---
interface LatLng {
  lat: number;
  lng: number;
}

interface Stop {
  id?: string;
  name: string;
  lat: number;
  lng: number;
  order: number;
}

type EditMode = 'STOPS' | 'ROUTE' | 'ALLOCATE';

// Map Event Handler Component for Leaflet
function MapClickInterceptor({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

interface BusRow {
  id: number;
  bus_number: string;
  driver_name?: string;
  capacity?: number;
}

interface RouteRow {
  id: number;
  name: string;
  bus_id?: number | null;
  polyline?: LatLng[];
  stops?: { id: number; name: string; latitude: number; longitude: number; stop_order: number }[];
}

export default function AdminTransport() {
  const { students } = useApp();
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [buses, setBuses] = useState<BusRow[]>([]);
  
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [routePath, setRoutePath] = useState<LatLng[]>([]);
  const [editMode, setEditMode] = useState<EditMode>('STOPS');
  
  const [isSaving, setIsSaving] = useState(false);
  const [, setIsLoadingRoutes] = useState(true);

  // Assignment Console specific state
  const [searchQuery, setSearchQuery] = useState('');
  const [assigningStudent, setAssigningStudent] = useState<number | null>(null);

  // --- Fetch Initial Data ---
  useEffect(() => {
    const fetchMatrix = async () => {
      try {
        const [rData, bData] = await Promise.all([
          transportApi.getRoutes(),
          transportApi.getBuses()
        ]);
        setRoutes(rData);
        setBuses(bData);
      } catch (err) {
        console.error("Failed to load transport matrix", err);
      } finally {
        setIsLoadingRoutes(false);
      }
    };
    fetchMatrix();
  }, []);

  // --- Update stops/path when route changes ---
  useEffect(() => {
    const active = routes.find(r => r.id === selectedRouteId);
    if (active) {
      setRoutePath(active.polyline || []);
      if (active.stops) {
          setStops(active.stops.map((s) => ({
              id: s.id.toString(),
              name: s.name,
              lat: s.latitude,
              lng: s.longitude,
              order: s.stop_order
          })));
      } else {
          setStops([]);
      }
      // If we switch to ALLOCATE and no route is selected, revert
    } else {
      setRoutePath([]);
      setStops([]);
      if (editMode === 'ALLOCATE') setEditMode('STOPS');
    }
  }, [selectedRouteId, routes]);

  // --- Automatic Stop Ordering ---
  useEffect(() => {
    if (routePath.length >= 2 && stops.length > 0) {
      const reordered = sortStopsByPath(stops, routePath);
      const hasChanged = JSON.stringify(reordered) !== JSON.stringify(stops);
      if (hasChanged) {
        setStops(reordered);
      }
    }
  }, [routePath, stops]);

  // --- Map Interactions ---
  const handleMapClick = useCallback((lat: number, lng: number) => {
    // Only map clicks when NOT in ALLOCATE mode
    if (editMode === 'ALLOCATE') return;
    
    const clickedPoint = { lat, lng };

    if (editMode === 'STOPS') {
      let finalPoint = clickedPoint;
      
      // Auto-Snap to Path if path exists
      if (routePath.length >= 2) {
        const snapped = findNearestPointOnPath(clickedPoint, routePath);
        finalPoint = snapped.point;
      }

      const newStop: Stop = {
        id: Math.random().toString(36).substr(2, 9),
        name: `Stop ${stops.length + 1}`,
        lat: finalPoint.lat,
        lng: finalPoint.lng,
        order: stops.length + 1
      };
      setStops(prev => [...prev, newStop]);
    } else if (editMode === 'ROUTE') {
      setRoutePath(prev => [...prev, clickedPoint]);
    }
  }, [stops, editMode, routePath]);

  // --- Stop Management ---
  const updateStopName = (id: string, name: string) => {
    setStops(prev => prev.map(s => s.id === id ? { ...s, name } : s));
  };

  const removeStop = (id: string) => {
    setStops(prev => prev.filter(s => s.id !== id));
  };

  // --- Save Logistics Matrix ---
  const handleSave = async () => {
    if (!selectedRouteId && stops.length === 0 && routePath.length === 0) return;
    
    setIsSaving(true);
    try {
      const stopPayload = stops.map(s => ({
        name: s.name,
        latitude: s.lat,
        longitude: s.lng,
        stop_order: s.order
      }));

      if (selectedRouteId) {
        await transportApi.updateRoute(selectedRouteId, {
          polyline: routePath
        });
        if (stopPayload.length > 0) {
          await transportApi.createStops(stopPayload.map(s => ({ ...s, route_id: selectedRouteId })));
        }
      } else {
        const name = prompt("Enter designation for this new logistics route:");
        if (!name) {
          setIsSaving(false);
          return;
        }

        await transportApi.saveIntegratedRoute({
          name,
          polyline: routePath,
          stops: stopPayload
        });
      }
      
      alert("Integrated Logistics Matrix synchronized successfully.");
      const updatedRoutes = await transportApi.getRoutes();
      setRoutes(updatedRoutes);
    } catch (err) {
      console.error(err);
      alert("Failed to synchronize transport matrix.");
    } finally {
      setIsSaving(false);
    }
  };

  // --- Assignment Logic ---
  const handleLinkBus = async (busId: number) => {
      if (!selectedRouteId) return;
      try {
          await transportApi.updateRoute(selectedRouteId, { bus_id: busId });
          setRoutes(prev => prev.map(r => r.id === selectedRouteId ? { ...r, bus_id: busId } : r));
      } catch {
          alert('Failed to link vehicle to route.');
      }
  };

  const handleAssignStudent = async (studentId: number, stopId: number) => {
      const route = routes.find(r => r.id === selectedRouteId);
      if (!route || !route.bus_id) {
          alert('You must link a Vehicle to this Route first before allocating students.');
          return;
      }
      
      setAssigningStudent(studentId);
      try {
          await transportApi.assignStudent({
              student_id: studentId,
              bus_id: route.bus_id,
              stop_id: stopId
          });
          alert('Student allocated to bus stop successfully!');
      } catch {
          alert('Failed to allocate student.');
      } finally {
          setAssigningStudent(null);
      }
  };

  const filteredStudents = useMemo(() => {
      if (!searchQuery) return students.slice(0, 50); // limit to not kill DOM
      return students.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 50);
  }, [students, searchQuery]);

  const activeRoute = routes.find(r => r.id === selectedRouteId);

  // Convert polyline to leaflet format [lat, lng][]
  const leafletRoutePath: [number, number][] = routePath.map(p => [p.lat, p.lng]);
  const mapCenter: [number, number] = leafletRoutePath.length > 0 ? leafletRoutePath[0] : defaultCenter;

  return (
    <div className="premium-page-container animate-fade-in flex flex-col gap-8 h-[calc(100vh-120px)] relative">
      {/* WIP Overlay */}
      <div className="absolute inset-0 z-[100] backdrop-blur-md bg-slate-950/40 rounded-2xl sm:rounded-[3rem] flex flex-col items-center justify-center p-6 sm:p-12 text-center border border-white/10 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-transparent pointer-events-none" />
        <div className="relative space-y-8 max-w-2xl">
          <div className="w-24 h-24 rounded-[2.5rem] bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mx-auto animate-pulse">
            <RouteIcon className="w-12 h-12" />
          </div>
          <div className="space-y-4">
            <h2 className="text-2xl sm:text-3xl md:text-5xl font-black tracking-tighter text-white uppercase italic">Matrix <span className="text-indigo-500">Calibration</span></h2>
            <p className="text-sm font-medium text-text-secondary leading-relaxed uppercase tracking-widest">
              Administrative transport mapping and student allocation terminals are being upgraded with advanced geospatial intelligence.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em]">
             System Infrastructure Hardening
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 shrink-0 z-10">
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-black uppercase tracking-widest">
            <Navigation className="w-3.5 h-3.5" /> Logistic Intelligence
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-white uppercase italic">Transport <span className="text-indigo-500">Mapper</span></h1>
        </div>
        
        {selectedRouteId && (
          <button
            disabled={true}
            title="Google Routing Engine disabled. Using Leaflet local rendering."
            className="flex items-center gap-3 px-8 py-4 rounded-2xl bg-indigo-500/10 text-white/40 font-black text-xs uppercase tracking-[0.2em] transition-all border border-indigo-500/10 cursor-not-allowed"
          >
            <Sparkles className="w-4 h-4" />
            Optimize Trace (Disabled)
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
        {/* Sidebar: Route Selection & Ops List */}
        <div className="lg:col-span-4 flex flex-col gap-4 overflow-hidden h-full z-10">
          
          <div className="obsidian-card p-4 border-glass-border bg-white/[0.01] shrink-0">
             <div className="flex p-1 bg-white/5 rounded-2xl gap-1">
                <button onClick={() => setEditMode('STOPS')} className={cn("flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase transition-all", editMode === 'STOPS' ? "bg-indigo-500 text-white" : "text-text-secondary hover:bg-white/5")}>
                   <MapPin className="w-4 h-4" /> Stops
                </button>
                <button onClick={() => setEditMode('ROUTE')} className={cn("flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase transition-all", editMode === 'ROUTE' ? "bg-indigo-500 text-white" : "text-text-secondary hover:bg-white/5")}>
                   <RouteIcon className="w-4 h-4" /> Path
                </button>
                <button disabled={!selectedRouteId} onClick={() => setEditMode('ALLOCATE')} className={cn("flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase transition-all disabled:opacity-20 disabled:cursor-not-allowed", editMode === 'ALLOCATE' ? "bg-indigo-500 text-white" : "text-text-secondary hover:bg-white/5")}>
                   <User className="w-4 h-4" /> Allocate
                </button>
             </div>
          </div>

          <div className={cn("obsidian-card p-6 border-glass-border bg-white/[0.01] flex flex-col shrink-0", editMode === 'ALLOCATE' ? "h-[25%]" : "h-[30%]")}>
             <div className="flex items-center justify-between mb-4 px-1 shrink-0">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-text-secondary flex items-center gap-2">
                  <Hash className="w-3.5 h-3.5" /> Registry {activeRoute ? `> ${activeRoute.name}` : ''}
                </h3>
                <button 
                  onClick={() => { setSelectedRouteId(null); setStops([]); setRoutePath([]); setEditMode('ROUTE'); }}
                  className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-all border border-indigo-500/20"
                  title="Initialize New Matrix"
                >
                   <Plus className="w-3.5 h-3.5" />
                </button>
             </div>
             <div className="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                {routes.map((r) => (
                   <button key={r.id} onClick={() => setSelectedRouteId(r.id)} className={cn("w-full p-4 rounded-xl border text-left transition-all flex items-center justify-between group", selectedRouteId === r.id ? "bg-indigo-600/10 border-indigo-500/40 text-white" : "bg-white/[0.02] border-glass-border text-text-secondary hover:bg-white/5")}>
                      <div className="flex items-center gap-3">
                         <div className={cn("p-2 rounded-lg", selectedRouteId === r.id ? "bg-indigo-500 text-white" : "bg-white/5")}>
                            <Bus className="w-4 h-4" />
                         </div>
                         <div className="flex flex-col">
                           <span className="font-black italic uppercase text-xs">{r.name}</span>
                           <span className="text-[8px] uppercase tracking-widest opacity-60">
                             {r.bus_id ? `Linked: Bus #${buses.find(b => b.id === r.bus_id)?.bus_number}` : 'No Vehicle Linked'}
                           </span>
                         </div>
                      </div>
                      <ChevronRight className={cn("w-4 h-4 transition-all opacity-0 group-hover:opacity-100", selectedRouteId === r.id && "translate-x-1 opacity-100")} />
                   </button>
                ))}
             </div>
          </div>

          <div className="obsidian-card p-6 border-glass-border bg-white/[0.01] flex-1 flex flex-col min-h-0 overflow-hidden relative">
             
             {/* ALLOCATE MODE View */}
             {editMode === 'ALLOCATE' ? (
                <>
                  <div className="mb-4 px-1 shrink-0 space-y-4">
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-text-secondary italic">Assignment Console</h3>
                      
                      <div className="flex flex-col gap-2 p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/10">
                          <label className="text-[9px] font-black uppercase tracking-widest text-indigo-300">Link Vehicle Pipeline</label>
                          <div className="relative">
                            <select 
                                value={activeRoute?.bus_id || ''} 
                                onChange={(e) => handleLinkBus(Number(e.target.value))}
                                className="w-full bg-slate-900 border border-glass-border rounded-lg px-4 py-3 text-xs font-black uppercase text-white appearance-none cursor-pointer"
                            >
                                <option value="" disabled>-- SELECT INVENTORY VEHICLE --</option>
                                {buses.map(b => (
                                    <option key={b.id} value={b.id}>BUS #{b.bus_number} (Cap: {b.capacity})</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 pointer-events-none" />
                          </div>
                      </div>

                      <input 
                         type="text" 
                         placeholder="Search students..." 
                         value={searchQuery}
                         onChange={(e) => setSearchQuery(e.target.value)}
                         className="w-full bg-white/5 border border-glass-border rounded-lg px-4 py-3 text-xs font-medium text-white focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                  </div>

                  <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                     {filteredStudents.map(student => (
                         <div key={student.id} className="p-4 rounded-2xl bg-white/[0.02] border border-glass-border flex flex-col gap-3">
                             <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-text-secondary text-[10px]">
                                   <User className="w-4 h-4" />
                                </div>
                                <div className="flex flex-col">
                                   <span className="text-xs font-black text-white">{student.name}</span>
                                   <span className="text-[9px] uppercase tracking-widest text-text-secondary">{student.school_class?.grade?.name} {student.school_class?.section?.name}</span>
                                </div>
                             </div>

                             <div className="flex items-center gap-2">
                                <select 
                                    className="flex-1 bg-white/5 border border-glass-border rounded-lg px-3 py-2 text-[10px] uppercase font-black text-white appearance-none cursor-pointer leading-tight"
                                    onChange={(e) => {
                                        if (e.target.value) handleAssignStudent(student.id, Number(e.target.value));
                                        e.target.value = ""; // Reset
                                    }}
                                    defaultValue=""
                                    disabled={assigningStudent === student.id}
                                >
                                    <option value="" disabled>ASSIGN TO STOP...</option>
                                    {stops.map(s => (
                                        <option key={s.id} value={s.id}>{s.name} (Idx: {s.order})</option>
                                    ))}
                                </select>
                                {assigningStudent === student.id && <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />}
                             </div>
                         </div>
                     ))}
                  </div>
                </>
             ) : (
             /* STOPS/ROUTE Edit Mode View */
               <>
                  <div className="absolute top-0 right-0 p-4 z-10">
                     <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                        <Wand2 className="w-3 h-3 text-indigo-400" />
                        <span className="text-[8px] font-black uppercase text-indigo-400 tracking-widest">Auto-Sequencing Active</span>
                     </div>
                  </div>

                  <div className="mb-6 px-1 shrink-0">
                     <h3 className="text-[10px] font-black uppercase tracking-widest text-text-secondary italic">Sequential Registry</h3>
                     <p className="text-[8px] font-bold text-indigo-500/60 uppercase tracking-widest mt-1">{editMode === 'STOPS' ? 'Automatic stop calibration enabled' : 'Manual trajectory trace'}</p>
                  </div>

                  <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                     <AnimatePresence mode="popLayout">
                     {editMode === 'STOPS' ? stops.map((stop, index) => (
                        <motion.div layout key={stop.id || index} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="p-4 rounded-2xl bg-white/[0.02] border border-glass-border group relative overflow-hidden">
                           <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 group-hover:w-2 transition-all" />
                           <div className="flex items-center justify-between gap-4 ml-2">
                              <div className="flex flex-col gap-1 flex-1">
                                 <div className="flex items-center gap-2">
                                    <span className="text-[9px] font-black text-indigo-400">INDEX {stop.order}</span>
                                    <input value={stop.name} onChange={(e) => updateStopName(stop.id!, e.target.value)} className="bg-transparent border-none text-xs font-black italic uppercase text-white outline-none w-full" />
                                 </div>
                                 <p className="text-[7px] font-bold text-text-secondary opacity-30 tracking-widest uppercase">Geoposition Locked</p>
                              </div>
                              <button onClick={() => removeStop(stop.id!)} className="p-2.5 rounded-xl bg-rose-500/5 text-rose-500/20 hover:text-rose-500 hover:bg-rose-500/10 transition-all">
                                 <Trash2 className="w-4 h-4" />
                              </button>
                           </div>
                        </motion.div>
                     )) : (
                        <div className="py-8 space-y-4">
                           <div className="p-6 rounded-3xl bg-indigo-500/5 border border-indigo-500/10 text-center space-y-4">
                              <div className="w-12 h-12 rounded-full bg-indigo-500/10 flex items-center justify-center mx-auto text-indigo-500">
                                 <RouteIcon className="w-6 h-6" />
                              </div>
                              <p className="text-[10px] font-black uppercase text-white">{routePath.length} trajectory nodes</p>
                              <button onClick={() => setRoutePath(prev => prev.slice(0, -1))} disabled={routePath.length === 0} className="w-full py-3 rounded-xl bg-white/5 text-[9px] font-black uppercase hover:bg-white/10 transition-all disabled:opacity-20">Undo Trace</button>
                           </div>
                        </div>
                     )}
                     </AnimatePresence>
                  </div>

                  <div className="pt-6 mt-4 border-t border-glass-border shrink-0">
                     <button onClick={handleSave} disabled={isSaving || (stops.length === 0 && routePath.length === 0)} className="indigo-glow-button w-full py-4 text-[10px] font-black uppercase italic flex items-center justify-center gap-3">
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Authorize Logistics Matrix
                     </button>
                  </div>
               </>
             )}
          </div>
        </div>

        {/* Main: Map Viewport */}
        <div className="lg:col-span-8 overflow-hidden rounded-[2.5rem] border border-glass-border shadow-2xl relative bg-slate-900/50 z-0">
            <MapContainer 
                center={mapCenter} 
                zoom={14} 
                style={{ height: '100%', width: '100%', cursor: editMode !== 'ALLOCATE' ? 'crosshair' : 'grab', backgroundColor: '#0f172a' }}
                zoomControl={true}
            >
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>'
                />
                
                {/* Event Interceptor for drawing mode */}
                <MapClickInterceptor onMapClick={handleMapClick} />

                {/* Polyline Trajectory */}
                {leafletRoutePath.length > 0 && (
                    <Polyline positions={leafletRoutePath} pathOptions={{ color: editMode === 'ALLOCATE' ? '#4f46e5' : '#6366f1', weight: editMode === 'ALLOCATE' ? 3 : 4, opacity: 0.8 }} />
                )}

                {/* Path Visual Helper Nodes */}
                {editMode === 'ROUTE' && leafletRoutePath.map((point, i) => (
                    <Circle key={`p-${i}`} center={point} radius={25} pathOptions={{ fillColor: '#6366f1', fillOpacity: 0.4, stroke: false }} />
                ))}

                {/* Stops with Halo markers */}
                {stops.map((stop, i) => (
                  <Marker
                    key={stop.id || i}
                    position={[stop.lat, stop.lng]}
                    icon={getStopIcon(stop.order)}
                  >
                     <Tooltip direction="top" offset={[0, -10]} opacity={1}>
                       <span className="font-black text-xs">{stop.name}</span>
                     </Tooltip>
                  </Marker>
                ))}
            </MapContainer>

           {/* Overlay status */}
           {selectedRouteId && (
              <div className="absolute bottom-6 right-6 p-4 rounded-2xl bg-black/60 backdrop-blur-md border border-glass-border shadow-2xl z-[1000] pointer-events-none">
                 <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                       <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                       <p className="text-[9px] font-black uppercase text-white tracking-widest italic">Matrix Synchronized</p>
                    </div>
                    {editMode === 'ALLOCATE' && activeRoute?.bus_id && (
                       <div className="flex items-center gap-2 mt-1 py-1 px-2 rounded bg-indigo-500/20 border border-indigo-500/30">
                          <CheckCircle2 className="w-3 h-3 text-indigo-400" />
                          <p className="text-[8px] font-black text-indigo-200">READY FOR ONBOARDING</p>
                       </div>
                    )}
                 </div>
              </div>
           )}
        </div>
      </div>
    </div>
  );
}
