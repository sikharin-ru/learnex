/**
 * ============================================================================
 * LEARNEX Configuration File
 * แก้ไขเฉพาะค่า GAS_WEB_APP_URL และ GOOGLE_CLIENT_ID ด้านล่างให้ตรงกับระบบของคุณ
 * ============================================================================
 */

window.LEARNEX_CONFIG = {
  // 1. วาง URL ของ Google Apps Script Web App (ลงท้ายด้วย /exec) ที่ Deploy แล้ว
  GAS_WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbzijvTpU7NCWSCcU8lpI-wDggr88RVqcJSb67rYrnaQWChzUNlneekrU8Amy0socpCS/exec',

  // 2. (ทางเลือก) วาง Google OAuth 2.0 Client ID จาก Google Cloud Console สำหรับปุ่ม Sign in with Google จริง
  // หากเว้นว่างไว้ ระบบจะแสดงปุ่มเข้าสู่ระบบโหมดสาธิต (Demo SSO) ที่เชื่อมต่อฐานข้อมูล Google Sheets จริงให้ใช้งานได้ทันที
  GOOGLE_CLIENT_ID: '',

  // 3. เปิด/ปิด แผงปุ่มเข้าสู่ระบบด่วนตามบทบาท (Student / Teacher / Admin)
  ENABLE_DEMO_LOGIN: true,

  // 4. รหัสจัดเก็บ Session ในเบราว์เซอร์
  STORAGE_TOKEN_KEY: 'learnex_session_token_v1',
  STORAGE_USER_KEY: 'learnex_session_user_v1'
};