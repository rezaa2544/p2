/* ═══════════════════════════════════════════════════════════════════
   tests/performance/helpers/auth-helper.js
   مدیریت احراز هویت، نشست‌های کاربری و تولید توکن‌های JWT برای k6
   ═══════════════════════════════════════════════════════════════════ */
import http from 'k6/http';
import { check } from 'k6';

// بارگذاری دیتابیس کاربران معتبر تست در صورت دسترسی
let LOADED_USERS = [];
try {
  LOADED_USERS = JSON.parse(open('../fixtures/test-users.json'));
} catch (e) {
  LOADED_USERS = [];
}

// کاربران پیش‌فرض از داده‌های ایزوله دمو
export const SEED_USERS = {
  manager: {
    id: 2,
    role: 'manager',
    phone: '09992630039',
    national_id: '9995270358',
    school_id: 1
  },
  manager2: {
    id: 244,
    role: 'manager',
    phone: '09994551912',
    national_id: '9998865018',
    school_id: 2
  },
  teacher: {
    id: 4,
    role: 'teacher',
    phone: '09994420533',
    national_id: '9997988744',
    school_id: 1
  },
  teacher2: {
    id: 5,
    role: 'teacher',
    phone: '09997776371',
    national_id: '9991726454',
    school_id: 1
  },
  student: {
    id: 16,
    role: 'student',
    phone: '09992336550',
    national_id: '9996312461',
    school_id: 1
  },
  parent: {
    id: 17,
    role: 'parent',
    phone: '09998544082',
    national_id: '9996901114',
    school_id: 1
  },
  superadmin: {
    id: 1,
    role: 'superadmin',
    phone: '09999838444',
    national_id: '9993235245',
    school_id: null
  }
};

export const ALL_TEST_USERS = LOADED_USERS.length > 0 ? LOADED_USERS : Object.values(SEED_USERS);

export function getBaseUrl() {
  if (__ENV.BASE_URL) {
    return __ENV.BASE_URL.replace(/\/+$/, '');
  }
  return 'http://127.0.0.1:3000';
}

export function extractCookie(response, cookieName = 'payesh_session') {
  if (!response || !response.headers) return null;
  
  if (response.cookies && response.cookies[cookieName] && response.cookies[cookieName].length > 0) {
    return `${cookieName}=${response.cookies[cookieName][0].value}`;
  }
  
  const setCookie = response.headers['Set-Cookie'] || response.headers['set-cookie'];
  if (!setCookie) return null;

  const match = setCookie.match(new RegExp(`${cookieName}=([^;]+)`));
  return match ? `${cookieName}=${match[1]}` : null;
}

export function loginUser(baseUrl, user) {
  const url = baseUrl || getBaseUrl();
  const phone = user.phone;
  const nationalId = user.national_id;

  // ۱. درخواست ارسال کد ورود
  const sendRes = http.post(
    `${url}/api/auth/send-code`,
    JSON.stringify({ phone: phone }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  let demoCode = '1234';
  try {
    const json = JSON.parse(sendRes.body);
    if (json.demo_code) demoCode = json.demo_code;
  } catch (e) {}

  // ۲. تکمیل فرآیند ورود با کد اعتبارسنجی
  const loginRes = http.post(
    `${url}/api/auth/login`,
    JSON.stringify({
      phone: phone,
      code: demoCode,
      national_id: nationalId
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  const cookie = extractCookie(loginRes);
  const ok = loginRes.status === 200 && !!cookie;

  return {
    ok: ok,
    status: loginRes.status,
    cookie: cookie,
    user: user,
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookie || ''
    }
  };
}

export function getAuthHeaders(cookie) {
  return {
    'Content-Type': 'application/json',
    'Cookie': cookie || ''
  };
}

export function setupAllSessions(baseUrl) {
  const url = baseUrl || getBaseUrl();
  return {
    manager: loginUser(url, SEED_USERS.manager),
    manager2: loginUser(url, SEED_USERS.manager2),
    teacher: loginUser(url, SEED_USERS.teacher),
    teacher2: loginUser(url, SEED_USERS.teacher2),
    student: loginUser(url, SEED_USERS.student),
    parent: loginUser(url, SEED_USERS.parent),
    superadmin: loginUser(url, SEED_USERS.superadmin)
  };
}
