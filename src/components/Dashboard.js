import React, { useState, useEffect } from 'react';
import { database, ref, onValue } from '../firebase';
import { API_BASE_URL, WHATSAPP_URL } from '../config';
import { getGpsPosition } from '../gps';
import SurveyMap from './SurveyMap';

function Dashboard({ onNewSurvey }) {
  const [sensorData, setSensorData] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [deviceStatus, setDeviceStatus] = useState(null);
  const [parcelData, setParcelData] = useState(null);
  const [pointsCount, setPointsCount] = useState(0);
  const [surveyResults, setSurveyResults] = useState(null);
  const [surveyId, setSurveyId] = useState('survey_001');

  // ============================================
  // 1. Latest GPS from the live Render backend
  // ============================================
  useEffect(() => {
    let isMounted = true;

    const loadTelemetry = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/telemetry`);
        if (!response.ok) return;

        const data = await response.json();
        const gps = data?.gps;
        const position = getGpsPosition(gps);
        if (!position) {
          if (isMounted) setSensorData(null);
          return;
        }

        if (isMounted) {
          setSensorData(position);
        }
      } catch (error) {
        console.warn('Telemetry fetch failed:', error);
      }
    };

    loadTelemetry();
    const interval = setInterval(loadTelemetry, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // ============================================
  // 2. Device Status
  // ============================================
  useEffect(() => {
    const deviceRef = ref(database, 'devices/esp32_001');
    onValue(deviceRef, (snapshot) => {
      const data = snapshot.val();
      console.log("📱 Device Status:", data);
      if (data) setDeviceStatus(data);
    });
  }, []);

  // ============================================
  // 3. Parcel Data
  // ============================================
  useEffect(() => {
    const parcelRef = ref(database, 'parcels/parcel_001');
    onValue(parcelRef, (snapshot) => {
      const data = snapshot.val();
      console.log("📦 Parcel Data:", data);
      if (data) setParcelData(data);
    });
  }, []);

  // ============================================
  // 4. Survey Results (Latest Completed Survey)
  // ============================================
  useEffect(() => {
    const surveyRef = ref(database, 'surveys');
    onValue(surveyRef, (snapshot) => {
      const data = snapshot.val();
      console.log("📊 Survey Data:", data);
      if (data) {
        const surveys = Object.entries(data).map(([id, survey]) => ({ id, ...survey }));
        const latestSurvey = surveys.sort((first, second) =>
          (second.started_at || 0) - (first.started_at || 0)
        )[0];
        setSurveyId(latestSurvey?.id || 'survey_001');
        setPointsCount(latestSurvey?.points_collected ?? 0);
        // Find latest completed survey
        const completed = surveys.filter(s => s.status === 'COMPLETED');
        if (completed.length > 0) {
          const latest = completed[completed.length - 1];
          setSurveyResults({
            points: latest.points_collected || 0,
            area: latest.area_m2 || '---',
            perimeter: latest.perimeter_m || '---',
            status: latest.status || '---'
          });
        }
      }
    });
  }, []);

  // ============================================
  // 5. Alerts — Only Latest 3
  // ============================================
  useEffect(() => {
    const alertRef = ref(database, 'alerts');
    onValue(alertRef, (snapshot) => {
      const data = snapshot.val();
      console.log("🚨 Alerts:", data);
      if (data) {
        const alertList = Object.entries(data).map(([id, alert]) => ({
          ...alert,
          id,
          node_id: alert.node_id || alert.nodeId || alert.sensor_id || alert.sensorId || 'N/A'
        }));
        const latestByNode = new Map();
        alertList.forEach((alert) => {
          latestByNode.set(alert.node_id, alert);
        });
        const latestAlerts = Array.from(latestByNode.values())
          .slice(-3)
          .reverse();
        setAlerts(latestAlerts);
      } else {
        setAlerts([]);
      }
    });
  }, []);

  // ============================================
  // 6. Send WhatsApp Alert (Manual — Marathi)
  // ============================================
  const sendWhatsAppAlert = async (nodeId, severity, message) => {
    const date = new Date().toLocaleString('mr-IN');
    const nodeName = nodeId === 'N1' ? 'सेन्सर १' : 
                     nodeId === 'N2' ? 'सेन्सर २' : 
                     nodeId || 'अज्ञात';

    let marathiMessage = '';

    if (severity === 'CRITICAL') {
      marathiMessage = `🚨 *गंभीर सूचना!*\n\n` +
                       `📌 *सीमारेषा मोठ्या प्रमाणात हलली आहे.*\n` +
                       `🆔 नोड: ${nodeName} (${nodeId})\n` +
                       `⚠️ तीव्रता: गंभीर\n` +
                       `📅 दिनांक: ${date}\n\n` +
                       `👉 कृपया त्वरित कारवाई करा.`;
    } else if (severity === 'WARNING') {
      marathiMessage = `⚠️ *सावधानता सूचना!*\n\n` +
                       `📌 *सीमारेषेत हालचाल आढळली आहे.*\n` +
                       `🆔 नोड: ${nodeName} (${nodeId})\n` +
                       `⚠️ तीव्रता: सावधान\n` +
                       `📅 दिनांक: ${date}\n\n` +
                       `👉 कृपया तपासणी करा.`;
    } else {
      marathiMessage = `ℹ️ *माहिती सूचना*\n\n` +
                       `🆔 नोड: ${nodeName} (${nodeId})\n` +
                       `✅ स्थिती: सामान्य\n` +
                       `📅 दिनांक: ${date}\n\n` +
                       `👉 सर्व काही व्यवस्थित आहे.`;
    }

    try {
      const response = await fetch(WHATSAPP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId, severity, message: marathiMessage })
      });

      if (response.ok) {
        alert('✅ WhatsApp संदेश यशस्वीरीत्या पाठवला!');
      } else {
        alert('❌ संदेश पाठवण्यात अयशस्वी');
      }
    } catch (error) {
      console.error('WhatsApp Error:', error);
      alert('❌ WhatsApp पाठवताना त्रुटी: ' + error.message);
    }
  };

  // ============================================
  // 7. Render
  // ============================================
  return (
    <div className="dashboard-container">
      {/* Top Bar */}
      <div className="top-bar">
        <div className="welcome">
          <h1>🌾 Land Survey Dashboard</h1>
          <p>Survey Number: SN-2026-001 | Village: Kasba Peth</p>
        </div>
        <div className="top-actions">
          <button className="btn btn-primary" onClick={onNewSurvey}>➕ New Survey</button>
          <button className="btn btn-outline">📥 Export</button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">📍</div>
          <div className="stat-info">
            <h3>{sensorData?.latitude || '---'}</h3>
            <p>Latitude</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📌</div>
          <div className="stat-info">
            <h3>{sensorData?.longitude || '---'}</h3>
            <p>Longitude</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🛰️</div>
          <div className="stat-info">
            <h3>{sensorData ? '✅ FIXED' : '⚠️ NO FIX'}</h3>
            <p>GPS Status</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📐</div>
          <div className="stat-info">
            <h3>{pointsCount}</h3>
            <p>Points Collected</p>
          </div>
        </div>
      </div>

      {/* Map Section */}
      <div className="map-section">
        <div className="section-header">
          <h2>🗺️ Digital Land Map</h2>
        </div>
        <div className="map-wrapper">
          <SurveyMap surveyId={surveyId} />
        </div>
      </div>

      {/* Results Grid */}
      <div className="results-grid">
        {/* Survey Results Card */}
        <div className="result-card">
          <h3>📊 Survey Results</h3>
          <div className="result-item">
            <span>Points Collected</span>
            <span className="value">{surveyResults?.points || pointsCount}</span>
          </div>
          <div className="result-item">
            <span>Area</span>
            <span className="value">{surveyResults?.area || parcelData?.area || '---'} m²</span>
          </div>
          <div className="result-item">
            <span>Perimeter</span>
            <span className="value">{surveyResults?.perimeter || '---'} m</span>
          </div>
          <div className="result-item">
            <span>Status</span>
            <span className="value">{surveyResults?.status || parcelData?.status || '---'}</span>
          </div>
          <div className="result-item">
            <span>Device</span>
            <span className="value">{deviceStatus?.online ? '🟢 Online' : '🔴 Offline'}</span>
          </div>
        </div>

        {/* Alerts Feed with Manual WhatsApp Button */}
        <div className="result-card comparison">
          <h3>🚨 Alerts Feed <span style={{ fontSize: '12px', color: '#888' }}>(Latest {alerts.length})</span></h3>
          
          {alerts.length === 0 ? (
            <p>✅ No alerts</p>
          ) : (
            alerts.map((alert, index) => (
              <div key={index} className="alert-item" style={{
                background: alert.severity === 'CRITICAL' ? '#f8d7da' : '#fff3cd',
                padding: '10px',
                margin: '5px 0',
                borderRadius: '5px',
                borderLeft: `4px solid ${alert.severity === 'CRITICAL' ? '#dc3545' : '#ffc107'}`
              }}>
                <strong>{alert.type || 'Alert'}</strong> - {alert.message}
                <br/>
                <small>Node: {alert.node_id || 'N/A'} | Severity: {alert.severity}</small>
                
                <button 
                  onClick={() => sendWhatsAppAlert(
                    alert.node_id || 'N/A', 
                    alert.severity, 
                    alert.message
                  )}
                  style={{
                    marginTop: '8px',
                    padding: '5px 15px',
                    background: '#25D366',
                    color: 'white',
                    border: 'none',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    display: 'block'
                  }}
                >
                  📱 Send WhatsApp
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;