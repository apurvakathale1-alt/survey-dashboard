// ============================================
// API & WhatsApp Configuration
// ============================================

const API_BASE_URL = (process.env.REACT_APP_API_BASE_URL || 'https://smartflex-boundary-1.onrender.com').replace(/\/+$/, '');

// 🔥 Updated WhatsApp URL
const WHATSAPP_URL = process.env.REACT_APP_WHATSAPP_URL || 'https://smartflex-whatsapp-9458.twil.io/send-alert';

export { API_BASE_URL, WHATSAPP_URL };