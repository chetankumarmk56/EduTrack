import { useState, useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, Polyline, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { 
  Bus, MapPin, Loader2, 
  Info, Phone, ShieldCheck
} from 'lucide-react';
import { transportApi } from '../../api/transportApi';


// --- Custom Leaflet Icons ---
const busIcon = new L.DivIcon({
  className: 'custom-bus-icon bg-transparent border-none',
  html: `<div style="width: 32px; height: 32px; background-color: #6366f1; border: 3px solid white; border-radius: 50%; box-shadow: 0 0 15px rgba(99, 102, 241, 1); display: flex; align-items: center; justify-content: center; transform: translate(-4px, -4px);"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg></div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16]
});

const homeIcon = new L.DivIcon({
  className: 'custom-home-icon bg-transparent border-none',
  html: `<div style="width: 20px; height: 20px; background-color: #f43f5e; border: 3px solid white; border-radius: 50%; box-shadow: 0 0 12px rgba(244, 63, 94, 0.8); transform: translate(-2px, -2px);"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10]
});

// --- Types ---
interface LatLng {
  lat: number;
  lng: number;
}

export default function BusTracking() {
  const [assignment, setAssignment] = useState<any>(null);
  const [busLocation, setBusLocation] = useState<LatLng | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);

  // --- Fetch Assignment ---
  useEffect(() => {
    const fetchAssignment = async () => {
      try {
        const data = await transportApi.getMyAssignment();
        setAssignment(data);
      } catch (err: any) {
        console.error(err);
        setError(err.response?.data?.detail || "Transport assignment matrix unavailable.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchAssignment();
  }, []);

  // --- WebSocket Connection ---
  useEffect(() => {
    if (!assignment?.bus?.id) return;

    const connectWS = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host.replace(':3000', ':8000')}/api/transport/ws/transport/${assignment.bus.id}`;
      
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
        console.log("WebSocket disconnected. Reconnecting...");
        setTimeout(connectWS, 3000);
      };
    };

    connectWS();
    return () => wsRef.current?.close();
  }, [assignment]);

  if (isLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 animate-pulse">
        <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
        <p className="text-[10px] uppercase font-black tracking-widest text-indigo-300">Synchronizing Logistics Stream...</p>
      </div>
    );
  }

  if (error || !assignment) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center gap-6">
        <div className="w-20 h-20 rounded-3xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500">
           <MapPin className="w-10 h-10" />
        </div>
        <div className="space-y-2">
           <h3 className="text-xl font-black uppercase text-white">Registry Offset</h3>
           <p className="text-xs text-text-secondary max-w-xs">{error || "Your student is not currently assigned to an active transport route."}</p>
        </div>
      </div>
    );
  }

  // Convert polyline to leaflet format [lat, lng][]
  const routePositions: [number, number][] = assignment.route.polyline 
    ? assignment.route.polyline.map((p: any) => [p.lat, p.lng]) 
    : [];

  const mapCenter: [number, number] = busLocation 
      ? [busLocation.lat, busLocation.lng] 
      : [assignment.stop.latitude, assignment.stop.longitude];

  return (
    <div className="premium-page-container animate-fade-in flex flex-col gap-6 h-[calc(100vh-120px)]">
      {/* HUD Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shrink-0">
         <div className="space-y-1">
            <h1 className="text-4xl font-black tracking-tight text-white uppercase italic">Live <span className="text-indigo-500">Tracking</span></h1>
            <div className="flex items-center gap-3">
               <div className="px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[8px] font-black uppercase text-emerald-400 tracking-widest">Connected</span>
               </div>
               <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">Route: {assignment.route.name}</span>
            </div>
         </div>

         <div className="flex items-center gap-2">
            <div className="obsidian-card px-4 py-2 border-glass-border bg-white/[0.01] flex items-center gap-3">
               <Bus className="w-4 h-4 text-indigo-400" />
               <div className="flex flex-col">
                  <span className="text-[8px] font-black text-text-secondary uppercase">Vehicle ID</span>
                  <span className="text-xs font-black text-white">{assignment.bus.bus_number}</span>
               </div>
            </div>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
         {/* Map Viewport */}
         <div className="lg:col-span-8 rounded-[2.5rem] border border-glass-border overflow-hidden shadow-2xl relative bg-slate-900/40 z-0">
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

              {/* Home Stop */}
              <Marker position={[assignment.stop.latitude, assignment.stop.longitude]} icon={homeIcon}>
                 <Tooltip direction="top" offset={[0, -10]} opacity={1} permanent>
                   <span className="font-black text-xs">HOME</span>
                 </Tooltip>
              </Marker>

              {/* Live Bus Marker */}
              {busLocation && (
                <Marker position={[busLocation.lat, busLocation.lng]} icon={busIcon} />
              )}
            </MapContainer>
         </div>

         {/* Logistic Meta Sidebar */}
         <div className="lg:col-span-4 flex flex-col gap-6 overflow-hidden">
            <div className="obsidian-card p-6 border-glass-border bg-white/[0.01] space-y-6">
               <h3 className="text-[10px] font-black uppercase tracking-widest text-indigo-400 italic flex items-center gap-2">
                  <Info className="w-3.5 h-3.5" /> Logistic Intelligence
               </h3>
               
               <div className="space-y-4">
                  <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.02] border border-glass-border">
                     <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                        <Phone className="w-5 h-5" />
                     </div>
                     <div>
                        <p className="text-[8px] font-black text-text-secondary uppercase">Driver Contact</p>
                        <p className="text-sm font-black text-white">{assignment.bus.driver_name}</p>
                        <p className="text-[10px] font-bold text-indigo-400">{assignment.bus.driver_phone}</p>
                     </div>
                  </div>

                  <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.02] border border-glass-border">
                     <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                        <ShieldCheck className="w-5 h-5" />
                     </div>
                     <div>
                        <p className="text-[8px] font-black text-text-secondary uppercase">Safety Protocol</p>
                        <p className="text-xs font-black text-white italic">VEHICLE AUTHORIZED</p>
                        <p className="text-[8px] font-bold text-text-secondary">GPS Pulse: Active</p>
                     </div>
                  </div>
               </div>

               <div className="pt-6 border-t border-glass-border">
                  <div className="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/10">
                     <p className="text-[10px] font-black text-white uppercase mb-2 italic">Proximity Awareness</p>
                     <p className="text-[9px] font-medium text-text-secondary leading-relaxed">System will automatically trigger an alert when the vehicle approaches within 1km of the stop matrix.</p>
                  </div>
               </div>
            </div>
         </div>
      </div>
    </div>
  );
}
