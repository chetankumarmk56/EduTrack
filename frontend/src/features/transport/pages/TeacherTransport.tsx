import { useState, useEffect, useMemo, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MapPin, Navigation,
  ChevronDown, User, ShieldCheck
} from 'lucide-react';
import { transportApi } from '@/features/transport/api';
import { SkeletonList } from '@/shared/components/ui/Skeleton';
import { useAuth } from '@/shared/contexts/AuthContext';
import { useApp } from '@/shared/contexts/AppContext';
import { cn } from '@/shared/lib/utils';

const defaultCenter: [number, number] = [12.9716, 77.5946];

// --- Custom Leaflet Icons ---
const busIcon = new L.DivIcon({
  className: 'custom-bus-icon bg-transparent border-none',
  html: `<div style="width: 32px; height: 32px; background-color: #6366f1; border: 3px solid white; border-radius: 50%; box-shadow: 0 0 15px rgba(99, 102, 241, 1); display: flex; align-items: center; justify-content: center; transform: translate(-4px, -4px);"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg></div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16]
});

export default function TeacherTransport() {
  const { user } = useAuth();
  const { teacherDirectory } = useApp();
  
  const currentTeacher = useMemo(() => teacherDirectory.find((t: any) => t.user_id === user?.id), [teacherDirectory, user]);
  const assignments: any[] = currentTeacher?.assignments || [];

  const [activeClassId, setActiveClassId] = useState<number | null>(null);
  const [roster, setRoster] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Tracking state
  const [selectedBusId, setSelectedBusId] = useState<number | null>(null);
  const [trackingContext, setTrackingContext] = useState<any>(null); 
  const [busLocation, setBusLocation] = useState<{lat: number, lng: number} | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  // Initialize Class Selection
  useEffect(() => {
    if (assignments.length > 0 && !activeClassId) {
      setActiveClassId(assignments[0].school_class.id);
    }
  }, [assignments, activeClassId]);

  // Fetch Roster when class changes
  useEffect(() => {
    if (!activeClassId) return;
    
    const fetchRoster = async () => {
      setIsLoading(true);
      try {
        const data = await transportApi.getClassTransportRoster(activeClassId);
        setRoster(data);
      } catch (err) {
        console.error("Failed to load roster", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchRoster();
  }, [activeClassId]);

  // Fetch Route context when a specific bus is selected to track
  useEffect(() => {
      if (!selectedBusId) {
          setTrackingContext(null);
          setBusLocation(null);
          return;
      }

      const fetchContext = async () => {
          try {
              const allRoutes = await transportApi.getRoutes();
              const assignedRoute = allRoutes.find((r: any) => r.bus_id === selectedBusId);
              if (assignedRoute) {
                 setTrackingContext(assignedRoute);
              }
          } catch(err) {
              console.error(err);
          }
      };
      fetchContext();
  }, [selectedBusId]);

  // WebSocket for Live Tracking
  useEffect(() => {
    if (!selectedBusId) return;

    const connectWS = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host.replace(':3000', ':8000')}/api/transport/ws/transport/${selectedBusId}`;
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.latitude && data.longitude) {
          setBusLocation({
            lat: data.latitude,
            lng: data.longitude
          });
        }
      };

      ws.onclose = () => {
        // console.log("WebSocket disconnected. Reconnecting...");
        setTimeout(connectWS, 4000);
      };
    };

    connectWS();
    return () => wsRef.current?.close();
  }, [selectedBusId]);

  // Convert polyline to leaflet format [lat, lng][]
  const routePositions: [number, number][] = trackingContext?.polyline 
    ? trackingContext.polyline.map((p: any) => [p.lat, p.lng]) 
    : [];

  const mapCenter: [number, number] = busLocation 
      ? [busLocation.lat, busLocation.lng] 
      : (routePositions.length > 0 ? routePositions[0] : defaultCenter);

  // Filter unique assignments for dropdown
  const uniqueClasses = useMemo(() => {
      const map = new Map();
      assignments.forEach((a: any) => {
          if (!map.has(a.school_class.id)) {
              map.set(a.school_class.id, a.school_class);
          }
      });
      return Array.from(map.values());
  }, [assignments]);

  return (
    <div className="premium-page-container animate-fade-in flex flex-col gap-6 h-[calc(100vh-120px)] relative">
       {/* WIP Overlay */}
       <div className="absolute inset-0 z-[100] backdrop-blur-md bg-slate-950/40 rounded-2xl sm:rounded-[3rem] flex flex-col items-center justify-center p-6 sm:p-12 text-center border border-white/10 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-transparent pointer-events-none" />
        <div className="relative space-y-8 max-w-2xl">
          <div className="w-24 h-24 rounded-[2.5rem] bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mx-auto animate-pulse">
            <Navigation className="w-12 h-12" />
          </div>
          <div className="space-y-4">
            <h2 className="text-2xl sm:text-3xl md:text-5xl font-black tracking-tighter text-white uppercase italic">Logistics <span className="text-indigo-500">Refactoring</span></h2>
            <p className="text-sm font-medium text-text-secondary leading-relaxed uppercase tracking-widest">
              The faculty logistics roster and live telemetry stream are undergoing a structural upgrade to support real-time institutional scaling.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em]">
             Engine Stabilization in Progress
          </div>
        </div>
      </div>

      {/* HUD Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shrink-0">
         <div className="space-y-1">
            <h1 className="text-4xl font-black tracking-tight text-white uppercase italic">Logistics <span className="text-indigo-500">Roster</span></h1>
            <div className="flex items-center gap-3">
               <div className="px-2 py-1 rounded-md bg-indigo-500/10 border border-indigo-500/20 flex items-center gap-1.5">
                  <Navigation className="w-3 h-3 text-indigo-400" />
                  <span className="text-[8px] font-black uppercase text-indigo-400 tracking-widest">Faculty Context</span>
               </div>
               <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">Transport Operations</span>
            </div>
         </div>

         <div className="flex items-center gap-4 bg-muted/30 border border-primary/20 rounded-2xl px-5 py-3 shadow-premium group hover:border-primary/40 transition-all backdrop-blur-md">
            <span className="text-[10px] font-black uppercase text-primary tracking-widest">Select Sector:</span>
            <select 
               value={activeClassId || ''} 
               onChange={(e) => {
                   setActiveClassId(Number(e.target.value));
                   setSelectedBusId(null);
               }}
               className="bg-transparent text-sm font-black text-foreground focus:outline-none cursor-pointer pr-2 appearance-none"
            >
               {uniqueClasses.map((cls: any) => (
                 <option key={cls.id} value={cls.id} className="bg-card text-foreground font-sans">
                   {cls.grade.name}-{cls.section.name}
                 </option>
               ))}
            </select>
            <ChevronDown className="w-4 h-4 text-primary/50 group-hover:text-primary transition-colors" />
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
         
         {/* LEFT: Logistics Table */}
         <div className="lg:col-span-5 flex flex-col gap-4 overflow-hidden h-full">
            <div className="obsidian-card p-6 border-glass-border bg-white/[0.01] flex-1 flex flex-col min-h-0 overflow-hidden">
               <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-text-secondary">Assigned Students</h3>
                  <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">{roster.length} registered</div>
               </div>
               
               <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                  {isLoading ? (
                     <SkeletonList rows={5} />
                  ) : roster.length === 0 ? (
                     <div className="py-20 text-center opacity-30 italic font-black uppercase tracking-widest text-xs">No records found.</div>
                  ) : (
                     <AnimatePresence mode="popLayout">
                        {roster.map((student) => (
                           <motion.div 
                              layout 
                              key={student.student_id}
                              className={cn(
                                 "p-4 rounded-2xl border transition-all flex items-center justify-between",
                                 selectedBusId === student.bus_id && student.bus_id ? "bg-indigo-600/10 border-indigo-500/40" : "bg-white/[0.02] border-glass-border hover:bg-white/5"
                              )}
                           >
                              <div className="flex items-center gap-3">
                                 <div className={cn(
                                    "w-10 h-10 rounded-xl flex items-center justify-center font-black",
                                    student.bus_id ? "bg-indigo-500/20 text-indigo-400" : "bg-muted/40 text-text-secondary"
                                 )}>
                                    <User className="w-4 h-4" />
                                 </div>
                                 <div className="flex flex-col">
                                    <span className="text-sm font-black text-white">{student.student_name}</span>
                                    {student.bus_id ? (
                                       <span className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.2em] line-clamp-1">BUS: {student.bus_number} • {student.stop_name}</span>
                                    ) : (
                                       <span className="text-[8px] font-bold text-rose-400/50 uppercase tracking-widest pr-4">Walk-in / Private</span>
                                    )}
                                 </div>
                              </div>
                              
                              {student.bus_id && (
                                 <button 
                                    onClick={() => setSelectedBusId(student.bus_id)}
                                    className={cn(
                                       "shrink-0 px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                                       selectedBusId === student.bus_id ? "bg-indigo-500 text-white" : "bg-white/5 text-text-secondary hover:bg-white/10 hover:text-white"
                                    )}
                                 >
                                    Track
                                 </button>
                              )}
                           </motion.div>
                        ))}
                     </AnimatePresence>
                  )}
               </div>
            </div>
         </div>

         {/* RIGHT: Live Tracking Map */}
         <div className="lg:col-span-7 flex flex-col overflow-hidden rounded-[2.5rem] border border-glass-border shadow-2xl relative bg-slate-900/40 z-0">
            {selectedBusId ? (
                <>
                    <div className="absolute top-6 left-6 z-10 p-4 rounded-2xl bg-black/60 backdrop-blur-md border border-glass-border shadow-2xl space-y-1 w-64 max-w-full">
                    <div className="flex items-center gap-2 mb-2">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-[9px] font-black uppercase text-emerald-400 tracking-widest">Active Stream</span>
                    </div>
                    <p className="text-sm font-black text-white truncate">{trackingContext?.name || "Tracking Logistics"}</p>
                    </div>

                    <MapContainer 
                        center={mapCenter} 
                        zoom={15} 
                        style={{ height: '100%', width: '100%', backgroundColor: '#0f172a' }}
                        zoomControl={false}
                    >
                    <TileLayer
                        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>'
                    />

                    {/* Route Trajectory */}
                    {routePositions.length > 0 && (
                        <Polyline positions={routePositions} pathOptions={{ color: '#6366f1', weight: 4, opacity: 0.8 }} />
                    )}

                    {/* Live Bus Marker */}
                    {busLocation && (
                        <Marker position={[busLocation.lat, busLocation.lng]} icon={busIcon} />
                    )}
                    </MapContainer>
                </>
            ) : (
               <div className="w-full h-full flex flex-col items-center justify-center gap-6 text-center px-8">
                  <div className="w-20 h-20 rounded-3xl bg-white/5 flex items-center justify-center text-text-secondary/50">
                     <MapPin className="w-10 h-10" />
                  </div>
                  <div>
                     <p className="text-sm font-black text-white uppercase tracking-widest mb-2">No Target Selected</p>
                     <p className="text-xs text-text-secondary">Select "Track" on an assigned student to initiate a live telemetry stream.</p>
                  </div>
               </div>
            )}
         </div>

      </div>
    </div>
  );
}
