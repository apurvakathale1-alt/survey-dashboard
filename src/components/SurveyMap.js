import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polygon, Polyline, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { database, ref, onValue } from '../firebase';
import { API_BASE_URL } from '../config';
import { getGpsPosition } from '../gps';

// ============================================
// Leaflet Marker Icon Fix
// ============================================
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const LIVE_TRACK_RADIUS_METERS = 500;
const IMU_VISUAL_SCALE_METERS_PER_MS2 = 80;
const MAX_IMU_VISUAL_OFFSET_METERS = 30;
const IMU_NOISE_THRESHOLD_MS2 = 0.02;

function distanceFromFieldMeters(position, fieldPoints) {
  if (fieldPoints.length === 0) return null;

  const fieldCenter = fieldPoints.reduce((center, point) => [
    center[0] + Number(point[0]) / fieldPoints.length,
    center[1] + Number(point[1]) / fieldPoints.length
  ], [0, 0]);
  const radians = value => value * Math.PI / 180;
  const latitudeDelta = radians(fieldCenter[0] - position[0]);
  const longitudeDelta = radians(fieldCenter[1] - position[1]);
  const haversine = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(position[0])) * Math.cos(radians(fieldCenter[0])) *
    Math.sin(longitudeDelta / 2) ** 2;

  return 6371000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

// ============================================
// SurveyMap Component
// ============================================
function MapCenterUpdater({ center, zoom }) {
  const map = useMap();

  useEffect(() => {
    map.setView(center, zoom);
  }, [center, map, zoom]);

  return null;
}

function SurveyMap({ surveyId = 'survey_001', points = [] }) {
  const [registeredPoints, setRegisteredPoints] = useState([]);
  const [currentPoints, setCurrentPoints] = useState([]);
  const [sensorTrail, setSensorTrail] = useState([]);
  const [imuMotion, setImuMotion] = useState(null);
  const [liveGps, setLiveGps] = useState(null);
  const [center, setCenter] = useState([18.7194, 73.6750]);
  const [mapZoom, setMapZoom] = useState(17);
  const [gpsFieldDistance, setGpsFieldDistance] = useState(null);
  const [mapView, setMapView] = useState('field');
  const [loading, setLoading] = useState(true);
  const registeredPointsRef = useRef([]);
  const currentPointsRef = useRef([]);
  const imuBaselineRef = useRef(null);
  const hasBoundaryCenterRef = useRef(false);

  // ============================================
  // 1. Read Registered Boundary (OLD - RED)
  // ============================================
  useEffect(() => {
    const regRef = ref(database, 'boundaries/survey_001/registered');
    onValue(regRef, (snapshot) => {
      const data = snapshot.val();
      console.log("🔴 Registered Boundary:", data);
      if (data) {
        const points = Object.values(data).map(node => [node.latitude, node.longitude]);
        registeredPointsRef.current = points;
        setRegisteredPoints(points);
        if (points.length > 0) {
          setCenter(points[0]);
          hasBoundaryCenterRef.current = true;
        }
      } else {
        registeredPointsRef.current = [];
        setRegisteredPoints([]);
      }
      setLoading(false);
    });
  }, []);

  // ============================================
  // 2. Read Current Boundary (NEW - BLUE) — ESP32 Path
  // ============================================
  useEffect(() => {
    const curRef = ref(database, `boundaries/${surveyId}/current`);
    onValue(curRef, (snapshot) => {
      const data = snapshot.val();
      console.log("🔵 Current Boundary Data:", data);
      if (data) {
        // ESP32 ने पाठवलेल्या Structure प्रमाणे
        const points = Object.values(data).map(node => [node.latitude, node.longitude]);
        currentPointsRef.current = points;
        setCurrentPoints(points);
        if (points.length > 0) {
          setCenter(points[0]);
          hasBoundaryCenterRef.current = true;
        }
      } else {
        currentPointsRef.current = [];
        setCurrentPoints([]);
      }
    });
  }, [surveyId]);

  useEffect(() => {
    let isMounted = true;

    const loadTelemetry = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/telemetry`);
        if (!response.ok) return;
        const data = await response.json();

        if (isMounted) {
          const nextImuMotion = {
            imu1: {
              accel_x: Number(data?.imu1?.accel_x) || 0,
              accel_y: Number(data?.imu1?.accel_y) || 0
            },
            imu2: {
              accel_x: Number(data?.imu2?.accel_x) || 0,
              accel_y: Number(data?.imu2?.accel_y) || 0
            }
          };
          if (data?.imu1 || data?.imu2) {
            if (!imuBaselineRef.current) imuBaselineRef.current = nextImuMotion;
            setImuMotion(nextImuMotion);
          }

          const gpsPosition = getGpsPosition(data?.gps);
          if (!gpsPosition) {
            setLiveGps(null);
            setGpsFieldDistance(null);
            return;
          }

          const { latitude, longitude } = gpsPosition;
          const position = [latitude, longitude];
          const fieldPoints = registeredPointsRef.current.length > 0
            ? registeredPointsRef.current
            : currentPointsRef.current;
          const distance = distanceFromFieldMeters(position, fieldPoints);
          setGpsFieldDistance(distance);
          setLiveGps(position);
          setSensorTrail(previousTrail => {
            const lastPosition = previousTrail[previousTrail.length - 1];
            if (lastPosition && lastPosition[0] === latitude && lastPosition[1] === longitude) {
              return previousTrail;
            }
            return [...previousTrail.slice(-499), position];
          });

          if (mapView === 'gps' || !hasBoundaryCenterRef.current) {
            setCenter(position);
          }
        }
      } catch (error) {
        console.warn('Telemetry fetch failed:', error);
      }
    };

    loadTelemetry();
    const interval = setInterval(loadTelemetry, 2000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [mapView]);

  const databasePoints = currentPoints.map(point => [point[0], point[1]]);
  const localPoints = points.map(point => [Number(point.latitude), Number(point.longitude)]);
  const visibleCurrentPoints = localPoints.length > 0
    ? localPoints
    : databasePoints;
  const hasDistinctPositions = (positions) => positions.length > 1 && positions.some(
    point => point[0] !== positions[0][0] || point[1] !== positions[0][1]
  );
  const imuDeltas = imuMotion && imuBaselineRef.current
    ? ['imu1', 'imu2'].map(sensor => ({
        x: imuMotion[sensor].accel_x - imuBaselineRef.current[sensor].accel_x,
        y: imuMotion[sensor].accel_y - imuBaselineRef.current[sensor].accel_y
      }))
    : [];
  const dominantImuDelta = imuDeltas.reduce((dominant, delta) =>
    Math.hypot(delta.x, delta.y) > Math.hypot(dominant.x, dominant.y) ? delta : dominant,
  { x: 0, y: 0 });
  const getImuOffsetMeters = (delta) => Math.abs(delta) < IMU_NOISE_THRESHOLD_MS2
    ? 0
    : Math.max(-MAX_IMU_VISUAL_OFFSET_METERS, Math.min(MAX_IMU_VISUAL_OFFSET_METERS, delta * IMU_VISUAL_SCALE_METERS_PER_MS2));
  const imuOffsetNorthMeters = getImuOffsetMeters(dominantImuDelta.y);
  const imuOffsetEastMeters = getImuOffsetMeters(dominantImuDelta.x);
  const imuOffsetMagnitudeMeters = Math.hypot(imuOffsetNorthMeters, imuOffsetEastMeters);
  const imuFieldPoints = registeredPoints.length > 1 ? registeredPoints : visibleCurrentPoints;
  const fieldLatitude = imuFieldPoints.length > 0
    ? imuFieldPoints.reduce((total, point) => total + Number(point[0]), 0) / imuFieldPoints.length
    : center[0];
  const imuLatitudeOffset = imuOffsetNorthMeters / 111320;
  const imuLongitudeOffset = imuOffsetEastMeters / (111320 * Math.cos((fieldLatitude * Math.PI) / 180));
  const imuBoundaryPoints = imuFieldPoints.map(point => [
    Number(point[0]) + imuLatitudeOffset,
    Number(point[1]) + imuLongitudeOffset
  ]);
  const showingLiveTrail = hasDistinctPositions(sensorTrail) && (
    mapView === 'gps' || gpsFieldDistance === null || gpsFieldDistance <= LIVE_TRACK_RADIUS_METERS
  );
  const showingImuEstimate = mapView === 'field' && !showingLiveTrail && imuOffsetMagnitudeMeters > 0;
  const blueBoundaryPoints = mapView === 'gps'
    ? hasDistinctPositions(sensorTrail) ? sensorTrail : visibleCurrentPoints.length > 1 ? visibleCurrentPoints : registeredPoints
    : showingLiveTrail
      ? sensorTrail
      : imuBoundaryPoints.length > 1
        ? imuBoundaryPoints
        : hasDistinctPositions(visibleCurrentPoints)
          ? visibleCurrentPoints
          : registeredPoints;

  // ============================================
  // 3. Render Map
  // ============================================
  return (
    <MapContainer 
      center={center} 
      zoom={17} 
      style={{ height: '100%', width: '100%', borderRadius: '10px' }}
    >
      {/* OpenStreetMap Tiles */}
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <MapCenterUpdater center={center} zoom={mapZoom} />

      <div style={{
        position: 'absolute',
        top: '10px',
        right: '10px',
        zIndex: 1000,
        display: 'flex',
        gap: '6px',
        padding: '5px',
        borderRadius: '6px',
        background: 'white',
        boxShadow: '0 1px 5px rgba(0,0,0,0.35)'
      }}>
        <button
          type="button"
          onClick={() => {
            setMapView('field');
            setMapZoom(17);
            const fieldCenter = registeredPoints[0] || currentPoints[0];
            if (fieldCenter) setCenter(fieldCenter);
          }}
          aria-pressed={mapView === 'field'}
          style={{ padding: '7px 9px', border: 0, borderRadius: '4px', background: mapView === 'field' ? '#e7f1e9' : 'white', cursor: 'pointer' }}
        >
          Registered field
        </button>
        <button
          type="button"
          onClick={() => {
            setMapView('gps');
            setMapZoom(19);
            if (liveGps) setCenter(liveGps);
          }}
          disabled={!liveGps}
          aria-pressed={mapView === 'gps'}
          style={{ padding: '7px 9px', border: 0, borderRadius: '4px', background: mapView === 'gps' ? '#e7f1e9' : 'white', cursor: liveGps ? 'pointer' : 'not-allowed', opacity: liveGps ? 1 : 0.55 }}
        >
          Live GPS
        </button>
      </div>

      {/* ============================================
          OLD BOUNDARY (REGISTERED - RED)
          ============================================ */}
      {registeredPoints.length > 0 && (
        <>
          {/* Red Markers for Old Points */}
          {registeredPoints.map((point, index) => (
            <Marker 
              key={`reg-${index}`} 
              position={point}
              icon={L.divIcon({
                className: 'custom-marker',
                html: `<div style="
                  background-color: red;
                  width: 12px;
                  height: 12px;
                  border-radius: 50%;
                  border: 2px solid white;
                  box-shadow: 0 0 10px rgba(255,0,0,0.5);
                "></div>`,
                iconSize: [12, 12],
                iconAnchor: [6, 6]
              })}
            >
              <Popup>
                <strong>🔴 Registered Point {index + 1}</strong><br/>
                Lat: {point[0].toFixed(6)}<br/>
                Lng: {point[1].toFixed(6)}
              </Popup>
            </Marker>
          ))}

          {/* Red Polygon for Old Boundary */}
          <Polygon 
            positions={registeredPoints} 
            pathOptions={{ 
              color: 'red', 
              fillColor: 'red', 
              fillOpacity: 0.1,
              weight: 3,
              dashArray: '5, 5'
            }}
          />
        </>
      )}

      {/* Start over the registered boundary; valid live GPS movement replaces this baseline. */}
      {blueBoundaryPoints.length > 1 && (
        <Polyline
          positions={blueBoundaryPoints}
          pathOptions={{
            color: '#1769d2',
            weight: 4,
            opacity: 0.95
          }}
        />
      )}

      {liveGps && (mapView === 'gps' || gpsFieldDistance === null || gpsFieldDistance <= LIVE_TRACK_RADIUS_METERS) && (
        <Marker
          position={liveGps}
          icon={L.divIcon({
            className: 'custom-marker',
            html: '<div style="width:12px;height:12px;border-radius:50%;background:#1769d2;border:2px solid white;box-shadow:0 0 8px rgba(23,105,210,0.6)"></div>',
            iconSize: [12, 12],
            iconAnchor: [6, 6]
          })}
        >
          <Popup>Live sensor GPS<br/>Lat: {liveGps[0].toFixed(6)}<br/>Lng: {liveGps[1].toFixed(6)}</Popup>
        </Marker>
      )}

      {/* ============================================
          NO DATA MESSAGE
          ============================================ */}
      {registeredPoints.length === 0 && visibleCurrentPoints.length === 0 && sensorTrail.length === 0 && !loading && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(255,255,255,0.9)',
          padding: '20px 30px',
          borderRadius: '10px',
          boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
          textAlign: 'center',
          zIndex: 1000
        }}>
          <h3>🗺️ No Boundary Data</h3>
          <p>Start a survey to see points on map.</p>
        </div>
      )}

      {/* ============================================
          LEGEND
          ============================================ */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        right: '20px',
        background: 'white',
        padding: '10px 15px',
        borderRadius: '8px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
        zIndex: 1000,
        fontSize: '12px'
      }}>
        {registeredPoints.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ display: 'inline-block', width: '20px', height: '3px', background: 'red' }}></span>
            <span>जुनी सीमारेषा (Registered)</span>
          </div>
        )}
        {blueBoundaryPoints.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ display: 'inline-block', width: '20px', height: '3px', background: '#1769d2' }}></span>
            <span>
              {showingLiveTrail
                ? 'Live sensor GPS track'
                : showingImuEstimate
                  ? `IMU movement estimate: ${imuOffsetMagnitudeMeters.toFixed(1)} m`
                  : 'Sensor boundary baseline'}
            </span>
          </div>
        )}
        {liveGps && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
            <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: '#1769d2' }}></span>
            <span>Current GPS fix</span>
          </div>
        )}
        {!liveGps && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', color: '#a4262c' }}>
            <span>GPS: No fix</span>
          </div>
        )}
        {gpsFieldDistance > LIVE_TRACK_RADIUS_METERS && (
          <div style={{ marginTop: '4px', color: '#a4262c' }}>
            GPS is {(gpsFieldDistance / 1000).toFixed(1)} km from this field
          </div>
        )}
        {registeredPoints.length === 0 && currentPoints.length === 0 && sensorTrail.length === 0 && (
          <span>⏳ Waiting for data...</span>
        )}
      </div>

    </MapContainer>
  );
}

export default SurveyMap;