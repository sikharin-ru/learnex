/**
 * ============================================================================
 * LEARNEX API Client Service
 * จัดการการสื่อสารระหว่าง GitHub Pages (Frontend) และ Google Apps Script (Backend)
 * ใช้ Content-Type: text/plain;charset=utf-8 เพื่อหลีกเลี่ยง CORS Preflight
 * ============================================================================
 */

class LearnexAPIClient {
  constructor(config) {
    this.config = config;
  }

  isConfigured() {
    const url = String(this.config.GAS_WEB_APP_URL || '').trim();
    return url.startsWith('https://script.google.com/') && !url.includes('YOUR_DEPLOYMENT_ID_HERE');
  }

  getToken() {
    return localStorage.getItem(this.config.STORAGE_TOKEN_KEY) || '';
  }

  setSession(token, user) {
    if (token) {
      localStorage.setItem(this.config.STORAGE_TOKEN_KEY, token);
    }
    if (user) {
      localStorage.setItem(this.config.STORAGE_USER_KEY, JSON.stringify(user));
    }
  }

  clearSession() {
    localStorage.removeItem(this.config.STORAGE_TOKEN_KEY);
    localStorage.removeItem(this.config.STORAGE_USER_KEY);
  }

  getCachedUser() {
    try {
      const raw = localStorage.getItem(this.config.STORAGE_USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  async post(action, payload = {}) {
    if (!this.isConfigured()) {
      throw new Error('ยังไม่ได้ตั้งค่า GAS_WEB_APP_URL ในไฟล์ js/config.js');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    try {
      const response = await fetch(this.config.GAS_WEB_APP_URL, {
        method: 'POST',
        redirect: 'follow',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify({
          action: action,
          token: this.getToken(),
          payload: payload
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error('เซิร์ฟเวอร์ตอบกลับสถานะผิดปกติ (HTTP ' + response.status + ')');
      }

      const data = await response.json();
      if (!data.success && data.code === 'UNAUTHORIZED') {
        this.clearSession();
      }
      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('การเชื่อมต่อหมดเวลา (Timeout) กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่');
      }
      throw error;
    }
  }
}

window.LearnexAPI = new LearnexAPIClient(window.LEARNEX_CONFIG);