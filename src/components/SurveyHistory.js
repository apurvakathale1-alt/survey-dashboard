import React, { useEffect, useMemo, useState } from 'react';
import { database, onValue, ref } from '../firebase';

function SurveyHistory() {
  const [surveys, setSurveys] = useState([]);
  const [boundaries, setBoundaries] = useState({});
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [periodFilter, setPeriodFilter] = useState('ALL');
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    const unsubscribeSurveys = onValue(ref(database, 'surveys'), (snapshot) => {
      const data = snapshot.val();
      const surveyList = data
        ? Object.entries(data).map(([id, survey]) => ({ id, ...survey }))
        : [];
      surveyList.sort((first, second) =>
        (second.finished_at || second.started_at || 0) - (first.finished_at || first.started_at || 0)
      );
      setSurveys(surveyList);
    });
    const unsubscribeBoundaries = onValue(ref(database, 'boundaries'), (snapshot) => {
      setBoundaries(snapshot.val() || {});
    });

    return () => {
      unsubscribeSurveys();
      unsubscribeBoundaries();
    };
  }, []);

  const filteredSurveys = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const cutoff = periodFilter === '7D'
      ? Date.now() - 7 * 24 * 60 * 60 * 1000
      : periodFilter === '30D'
        ? Date.now() - 30 * 24 * 60 * 60 * 1000
        : 0;

    return surveys.filter((survey) => {
      const timestamp = Number(survey.finished_at || survey.started_at || 0);
      const searchableText = [survey.survey_number, survey.village, survey.farmer_id, survey.id]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return (statusFilter === 'ALL' || survey.status === statusFilter) &&
        timestamp >= cutoff && searchableText.includes(normalizedQuery);
    });
  }, [periodFilter, query, statusFilter, surveys]);

  const getPoints = (surveyId) => Object.values(boundaries[surveyId]?.current || {})
    .filter(point => Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude)))
    .sort((first, second) => (first.timestamp || 0) - (second.timestamp || 0));

  const exportCsv = () => {
    const rows = [
      ['Survey number', 'Farmer ID', 'Village', 'Status', 'Started', 'Finished', 'Points', 'Area (m2)', 'Perimeter (m)', 'GPS points'],
      ...filteredSurveys.map((survey) => {
        const surveyPoints = getPoints(survey.id);
        return [
          survey.survey_number || survey.id,
          survey.farmer_id || '',
          survey.village || '',
          survey.status || '',
          survey.started_at ? new Date(survey.started_at).toISOString() : '',
          survey.finished_at ? new Date(survey.finished_at).toISOString() : '',
          survey.points_collected ?? surveyPoints.length,
          survey.area_m2 || '',
          survey.perimeter_m || '',
          surveyPoints.map(point => `${point.latitude} ${point.longitude}`).join('; ')
        ];
      })
    ];
    const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'survey-history.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const formatDate = (timestamp) => timestamp ? new Date(timestamp).toLocaleString() : 'Not recorded';
  const completedCount = surveys.filter(survey => survey.status === 'COMPLETED').length;
  const completedArea = surveys.reduce((total, survey) =>
    survey.status === 'COMPLETED' ? total + (Number(survey.area_m2) || 0) : total, 0);
  const totalPointCount = surveys.reduce((total, survey) => total + getPoints(survey.id).length, 0);

  return (
    <div className="page-container">
      <div className="top-bar">
        <div className="welcome">
          <h1>Survey History</h1>
          <p>Saved survey records, measurements, and GPS points</p>
        </div>
        <button className="btn btn-outline" onClick={exportCsv} disabled={filteredSurveys.length === 0}>
          Export CSV
        </button>
      </div>

      <div className="stats-grid history-stats">
        <div className="stat-card"><div className="stat-icon">📚</div><div className="stat-info"><h3>{surveys.length}</h3><p>Total records</p></div></div>
        <div className="stat-card"><div className="stat-icon">✓</div><div className="stat-info"><h3>{completedCount}</h3><p>Completed surveys</p></div></div>
        <div className="stat-card"><div className="stat-icon">📐</div><div className="stat-info"><h3>{completedArea.toFixed(2)} m²</h3><p>Recorded total area</p></div></div>
        <div className="stat-card"><div className="stat-icon">📍</div><div className="stat-info"><h3>{totalPointCount}</h3><p>Saved GPS points</p></div></div>
      </div>

      <div className="history-toolbar">
        <label className="history-search">
          <span>Search</span>
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Survey number, village, or farmer ID"
          />
        </label>
        <label>
          <span>Status</span>
          <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
            <option value="ALL">All statuses</option>
            <option value="COMPLETED">Completed</option>
            <option value="ACTIVE">Active</option>
          </select>
        </label>
        <label>
          <span>Date range</span>
          <select value={periodFilter} onChange={event => setPeriodFilter(event.target.value)}>
            <option value="ALL">All time</option>
            <option value="30D">Last 30 days</option>
            <option value="7D">Last 7 days</option>
          </select>
        </label>
      </div>

      <div className="list-card history-list">
        <div className="history-count">Showing {filteredSurveys.length} of {surveys.length} records</div>
        {filteredSurveys.length === 0 ? (
          <p className="history-empty">No matching survey records found.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Survey</th>
                <th>Village</th>
                <th>Date</th>
                <th>Area</th>
                <th>Points</th>
                <th>Status</th>
                <th>Record</th>
              </tr>
            </thead>
            <tbody>
              {filteredSurveys.map((survey) => {
                const surveyPoints = getPoints(survey.id);
                return (
                  <React.Fragment key={survey.id}>
                    <tr>
                      <td>{survey.survey_number || survey.id}</td>
                      <td>{survey.village || '—'}</td>
                      <td>{formatDate(survey.finished_at || survey.started_at)}</td>
                      <td>{survey.area_m2 ? `${survey.area_m2} m²` : '—'}</td>
                      <td>{survey.points_collected ?? surveyPoints.length}</td>
                      <td><span className={survey.status === 'COMPLETED' ? 'badge-success' : 'badge-warning'}>{survey.status || 'UNKNOWN'}</span></td>
                      <td>
                        <button
                          type="button"
                          className="history-toggle"
                          onClick={() => setExpandedId(expandedId === survey.id ? null : survey.id)}
                          aria-expanded={expandedId === survey.id}
                        >
                          {expandedId === survey.id ? 'Hide' : 'Details'}
                        </button>
                      </td>
                    </tr>
                    {expandedId === survey.id && (
                      <tr className="history-detail-row">
                        <td colSpan="7">
                          <div className="history-metadata">
                            <span><strong>Farmer:</strong> {survey.farmer_id || 'Not linked'}</span>
                            <span><strong>Device:</strong> {survey.device_id || 'Not recorded'}</span>
                            <span><strong>Started:</strong> {formatDate(survey.started_at)}</span>
                            <span><strong>Finished:</strong> {formatDate(survey.finished_at)}</span>
                            <span><strong>Perimeter:</strong> {survey.perimeter_m ? `${survey.perimeter_m} m` : 'Not calculated'}</span>
                          </div>
                          {surveyPoints.length === 0 ? (
                            <p className="history-empty">No GPS points were saved for this record.</p>
                          ) : (
                            <table className="history-points-table">
                              <thead><tr><th>Point</th><th>Latitude</th><th>Longitude</th><th>Captured</th></tr></thead>
                              <tbody>
                                {surveyPoints.map((point, index) => (
                                  <tr key={`${point.timestamp || index}-${index}`}>
                                    <td>{index + 1}</td>
                                    <td>{Number(point.latitude).toFixed(6)}</td>
                                    <td>{Number(point.longitude).toFixed(6)}</td>
                                    <td>{formatDate(point.timestamp)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default SurveyHistory;
