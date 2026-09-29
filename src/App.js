import React, { useState } from 'react';
import Dashboard from './components/Dashboard';
import Farmers from './components/Farmers';
import NewSurvey from './components/NewSurvey';
import SurveyHistory from './components/SurveyHistory';
import './App.css';

function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');

  const renderPage = () => {
    switch(currentPage) {
      case 'dashboard': return <Dashboard onNewSurvey={() => setCurrentPage('newSurvey')} />;
      case 'farmers': return <Farmers />;
      case 'newSurvey': return <NewSurvey />;
      case 'history': return <SurveyHistory />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="app-container">
      <div className="sidebar">
        <div className="logo">
          <h2>🌾 Survey</h2>
          <p>Land Management System</p>
        </div>
        <nav className="nav-menu">
          <button className={`nav-item ${currentPage === 'dashboard' ? 'active' : ''}`} onClick={() => setCurrentPage('dashboard')}>📊 Dashboard</button>
          <button className={`nav-item ${currentPage === 'farmers' ? 'active' : ''}`} onClick={() => setCurrentPage('farmers')}>👥 Farmers</button>
          <button className={`nav-item ${currentPage === 'newSurvey' ? 'active' : ''}`} onClick={() => setCurrentPage('newSurvey')}>📍 New Survey</button>
          <button className={`nav-item ${currentPage === 'history' ? 'active' : ''}`} onClick={() => setCurrentPage('history')}>🕘 Survey History</button>
        </nav>
        <div className="user-profile">
          <div className="avatar">👤</div>
          <div>
            <p className="user-name">Survey Officer</p>
            <p className="user-role">Admin</p>
          </div>
        </div>
      </div>
      <div className="main-content">
        {renderPage()}
      </div>
    </div>
  );
}

export default App;