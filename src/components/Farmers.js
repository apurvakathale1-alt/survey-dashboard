import React, { useState, useEffect } from 'react';
import { database, ref, onValue, push, set } from '../firebase';

function Farmers() {
  const [farmers, setFarmers] = useState([]);
  const [newFarmer, setNewFarmer] = useState({
    name: '',
    surveyNumber: '',
    village: '',
    taluka: '',
    district: '',
    mobile: '',
    landArea: '',
    status: 'Active'
  });

  // Read Farmers from Firebase
  useEffect(() => {
    const farmerRef = ref(database, 'farmers');
    onValue(farmerRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const farmerList = Object.values(data);
        setFarmers(farmerList);
      } else {
        setFarmers([]);
      }
    });
  }, []);

  // Add Farmer to Firebase
  const handleAddFarmer = () => {
    const farmerRef = ref(database, 'farmers');
    const newFarmerRef = push(farmerRef);
    
    set(newFarmerRef, {
      name: newFarmer.name,
      surveyNumber: newFarmer.surveyNumber,
      village: newFarmer.village,
      taluka: newFarmer.taluka,
      district: newFarmer.district,
      mobile: newFarmer.mobile,
      landArea: newFarmer.landArea,
      status: newFarmer.status || 'Active'
    })
    .then(() => {
      alert('✅ Farmer Added Successfully!');
      setNewFarmer({
        name: '',
        surveyNumber: '',
        village: '',
        taluka: '',
        district: '',
        mobile: '',
        landArea: '',
        status: 'Active'
      });
    })
    .catch((error) => {
      alert('❌ Error: ' + error.message);
    });
  };

  return (
    <div className="page-container">
      <h2>👥 Farmers</h2>
      
      {/* Add Farmer Form */}
      <div className="form-card">
        <h3>➕ Add New Farmer</h3>
        <input 
          type="text" 
          placeholder="Farmer Name" 
          value={newFarmer.name}
          onChange={(e) => setNewFarmer({...newFarmer, name: e.target.value})}
        />
        <input 
          type="text" 
          placeholder="Survey Number" 
          value={newFarmer.surveyNumber}
          onChange={(e) => setNewFarmer({...newFarmer, surveyNumber: e.target.value})}
        />
        <input 
          type="text" 
          placeholder="Village" 
          value={newFarmer.village}
          onChange={(e) => setNewFarmer({...newFarmer, village: e.target.value})}
        />
        <input 
          type="text" 
          placeholder="Taluka" 
          value={newFarmer.taluka}
          onChange={(e) => setNewFarmer({...newFarmer, taluka: e.target.value})}
        />
        <input 
          type="text" 
          placeholder="District" 
          value={newFarmer.district}
          onChange={(e) => setNewFarmer({...newFarmer, district: e.target.value})}
        />
        <input 
          type="text" 
          placeholder="Mobile Number" 
          value={newFarmer.mobile}
          onChange={(e) => setNewFarmer({...newFarmer, mobile: e.target.value})}
        />
        <input 
          type="text" 
          placeholder="Land Area (m²)" 
          value={newFarmer.landArea}
          onChange={(e) => setNewFarmer({...newFarmer, landArea: e.target.value})}
        />
        <button className="btn btn-primary" onClick={handleAddFarmer}>Add Farmer</button>
      </div>

      {/* Farmers List */}
      <div className="list-card">
        <h3>📋 Farmers List</h3>
        {farmers.length === 0 ? (
          <p>No farmers registered</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Survey No.</th>
                <th>Village</th>
                <th>Mobile</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {farmers.map((farmer, index) => (
                <tr key={index}>
                  <td>{farmer.name}</td>
                  <td>{farmer.surveyNumber}</td>
                  <td>{farmer.village}</td>
                  <td>{farmer.mobile}</td>
                  <td><span className="badge-success">{farmer.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default Farmers;