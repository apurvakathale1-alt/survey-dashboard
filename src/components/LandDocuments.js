import React, { useEffect, useMemo, useState } from 'react';
import {
  database,
  getDownloadURL,
  onValue,
  push,
  ref,
  set,
  storage,
  storageRef,
  uploadBytes
} from '../firebase';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

function LandDocuments() {
  const [documents, setDocuments] = useState([]);
  const [farmers, setFarmers] = useState([]);
  const [query, setQuery] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [form, setForm] = useState({ ownerName: '', surveyNumber: '', village: '', notes: '' });
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsubscribeDocuments = onValue(ref(database, 'land_documents'), (snapshot) => {
      const data = snapshot.val();
      const documentList = data
        ? Object.entries(data).map(([id, document]) => ({ id, ...document }))
        : [];
      documentList.sort((first, second) => (second.uploadedAt || 0) - (first.uploadedAt || 0));
      setDocuments(documentList);
    });
    const unsubscribeFarmers = onValue(ref(database, 'farmers'), (snapshot) => {
      const data = snapshot.val();
      setFarmers(data ? Object.values(data) : []);
    });
    return () => {
      unsubscribeDocuments();
      unsubscribeFarmers();
    };
  }, []);

  const filteredDocuments = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return documents.filter((document) => [
      document.ownerName,
      document.surveyNumber,
      document.village,
      document.fileName
    ].filter(Boolean).join(' ').toLowerCase().includes(normalizedQuery));
  }, [documents, query]);

  const handleUpload = async (event) => {
    event.preventDefault();
    setError('');
    if (!form.ownerName.trim() || !form.surveyNumber.trim() || !form.village.trim()) {
      setError('Enter the owner name, survey number, and village.');
      return;
    }
    if (!selectedFile) {
      setError('Choose a 7/12 PDF or image to upload.');
      return;
    }
    if (!ALLOWED_TYPES.includes(selectedFile.type) || selectedFile.size > MAX_FILE_SIZE) {
      setError('Upload a PDF or image (JPG, PNG, WebP) up to 10 MB.');
      return;
    }

    setUploading(true);
    try {
      const documentRef = push(ref(database, 'land_documents'));
      const path = `land-documents/${documentRef.key}/${selectedFile.name}`;
      const fileRef = storageRef(storage, path);
      const uploadResult = await uploadBytes(fileRef, selectedFile, { contentType: selectedFile.type });
      const downloadUrl = await getDownloadURL(uploadResult.ref);
      await set(documentRef, {
        type: '7/12 Extract',
        ownerName: form.ownerName.trim(),
        surveyNumber: form.surveyNumber.trim(),
        village: form.village.trim(),
        notes: form.notes.trim(),
        fileName: selectedFile.name,
        contentType: selectedFile.type,
        fileSize: selectedFile.size,
        storagePath: path,
        downloadUrl,
        uploadedAt: Date.now()
      });
      setForm({ ownerName: '', surveyNumber: '', village: '', notes: '' });
      setSelectedFile(null);
      event.target.reset();
    } catch (uploadError) {
      setError(uploadError.message || 'The document could not be saved. Check Firebase Storage and Database rules.');
    } finally {
      setUploading(false);
    }
  };

  const updateField = (field) => (event) => setForm(current => ({ ...current, [field]: event.target.value }));

  return (
    <div className="page-container">
      <div className="top-bar">
        <div className="welcome">
          <h1>7/12 Land Documents</h1>
          <p>Keep official owner copies organized with the matching land parcel.</p>
        </div>
      </div>

      <div className="document-notice">
        Upload and manage copies issued by the relevant government office. This register does not generate or certify an official 7/12 extract.
      </div>

      <div className="document-layout">
        <form className="form-card document-form" onSubmit={handleUpload}>
          <h3>Add 7/12 copy</h3>
          <label>Owner name
            <input required value={form.ownerName} onChange={updateField('ownerName')} list="farmer-names" />
            <datalist id="farmer-names">
              {farmers.map((farmer, index) => <option key={`${farmer.name}-${index}`} value={farmer.name} />)}
            </datalist>
          </label>
          <label>Survey number
            <input required value={form.surveyNumber} onChange={updateField('surveyNumber')} />
          </label>
          <label>Village
            <input required value={form.village} onChange={updateField('village')} />
          </label>
          <label>Notes
            <textarea value={form.notes} onChange={updateField('notes')} rows="3" placeholder="Optional details" />
          </label>
          <label>Document file
            <input
              required
              type="file"
              accept=".pdf,image/jpeg,image/png,image/webp"
              onChange={event => setSelectedFile(event.target.files?.[0] || null)}
            />
          </label>
          <p className="field-hint">PDF, JPG, PNG, or WebP. Maximum 10 MB.</p>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={uploading}>
            {uploading ? 'Uploading…' : 'Save document'}
          </button>
        </form>

        <section className="list-card document-list">
          <div className="document-list-heading">
            <div>
              <h3>Saved documents</h3>
              <p>{documents.length} record{documents.length === 1 ? '' : 's'}</p>
            </div>
            <input
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search owner or survey no."
              aria-label="Search land documents"
            />
          </div>
          {filteredDocuments.length === 0 ? (
            <p className="empty-state">No matching 7/12 documents saved yet.</p>
          ) : (
            <div className="document-records">
              {filteredDocuments.map((document) => (
                <article className="document-record" key={document.id}>
                  <div className="document-record-main">
                    <div>
                      <h4>{document.ownerName}</h4>
                      <p>{document.surveyNumber} · {document.village}</p>
                    </div>
                    <span className="document-type">7/12</span>
                  </div>
                  <p className="document-filename">{document.fileName}</p>
                  {document.notes && <p className="document-notes">{document.notes}</p>}
                  <div className="document-record-footer">
                    <span>{document.uploadedAt ? new Date(document.uploadedAt).toLocaleDateString() : 'Date not recorded'}</span>
                    <a href={document.downloadUrl} target="_blank" rel="noreferrer">Open copy</a>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default LandDocuments;
