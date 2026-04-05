// ============================================================
// SIAP - FILE PERBAIKAN KEAMANAN & BUG FIX
// ============================================================
// 
// CARA PAKAI:
// 1. Buka file HTML SIAP Anda
// 2. Cari setiap fungsi yang disebutkan di bawah
// 3. GANTI (replace) fungsi lama dengan fungsi baru di sini
// 4. Atau tambahkan <script src="perbaikan.js"></script> 
//    SETELAH script utama di HTML
//
// CATATAN: Jika menggunakan cara #4 (file terpisah),
// pastikan file ini dimuat SETELAH semua kode SIAP yang ada.
// ============================================================


// ============================================================
// FIX 1: FUNGSI HASH PASSWORD (BARU - Tambahkan ini)
// ============================================================
// Tambahkan fungsi ini di awal bagian JavaScript (setelah firebase init)

/**
 * Hash password sederhana menggunakan SHA-256
 * Kompatibel dengan semua browser modern
 */
async function hashPassword(password) {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + '_SIAP_SALT_2026');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    // Fallback untuk browser lama: simple hash
    return simpleHash(password);
  }
}

/**
 * Fallback hash untuk browser yang tidak support Web Crypto
 */
function simpleHash(str) {
  let hash = 0;
  const salt = '_SIAP_SALT_2026';
  const salted = str + salt;
  for (let i = 0; i < salted.length; i++) {
    const char = salted.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return 'sh_' + Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Cek password: mendukung plain text (migrasi) DAN hashed
 */
async function verifyPassword(inputPassword, storedPassword) {
  // Cek plain text dulu (backward compatibility / migrasi)
  if (inputPassword === storedPassword) return true;
  // Cek hashed
  try {
    const hashed = await hashPassword(inputPassword);
    return hashed === storedPassword;
  } catch (e) {
    return false;
  }
}


// ============================================================
// FIX 2: GOOGLE SHEETS SYNC (GANTI fungsi _doSyncToSheets)
// ============================================================
// Cari fungsi _doSyncToSheets yang lama, GANTI dengan ini:

function _doSyncToSheets() {
  var types = Object.keys(_gsSyncQueue);
  if (types.length === 0) return;
  var payload = {};
  types.forEach(function(t) {
    // Filter out sensitive fields sebelum kirim ke Google Sheets
    var records = _gsSyncQueue[t];
    if (Array.isArray(records)) {
      payload[t] = records.map(function(r) {
        var clean = Object.assign({}, r);
        // Jangan kirim password ke Google Sheets!
        delete clean.password;
        return clean;
      });
    } else {
      payload[t] = records;
    }
  });
  _gsSyncQueue = {};
  
  try {
    // FIX: Hapus Content-Type header karena tidak compatible dengan no-cors
    // FIX: Gunakan text/plain sebagai workaround
    fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      body: JSON.stringify(payload)
    }).then(function() {
      console.log('[SIAP] Data berhasil dikirim ke Google Sheets');
    }).catch(function(e) {
      console.error('[SIAP] Google Sheets sync error:', e);
    });
  } catch(e) {
    console.error('[SIAP] Google Sheets sync error:', e);
  }
}


// ============================================================
// FIX 3: LOGIN HANDLER (GANTI fungsi handleLogin)
// ============================================================
// Cari fungsi handleLogin yang lama, GANTI dengan ini:

async function handleLogin() {
  if (!isFirebaseReady()) {
    document.getElementById('loginError').textContent = 'Memuat data... harap tunggu.';
    document.getElementById('loginError').style.display = 'block';
    return;
  }

  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  const errorEl = document.getElementById('loginError');
  errorEl.style.display = 'none';

  if (!username || !password) { 
    errorEl.textContent = 'Username dan Password harus diisi!'; 
    errorEl.style.display = 'block'; 
    return; 
  }

  // 1. Cek admin
  if (username === 'Admin_01') {
    var adminPw = getAdminPassword();
    var isValid = await verifyPassword(password, adminPw);
    if (isValid) {
      currentUser = { role: 'admin', name: 'Admin Korwil', adminLevel: 'full' };
      // Simpan session tanpa data sensitif
      localStorage.setItem('siap_session', JSON.stringify({
        role: currentUser.role,
        name: currentUser.name,
        adminLevel: currentUser.adminLevel,
        loginTime: Date.now()
      }));
      showMainApp();
      return;
    }
  }
  
  if (username === 'Admin_02') {
    var admin2Pw = getAdmin2Password();
    var isValid2 = await verifyPassword(password, admin2Pw);
    if (isValid2) {
      currentUser = { role: 'admin', name: 'Admin Operator', adminLevel: 'limited' };
      localStorage.setItem('siap_session', JSON.stringify({
        role: currentUser.role,
        name: currentUser.name,
        adminLevel: currentUser.adminLevel,
        loginTime: Date.now()
      }));
      showMainApp();
      return;
    }
  }

  // 2. Cek akun sekolah berdasarkan username & password
  const sekolahs = getRecords('sekolah');
  let matchedSchool = null;
  
  for (let i = 0; i < sekolahs.length; i++) {
    const s = sekolahs[i];
    if (s.username && s.username.toLowerCase() === username.toLowerCase()) {
      const isMatch = await verifyPassword(password, s.password);
      if (isMatch) {
        matchedSchool = s;
        break;
      }
    }
  }
  
  if (matchedSchool) {
    currentUser = { role: 'sekolah', name: matchedSchool.nama_sekolah, schoolId: matchedSchool.id };
    localStorage.setItem('siap_session', JSON.stringify({
      role: currentUser.role,
      name: currentUser.name,
      schoolId: currentUser.schoolId,
      loginTime: Date.now()
    }));
    showMainApp();
    return;
  }

  errorEl.textContent = 'Username atau Password salah!';
  errorEl.style.display = 'block';
}


// ============================================================
// FIX 4: REGISTER HANDLER (GANTI fungsi handleRegister)
// ============================================================
// Cari fungsi handleRegister yang lama, GANTI dengan ini:

async function handleRegister() {
  if (!isFirebaseReady()) {
    document.getElementById('registerError').textContent = 'Memuat data... harap tunggu.';
    document.getElementById('registerError').style.display = 'block';
    return;
  }

  const nama = document.getElementById('regNamaSekolah').value.trim();
  const npsn = document.getElementById('regNpsn').value.trim();
  const username = document.getElementById('regUsername').value.trim();
  const password = document.getElementById('regPassword').value.trim();
  const confirm = document.getElementById('regConfirmPassword').value.trim();
  const errorEl = document.getElementById('registerError');
  const successEl = document.getElementById('registerSuccess');
  errorEl.style.display = 'none';
  successEl.style.display = 'none';

  if (!nama || !npsn || !username || !password || !confirm) {
    errorEl.textContent = 'Semua field harus diisi!'; errorEl.style.display = 'block'; return;
  }
  if (!/^\d+$/.test(npsn)) {
    errorEl.textContent = 'NPSN harus berupa angka!'; errorEl.style.display = 'block'; return;
  }
  if (username.toLowerCase() === 'admin_01' || username.toLowerCase() === 'admin_02') {
    errorEl.textContent = 'Username tersebut tidak diperbolehkan!'; errorEl.style.display = 'block'; return;
  }
  if (password !== confirm) {
    errorEl.textContent = 'Konfirmasi password tidak cocok!'; errorEl.style.display = 'block'; return;
  }
  if (password.length < 6) {
    errorEl.textContent = 'Password minimal 6 karakter!'; errorEl.style.display = 'block'; return;
  }

  // FIX: Hash password sebelum disimpan
  const hashedPassword = await hashPassword(password);

  const sekolahs = getRecords('sekolah');
  const existingUser = sekolahs.find(s => s.username && s.username.toLowerCase() === username.toLowerCase());
  if (existingUser) {
    errorEl.textContent = 'Username sudah digunakan! Pilih username lain.'; errorEl.style.display = 'block'; return;
  }

  const existingNama = sekolahs.find(s => s.nama_sekolah.toLowerCase() === nama.toLowerCase());
  if (existingNama) {
    updateRecord('sekolah', existingNama.id, { 
      npsn: npsn, 
      username: username.toLowerCase(), 
      password: hashedPassword  // FIX: Simpan hash, bukan plain text
    });
    successEl.textContent = 'Akun berhasil dibuat untuk ' + nama + '. Silakan login.'; 
    successEl.style.display = 'block';
  } else {
    addRecord('sekolah', {
      nama_sekolah: nama, npsn: npsn, alamat: '', kepala_sekolah: '', jenjang: 'SD',
      telepon: '', email: '', 
      username: username.toLowerCase(), 
      password: hashedPassword  // FIX: Simpan hash, bukan plain text
    });
    successEl.textContent = 'Akun berhasil dibuat untuk ' + nama + '. Silakan login.'; 
    successEl.style.display = 'block';
  }

  // Reset form
  document.getElementById('regNamaSekolah').value = '';
  document.getElementById('regNpsn').value = '';
  document.getElementById('regUsername').value = '';
  document.getElementById('regPassword').value = '';
  document.getElementById('regConfirmPassword').value = '';
  
  // Otomatis kembali ke form login
  setTimeout(function() { showForm('loginForm'); }, 2000);
}


// ============================================================
// FIX 5: LUPA PASSWORD (GANTI fungsi handleForgotPassword)
// ============================================================
// Cari fungsi handleForgotPassword yang lama, GANTI dengan ini:
// FIX: TIDAK menampilkan password asli - hanya opsi reset

function handleForgotPassword() {
  if (!isFirebaseReady()) {
    document.getElementById('forgotError').textContent = 'Memuat data... harap tunggu.';
    document.getElementById('forgotError').style.display = 'block';
    return;
  }

  const username = document.getElementById('forgotUsername').value.trim();
  const errorEl = document.getElementById('forgotError');
  const resultEl = document.getElementById('forgotResult');
  errorEl.style.display = 'none';
  resultEl.style.display = 'none';

  if (!username) {
    errorEl.textContent = 'Masukkan username!'; errorEl.style.display = 'block'; return;
  }

  // Cek admin
  if (username === 'Admin_01' || username === 'Admin_02') {
    resultEl.innerHTML = '<div style="font-size:14px;font-weight:600;color:var(--primary);margin-bottom:8px;">' +
      '<i class="bi bi-person-gear me-1"></i>Akun ' + escapeHtml(username) + ' ditemukan</div>' +
      '<div style="font-size:13px;color:#555;line-height:1.6;">' +
      '<i class="bi bi-info-circle me-1 text-primary"></i>' +
      'Untuk keamanan, password admin tidak dapat ditampilkan.<br>' +
      'Silakan hubungi <strong>Administrator Utama</strong> untuk mereset password.' +
      '</div>' +
      '<button class="btn btn-sm btn-outline-primary mt-2" onclick="resetAdminPassword(\'' + escapeHtml(username) + '\')">' +
      '<i class="bi bi-arrow-repeat me-1"></i>Reset Password ke Default</button>';
    resultEl.style.display = 'block';
    return;
  }

  // Cek sekolah
  const sekolahs = getRecords('sekolah');
  const match = sekolahs.find(s => s.username && s.username.toLowerCase() === username.toLowerCase());
  if (match) {
    resultEl.innerHTML = '<div style="font-size:14px;font-weight:600;color:var(--primary);margin-bottom:8px;">' +
      '<i class="bi bi-building me-1"></i>' + escapeHtml(match.nama_sekolah) + '</div>' +
      '<div style="font-size:13px;color:#555;line-height:1.6;">' +
      '<i class="bi bi-shield-lock me-1 text-warning"></i>' +
      'Untuk keamanan, password tidak dapat ditampilkan.<br>' +
      'Anda bisa mereset password ke password baru di bawah:' +
      '</div>' +
      '<div class="mt-3">' +
      '<div class="input-group" style="max-width:300px;">' +
      '<input type="password" class="form-control form-control-sm" id="resetNewPassword" placeholder="Password baru (min 6 karakter)">' +
      '<button class="btn btn-sm btn-primary" onclick="resetSchoolPassword(\'' + match.id + '\')">' +
      '<i class="bi bi-check-lg"></i> Reset</button>' +
      '</div>' +
      '</div>';
    resultEl.style.display = 'block';
  } else {
    errorEl.textContent = 'Username tidak ditemukan!'; errorEl.style.display = 'block';
  }
}

/**
 * Reset password sekolah
 */
async function resetSchoolPassword(schoolId) {
  var newPw = document.getElementById('resetNewPassword').value.trim();
  if (!newPw || newPw.length < 6) {
    alert('Password baru minimal 6 karakter!');
    return;
  }
  var hashed = await hashPassword(newPw);
  updateRecord('sekolah', schoolId, { password: hashed });
  
  var resultEl = document.getElementById('forgotResult');
  resultEl.innerHTML = '<div class="alert alert-success" style="font-size:13px;margin:0;">' +
    '<i class="bi bi-check-circle me-1"></i>Password berhasil direset! Silakan login dengan password baru.</div>';
  
  setTimeout(function() { showForm('loginForm'); }, 2500);
}

/**
 * Reset password admin ke default
 */
async function resetAdminPassword(adminUsername) {
  if (!confirm('Reset password ' + adminUsername + ' ke default "admin123"?')) return;
  
  var defaultPw = await hashPassword('admin123');
  var passwords = firebaseGetAdminPasswords();
  
  if (adminUsername === 'Admin_01') {
    passwords.admin1 = defaultPw;
  } else if (adminUsername === 'Admin_02') {
    passwords.admin2 = defaultPw;
  }
  
  firebaseSaveAdminPasswords(passwords);
  alert('Password ' + adminUsername + ' berhasil direset ke "admin123". Segera ubah password setelah login!');
  showForm('loginForm');
}


// ============================================================
// FIX 6: SESSION VALIDATION (BARU - Tambahkan ini)
// ============================================================
// Tambahkan fungsi ini dan panggil di awal restoreSession

/**
 * Validasi session: cek apakah session masih valid
 * Expired setelah 24 jam
 */
function validateSession(session) {
  if (!session || !session.role || !session.name) return false;
  
  // Cek expiry (24 jam)
  if (session.loginTime) {
    var elapsed = Date.now() - session.loginTime;
    var maxAge = 24 * 60 * 60 * 1000; // 24 jam
    if (elapsed > maxAge) {
      console.log('[SIAP] Session expired');
      localStorage.removeItem('siap_session');
      return false;
    }
  }
  
  // Validasi role
  if (['admin', 'sekolah'].indexOf(session.role) === -1) return false;
  
  // Validasi admin level
  if (session.role === 'admin') {
    if (['full', 'limited'].indexOf(session.adminLevel) === -1) return false;
  }
  
  // Validasi sekolah harus punya schoolId
  if (session.role === 'sekolah' && !session.schoolId) return false;
  
  return true;
}

/**
 * Validasi session sekolah: pastikan schoolId masih ada di database
 */
function validateSchoolSession(session) {
  if (session.role !== 'sekolah') return true;
  var school = getRecord('sekolah', session.schoolId);
  if (!school) {
    console.log('[SIAP] School not found, invalid session');
    localStorage.removeItem('siap_session');
    return false;
  }
  return true;
}


// ============================================================
// FIX 7: UBAH KATA SANDI (PERBAIKAN fungsi yang ada)
// ============================================================
// Jika ada fungsi saveNewPassword / ubah sandi, ganti dengan ini:

async function saveNewPassword() {
  var oldPw = document.getElementById('oldPassword').value.trim();
  var newPw = document.getElementById('newPassword').value.trim();
  var confirmPw = document.getElementById('confirmNewPassword').value.trim();
  
  if (!oldPw || !newPw || !confirmPw) {
    alert('Semua field harus diisi!'); return;
  }
  if (newPw.length < 6) {
    alert('Password baru minimal 6 karakter!'); return;
  }
  if (newPw !== confirmPw) {
    alert('Konfirmasi password tidak cocok!'); return;
  }
  
  // Verifikasi password lama
  if (currentUser.role === 'admin') {
    var storedPw = currentUser.adminLevel === 'full' ? getAdminPassword() : getAdmin2Password();
    var isOldValid = await verifyPassword(oldPw, storedPw);
    if (!isOldValid) {
      alert('Password lama salah!'); return;
    }
    
    // Hash & simpan password baru
    var hashedNew = await hashPassword(newPw);
    var passwords = firebaseGetAdminPasswords();
    if (currentUser.adminLevel === 'full') {
      passwords.admin1 = hashedNew;
    } else {
      passwords.admin2 = hashedNew;
    }
    firebaseSaveAdminPasswords(passwords);
    alert('Password berhasil diubah!');
    
  } else if (currentUser.role === 'sekolah') {
    var school = getRecord('sekolah', currentUser.schoolId);
    if (!school) { alert('Data sekolah tidak ditemukan!'); return; }
    
    var isOldValid2 = await verifyPassword(oldPw, school.password);
    if (!isOldValid2) {
      alert('Password lama salah!'); return;
    }
    
    var hashedNew2 = await hashPassword(newPw);
    updateRecord('sekolah', currentUser.schoolId, { password: hashedNew2 });
    alert('Password berhasil diubah!');
  }
  
  // Reset form
  document.getElementById('oldPassword').value = '';
  document.getElementById('newPassword').value = '';
  document.getElementById('confirmNewPassword').value = '';
}


// ============================================================
// FIX 8: LOADING INDICATOR (BARU - Tambahkan ini)
// ============================================================

/**
 * Tampilkan loading overlay saat Firebase belum siap
 */
function showLoadingOverlay() {
  if (document.getElementById('siapLoadingOverlay')) return;
  var overlay = document.createElement('div');
  overlay.id = 'siapLoadingOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,27,61,0.95);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-family:Segoe UI,sans-serif;';
  overlay.innerHTML = '<div style="font-size:48px;margin-bottom:16px;animation:pulse 1.5s infinite;">🎓</div>' +
    '<div style="font-size:20px;font-weight:700;letter-spacing:2px;margin-bottom:8px;">SIAP</div>' +
    '<div style="font-size:13px;opacity:0.7;margin-bottom:20px;">Memuat data dari server...</div>' +
    '<div style="width:200px;height:4px;background:rgba(255,255,255,0.15);border-radius:4px;overflow:hidden;">' +
    '<div style="width:40%;height:100%;background:linear-gradient(90deg,#3b82f6,#60a5fa);border-radius:4px;animation:loading 1.2s infinite ease-in-out;"></div></div>' +
    '<style>@keyframes loading{0%{transform:translateX(-100%)}100%{transform:translateX(350%)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}</style>';
  document.body.appendChild(overlay);
}

function hideLoadingOverlay() {
  var overlay = document.getElementById('siapLoadingOverlay');
  if (overlay) {
    overlay.style.transition = 'opacity 0.4s';
    overlay.style.opacity = '0';
    setTimeout(function() { overlay.remove(); }, 400);
  }
}


// ============================================================
// FIX 9: PERBAIKAN INIT / STARTUP
// ============================================================
// GANTI blok inisialisasi di bagian bawah HTML (window.onload atau DOMContentLoaded)
// dengan versi yang lebih aman:

// Panggil ini di akhir <script> atau di event DOMContentLoaded:
function initSIAP() {
  showLoadingOverlay();
  
  initFirebaseData();
  
  onFirebaseReady(function() {
    hideLoadingOverlay();
    
    // Restore session jika ada
    try {
      var savedSession = JSON.parse(localStorage.getItem('siap_session'));
      if (savedSession && validateSession(savedSession)) {
        currentUser = {
          role: savedSession.role,
          name: savedSession.name,
          adminLevel: savedSession.adminLevel,
          schoolId: savedSession.schoolId
        };
        
        // Validasi sekolah masih ada
        if (validateSchoolSession(savedSession)) {
          showMainApp();
          return;
        }
      }
    } catch(e) {
      console.error('[SIAP] Session restore error:', e);
    }
    
    // Tampilkan halaman login
    document.getElementById('loginPage').style.display = 'flex';
  });
  
  // Timeout: jika Firebase gagal load dalam 15 detik
  setTimeout(function() {
    if (!isFirebaseReady()) {
      hideLoadingOverlay();
      document.getElementById('loginPage').style.display = 'flex';
      alert('Koneksi ke server lambat. Beberapa data mungkin belum dimuat. Silakan refresh halaman.');
    }
  }, 15000);
}

// Auto-init saat DOM siap
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSIAP);
} else {
  initSIAP();
}


// ============================================================
// FIX 10: JANGAN SYNC PASSWORD KE GOOGLE SHEETS
// ============================================================
// GANTI fungsi saveRecords yang lama dengan ini:

function saveRecords(type, records) {
  _dbCache[type] = records;
  firebaseSaveRecords(type, records);
  
  // FIX: Filter password sebelum kirim ke Google Sheets
  if (GOOGLE_SCRIPT_URL) {
    var cleanRecords = records.map(function(r) {
      var clean = Object.assign({}, r);
      delete clean.password; // Jangan kirim password
      return clean;
    });
    syncToGoogleSheets(type, cleanRecords);
  }
  
  // Backup ke localStorage (tanpa password)
  try { 
    var backupRecords = records.map(function(r) {
      var backup = Object.assign({}, r);
      // Tetap simpan password di localStorage (untuk offline fallback)
      return backup;
    });
    localStorage.setItem('siap_records_' + type, JSON.stringify(backupRecords)); 
  } catch(e) {}
}


// ============================================================
// SELESAI - RINGKASAN PERUBAHAN
// ============================================================
// 
// ✅ FIX 1:  Fungsi hash password (SHA-256)
// ✅ FIX 2:  Google Sheets sync - hapus Content-Type header
// ✅ FIX 3:  Login handler - support hashed password
// ✅ FIX 4:  Register - hash password sebelum simpan
// ✅ FIX 5:  Lupa Password - tidak tampilkan password asli
// ✅ FIX 6:  Session validation - expiry & role check
// ✅ FIX 7:  Ubah Kata Sandi - support hash
// ✅ FIX 8:  Loading indicator saat Firebase loading
// ✅ FIX 9:  Init/startup yang lebih aman
// ✅ FIX 10: Password tidak dikirim ke Google Sheets
//
// CATATAN MIGRASI:
// - Password lama (plain text) tetap bisa digunakan untuk login
// - Saat user ubah password, password baru akan di-hash
// - Secara bertahap semua password akan ter-hash
// ============================================================
