import React, { useState, useEffect } from 'react';
import { database, ref, onValue, push, set, update } from '../firebase';
import { API_BASE_URL } from '../config';
import { getGpsPosition } from '../gps';
import SurveyMap from './SurveyMap';

function NewSurvey() {
  const [surveyId, setSurveyId] = useState(null);
  const [status, setStatus] = useState('IDLE');
  const [points, setPoints] = useState([]);
  const [pointsCount, setPointsCount] = useState(0);
  const [surveyResults, setSurveyResults] = useState(null);
  const [gpsData, setGpsData] = useState({ latitude: '---', longitude: '---' });
  const [loading, setLoading] = useState(false);

  // ============================================
  // 1. Select the newest active survey
  // ============================================
  useEffect(() => {
    if (surveyId) return undefined;

    const surveysRef = ref(database, 'surveys');
    const unsubscribe = onValue(surveysRef, (snapshot) => {
      const data = snapshot.val();
      const activeSurvey = data
        ? Object.entries(data)
            .map(([id, survey]) => ({ id, ...survey }))
            .filter(survey => survey.status === 'ACTIVE')
            .sort((first, second) => (second.started_at || 0) - (first.started_at || 0))[0]
        : null;

      if (activeSurvey) {
        setSurveyId(activeSurvey.id);
        setStatus(activeSurvey.status);
      }
    });

    return unsubscribe;
  }, [surveyId]);

  // 2. Read the latest GPS telemetry from the live Render backend
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
          if (isMounted) setGpsData({ latitude: '---', longitude: '---' });
          return;
        }

        if (isMounted) {
          setGpsData(position);
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

  // 3. Read live status from the selected survey
  useEffect(() => {
    if (!surveyId) return undefined;

    const surveyRef = ref(database, `surveys/${surveyId}`);
    const unsubscribe = onValue(surveyRef, (snapshot) => {
      const data = snapshot.val();
      if (data?.status) setStatus(data.status);
    });

    return unsubscribe;
  }, [surveyId]);

  // ============================================
  // 4. Read Points
  // ============================================
  useEffect(() => {
    if (!surveyId) return;
    const pointsRef = ref(database, `boundaries/${surveyId}/current`);
    const unsubscribe = onValue(pointsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const pointList = Object.values(data);
        setPoints(pointList);
        setPointsCount(pointList.length);
      } else {
        setPoints([]);
        setPointsCount(0);
      }
    });

    return unsubscribe;
  }, [surveyId]);

  // ============================================
  // 3. START SURVEY
  // ============================================
  const startSurvey = async () => {
    if (status === 'ACTIVE') return alert('Survey already active!');
    setLoading(true);
    try {
      let backendSurvey = null;
      try {
        const res = await fetch(`${API_BASE_URL}/api/surveys/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ farmer_id: 'farmer_001', survey_number: 'SN-2026-002' })
        });
        if (res.ok) backendSurvey = await res.json();
      } catch (e) { /* ignore */ }

      if (backendSurvey?.survey_id) {
        const startedAt = Date.now();
        await set(ref(database, `surveys/${backendSurvey.survey_id}`), {
          survey_number: 'SN-2026-002',
          farmer_id: 'farmer_001',
          village: 'Kasba Peth',
          status: 'ACTIVE',
          started_at: startedAt,
          points_collected: 0,
          device_id: 'esp32_001'
        });
        setSurveyId(backendSurvey.survey_id);
        setStatus('ACTIVE');
        setPoints([]);
        setPointsCount(0);
        setSurveyResults(null);
        alert('✅ Survey Started (Backend + History)');
        setLoading(false);
        return;
      }

      // Fallback Firebase
      const newRef = push(ref(database, 'surveys'));
      await set(newRef, {
        survey_number: 'SN-2026-002',
        farmer_id: 'farmer_001',
        village: 'Kasba Peth',
        status: 'ACTIVE',
        started_at: Date.now(),
        points_collected: 0,
        device_id: 'esp32_001'
      });
      setSurveyId(newRef.key);
      setStatus('ACTIVE');
      setPoints([]);
      setPointsCount(0);
      setSurveyResults(null);
      alert('✅ Survey Started (Firebase)');
    } catch (error) {
      alert('❌ Error: ' + error.message);
    }
    setLoading(false);
  };

  // ============================================
  // 4. MARK POINT
  // ============================================
  const markPoint = async () => {
    if (status !== 'ACTIVE') return alert('Start survey first!');
    if (gpsData.latitude === '---') return alert('Waiting for GPS...');
    setLoading(true);
    try {
      let backendSaved = false;
      try {
        const res = await fetch(`${API_BASE_URL}/api/surveys/${surveyId}/points`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            latitude: parseFloat(gpsData.latitude),
            longitude: parseFloat(gpsData.longitude),
            node_id: 'N2'
          })
        });
        backendSaved = res.ok;
      } catch (e) { /* ignore */ }

      const savedPoint = {
        node_id: 'N2',
        latitude: parseFloat(gpsData.latitude),
        longitude: parseFloat(gpsData.longitude),
        timestamp: Date.now()
      };
      const pointRef = push(ref(database, `boundaries/${surveyId}/current`));
      await set(pointRef, savedPoint);
      const surveyRef = ref(database, `surveys/${surveyId}`);
      await update(surveyRef, { points_collected: pointsCount + 1 });
      alert(`✅ Point ${pointsCount + 1} Saved${backendSaved ? '' : ' (Firebase)'}`);
    } catch (error) {
      alert('❌ Error: ' + error.message);
    }
    setLoading(false);
  };

  // ============================================
  // 5. FINISH SURVEY — AREA CALCULATION
  // ============================================
  const finishSurvey = async () => {
    console.log("🔥 finishSurvey called!");
    console.log("📡 pointsCount:", pointsCount);

    if (pointsCount < 3) {
      alert('⚠️ Need at least 3 points!');
      return;
    }

    setLoading(true);
    try {
      const usePoints = points.filter(
        point => Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude))
      );
      if (usePoints.length < 3) {
        alert('⚠️ Need at least 3 valid points!');
        setLoading(false);
        return;
      }

      // Shoelace formula for area
      let area = 0;
      let perimeter = 0;

      for (let i = 0; i < usePoints.length; i++) {
        const j = (i + 1) % usePoints.length;
        const lat1 = usePoints[i].latitude || 0;
        const lng1 = usePoints[i].longitude || 0;
        const lat2 = usePoints[j].latitude || 0;
        const lng2 = usePoints[j].longitude || 0;
        area += (lng1 * lat2 - lng2 * lat1);
      }
      const latitudeScale = 111000;
      const longitudeScale = 111000 * Math.cos((usePoints[0].latitude * Math.PI) / 180);
      area = Math.abs(area) / 2 * latitudeScale * longitudeScale;

      // Perimeter calculation
      for (let i = 0; i < usePoints.length; i++) {
        const j = (i + 1) % usePoints.length;
        const lat1 = usePoints[i].latitude || 0;
        const lng1 = usePoints[i].longitude || 0;
        const lat2 = usePoints[j].latitude || 0;
        const lng2 = usePoints[j].longitude || 0;
        const dx = (lat2 - lat1) * latitudeScale;
        const dy = (lng2 - lng1) * longitudeScale;
        perimeter += Math.sqrt(dx * dx + dy * dy);
      }

      console.log("📡 Calculated Area:", area);
      console.log("📡 Calculated Perimeter:", perimeter);

      // Save to Firebase
      const surveyRef = ref(database, `surveys/${surveyId}`);
      await update(surveyRef, {
        status: 'COMPLETED',
        finished_at: Date.now(),
        points_collected: pointsCount,
        area_m2: area.toFixed(2),
        perimeter_m: perimeter.toFixed(2)
      });

      setSurveyResults({
        points_collected: pointsCount,
        area_m2: area.toFixed(2),
        perimeter_m: perimeter.toFixed(2)
      });
      setStatus('COMPLETED');
      alert('✅ Survey Completed! Area: ' + area.toFixed(2) + ' m²');
    } catch (error) {
      console.error("Finish Error:", error);
      alert('❌ Error: ' + error.message);
    }
    setLoading(false);
  };

  // ===========================================
  // 6. RENDER
  // ============================================
  return (
    <div className="dashboard-container">
      <div className="top-bar">
        <div className="welcome">
          <h1>📍 New Survey</h1>
          <p>Survey: SN-2026-002 | Status: <strong>{status}</strong> | GPS: <strong>{gpsData.latitude === '---' ? 'NO FIX' : 'FIXED'}</strong></p>
        </div>
        <div className="top-actions">
          <button className="btn btn-success" onClick={startSurvey} disabled={status === 'ACTIVE' || status === 'COMPLETED' || loading}>
            {loading ? '⏳...' : '▶ Start'}
          </button>
          <button className="btn btn-warning" onClick={markPoint} disabled={status !== 'ACTIVE' || loading || gpsData.latitude === '---'}>
            {loading ? '⏳...' : '📍 Mark'}
          </button>
          <button className="btn btn-danger" onClick={finishSurvey} disabled={status !== 'ACTIVE' || loading || pointsCount < 3}>
            {loading ? '⏳...' : '⏹ Finish'}
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card"><div className="stat-icon">📍</div><div className="stat-info"><h3>{gpsData.latitude}</h3><p>Latitude</p></div></div>
        <div className="stat-card"><div className="stat-icon">📌</div><div className="stat-info"><h3>{gpsData.longitude}</h3><p>Longitude</p></div></div>
        <div className="stat-card"><div className="stat-icon">📐</div><div className="stat-info"><h3>{pointsCount}</h3><p>Points</p></div></div>
        <div className="stat-card"><div className="stat-icon">📊</div><div className="stat-info"><h3>{status}</h3><p>Status</p></div></div>
      </div>

      <div className="map-section">
        <div className="section-header"><h2>🗺️ Digital Land Map</h2></div>
        <div className="map-wrapper"><SurveyMap surveyId={surveyId} points={points} /></div>
      </div>

      {surveyResults && (
        <div className="results-grid">
          <div className="result-card">
            <h3>📊 Survey Results</h3>
            <div className="result-item"><span>Points</span><span className="value">{surveyResults.points_collected}</span></div>
            <div className="result-item"><span>Area</span><span className="value">{surveyResults.area_m2} m²</span></div>
            <div className="result-item"><span>Perimeter</span><span className="value">{surveyResults.perimeter_m} m</span></div>
            <div className="result-item"><span>Status</span><span className="value">✅ COMPLETED</span></div>
          </div>
        </div>
      )}
    </div>
  );
}

export default NewSurvey;