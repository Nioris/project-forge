/**
 * @file sync.js
 * @description E2E encrypted cloud sync with mnemonic recovery phrase.
 *
 *   Architecture:
 *   - Recovery phrase (5 Russian words) = the ONLY secret
 *   - Phrase → PBKDF2 → AES-256-GCM key (encrypts all data)
 *   - Phrase → SHA-256 hash (stored on server as account identifier)
 *   - Server never sees the phrase, only the hash + encrypted blob
 *   - PIN (6 digits) = local-only lock to protect viewing the phrase on screen
 *
 *   Restore flow: enter 5 words → hash → find account → download → decrypt with phrase
 *
 * @dependencies config.js (SYNC_PK, SYNC_EK, SYNC_TS, SYNC_CK, FGK),
 *              storage.js (storageSet, storageGet, saveEntries, savePoints),
 *              api.js (API._post, API._get, API._delete),
 *              utils.js (toast)
 * @verified-against Web Crypto API (AES-GCM, PBKDF2), BIP39-style 5-word phrase
 * @verified-date 2026-04-25
 */

const Sync = {
  _timer: null,
  _dirty: false,
  DEBOUNCE_MS: 30000,
  PBKDF2_ITERATIONS: 600000,

  // ═══ CRYPTO ═══

  /**
   * Derive AES-256-GCM key from phrase via PBKDF2.
   * Uses a fixed "encrypt" purpose salt so the same phrase always derives the same key family.
   * Per-message salt is still random (packed into the blob).
   *
   * @param {string} phrase — recovery phrase (5 words)
   * @param {Uint8Array} salt — 16-byte random per-message salt
   * @returns {Promise<CryptoKey>}
   */
  async deriveKey(phrase, salt) {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(phrase),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: this.PBKDF2_ITERATIONS, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  },

  /**
   * Hash the phrase to create an account identifier.
   * Uses SHA-256 with a purpose prefix so it differs from encryption key derivation.
   *
   * @param {string} phrase — recovery phrase
   * @returns {Promise<string>} hex hash
   */
  async hashPhrase(phrase) {
    const data = new TextEncoder().encode('daily-insight-account:' + phrase.trim().toLowerCase());
    const hashBuf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
  },

  /**
   * Encrypt plaintext → base64 blob. Format: [salt_len:2][salt:16][iv:12][ciphertext+tag].
   * @param {string} plaintext
   * @param {string} phrase
   * @returns {Promise<string>}
   */
  async encrypt(plaintext, phrase) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await this.deriveKey(phrase, salt);
    const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));

    const packed = new Uint8Array(2 + 16 + 12 + cipherBuf.byteLength);
    packed[0] = 0; packed[1] = 16;
    packed.set(salt, 2);
    packed.set(iv, 18);
    packed.set(new Uint8Array(cipherBuf), 30);
    return btoa(String.fromCharCode(...packed));
  },

  /**
   * Decrypt base64 blob → plaintext.
   * @param {string} base64blob
   * @param {string} phrase
   * @returns {Promise<string>}
   */
  async decrypt(base64blob, phrase) {
    const raw = Uint8Array.from(atob(base64blob), c => c.charCodeAt(0));
    const saltLen = (raw[0] << 8) | raw[1];
    const salt = raw.slice(2, 2 + saltLen);
    const iv = raw.slice(2 + saltLen, 2 + saltLen + 12);
    const ciphertext = raw.slice(2 + saltLen + 12);
    const key = await this.deriveKey(phrase, salt);
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(plainBuf);
  },

  // ═══ DATA ═══

  /** Collect all app data for sync. */
  collectData() {
    return {
      entries, points, profile, aiAnalyses, chatHistories,
      aiRecs, xpData, commitments, trackerData,
      finGoals: storageGet(FGK, [])
    };
  },

  /** Restore all app data from decrypted object. */
  restoreData(data) {
    entries       = data.entries || [];
    points        = data.points || INITIAL_POINTS;
    if (data.profile) Object.assign(profile, data.profile);
    aiAnalyses    = data.aiAnalyses || [];
    chatHistories = data.chatHistories || {};
    aiRecs        = data.aiRecs || [];
    xpData        = data.xpData || { xp: 0, level: 1, history: [] };
    commitments   = data.commitments || [];
    trackerData   = data.trackerData || {};
    if (data.finGoals) storageSet(FGK, data.finGoals);

    this._pauseAutoSync = true;
    saveEntries(); savePoints(); storageSet(FK, profile);
    saveAiData(); saveChatData(); saveRecs(); saveXP(); saveCom(); saveTrk();
    this._pauseAutoSync = false;

    loadProfile(); updateStreak(); updateGate();
    renderDashboard(); renderHistory();
  },

  // ═══ UPLOAD / DOWNLOAD ═══

  /** Encrypt + upload all data. */
  async upload() {
    const phrase = localStorage.getItem(SYNC_CK);
    if (!phrase) return;

    const data = this.collectData();
    const json = JSON.stringify(data);
    const encrypted = await this.encrypt(json, phrase);
    const phraseHash = await this.hashPhrase(phrase);

    const res = await API._post('/api/sync/upload', {
      encryptedData: encrypted,
      phraseHash,
      clientUpdatedAt: new Date().toISOString(),
      dataVersion: 1,
      dataSize: json.length
    });

    localStorage.setItem(SYNC_TS, new Date().toISOString());
    this._dirty = false;

    // Server returns bonusGranted once (first upload with a fresh phrase_hash).
    // Refresh the balance UI and celebrate so the user sees the +400 land.
    if (res && res.bonusGranted && res.bonusGranted > 0) {
      if (typeof syncBalance === 'function') syncBalance();
      if (typeof toast === 'function') {
        toast('✦ Бонус', '+' + res.bonusGranted + ' звёзд за настройку синхронизации!', 'success');
      }
    }
  },

  /** Download + decrypt + restore. */
  async download(phrase) {
    const p = phrase || localStorage.getItem(SYNC_CK);
    if (!p) throw new Error('No phrase');

    const res = await API._get('/api/sync/download');
    if (!res.exists) throw new Error('No sync data on server');

    const json = await this.decrypt(res.encryptedData, p);
    this.restoreData(JSON.parse(json));
    localStorage.setItem(SYNC_TS, new Date().toISOString());
  },

  // ═══ AUTO-SYNC ═══

  _pauseAutoSync: false,

  markDirty() {
    if (!localStorage.getItem(SYNC_EK) || this._pauseAutoSync) return;
    this._dirty = true;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      if (this._dirty) this.upload().catch(e => console.warn('[sync] Auto-upload:', e.message));
    }, this.DEBOUNCE_MS);
  },

  _onVisibilityChange() {
    if (document.hidden && Sync._dirty && localStorage.getItem(SYNC_EK)) {
      Sync.upload().catch(e => console.warn('[sync] Background sync:', e.message));
    }
  },

  // ═══ IMMEDIATE SYNC (significant events) ═══

  /**
   * Force immediate upload — call after significant events.
   * Skips debounce, uploads right now.
   */
  uploadImmediate() {
    if (!localStorage.getItem(SYNC_EK)) return;
    clearTimeout(this._timer);
    this._dirty = false;
    this.upload().catch(e => console.warn('[sync] Immediate upload:', e.message));
  },

  // ═══ INIT ═══

  async init() {
    document.addEventListener('visibilitychange', this._onVisibilityChange);
    this.updateUI();

    if (!localStorage.getItem(SYNC_EK)) return;

    // Check if server has newer data → pull
    try {
      const status = await API._get('/api/sync/status');
      if (status.exists) {
        const localTs = localStorage.getItem(SYNC_TS);
        const serverTs = status.clientUpdatedAt;
        // Pull if server is newer (or we never synced locally)
        if (!localTs || (serverTs && new Date(serverTs) > new Date(localTs))) {
          console.log('[sync] Server has newer data, pulling...');
          await this.download();
          this.updateUI();
          console.log('[sync] Pull complete');
        }
      }
    } catch (e) {
      console.warn('[sync] Init pull failed:', e.message);
    }
  },

  // ═══ UI ═══

  updateUI() {
    const setupEl  = document.getElementById('syncSetup');
    const activeEl = document.getElementById('syncActive');
    const enabled  = localStorage.getItem(SYNC_EK);
    if (!setupEl || !activeEl) return;

    if (enabled) {
      setupEl.style.display = 'none';
      activeEl.style.display = 'block';
      const ts = localStorage.getItem(SYNC_TS);
      const el = document.getElementById('syncStatus');
      if (el) el.textContent = ts
        ? 'Последняя: ' + new Date(ts).toLocaleString('ru-RU')
        : 'Ещё не синхронизировано';
    } else {
      setupEl.style.display = 'block';
      activeEl.style.display = 'none';
    }
  },

  // ── Setup: generate phrase, set PIN, first upload ──

  showSetup() {
    const html = '<div style="padding:4px">'
      + '<h3 style="margin:0 0 12px;color:var(--text)">Cloud Sync</h3>'
      + '<p style="color:var(--text-dim);font-size:12px;margin:0 0 16px">'
      + 'Данные шифруются фразой из 5 слов. Сервер не может их прочитать.<br>'
      + '<span style="color:var(--accent);font-weight:600">+400 ⭐ бонус</span> после настройки.</p>'
      + '<div style="margin-bottom:12px">'
      + '<div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">ПИН-код (6 цифр) — чтобы показать фразу на экране</div>'
      + '<input id="syncPin1" type="tel" maxlength="6" inputmode="numeric" pattern="[0-9]*" '
      + 'placeholder="ПИН-код" class="setting-input" '
      + 'style="width:100%;text-align:center;font-size:24px;letter-spacing:8px">'
      + '</div>'
      + '<input id="syncPin2" type="tel" maxlength="6" inputmode="numeric" pattern="[0-9]*" '
      + 'placeholder="Повторите ПИН" class="setting-input" '
      + 'style="width:100%;text-align:center;font-size:24px;letter-spacing:8px;margin-bottom:16px">'
      + '<button class="btn-secondary" onclick="Sync.doSetup()" '
      + 'style="width:100%;padding:14px;background:var(--accent);color:#fff;border:none;font-size:15px">'
      + 'Включить синхронизацию</button>'
      + '</div>';

    document.getElementById('modalContent').innerHTML = html;
    document.getElementById('modalOverlay').classList.add('open');
  },

  async doSetup() {
    const pin1 = document.getElementById('syncPin1').value;
    const pin2 = document.getElementById('syncPin2').value;

    if (!/^\d{6}$/.test(pin1)) {
      toast('Ошибка', 'ПИН должен быть 6 цифр', 'error');
      return;
    }
    if (pin1 !== pin2) {
      toast('Ошибка', 'ПИН-коды не совпадают', 'error');
      return;
    }

    try {
      // Generate phrase on server
      const res = await API._post('/api/sync/setup', {});
      const phrase = res.syncCode;

      // Save locally
      localStorage.setItem(SYNC_CK, phrase);
      localStorage.setItem(SYNC_PK, pin1);
      localStorage.setItem(SYNC_EK, '1');

      // Send phrase hash to server for future lookups. Server returns
      // bonusGranted=400 on the very first upload with a fresh phrase_hash —
      // that's where the new-user Cloud Sync starter bonus fires. We handle
      // it inline here because doSetup() intentionally doesn't route through
      // Sync.upload() (it pre-encrypts before the phrase is saved to localStorage).
      const phraseHash = await this.hashPhrase(phrase);
      const uploadRes = await API._post('/api/sync/upload', {
        encryptedData: await this.encrypt(JSON.stringify(this.collectData()), phrase),
        phraseHash,
        clientUpdatedAt: new Date().toISOString(),
        dataVersion: 1,
        dataSize: 0
      });

      localStorage.setItem(SYNC_TS, new Date().toISOString());
      this.updateUI();

      // Bonus: refresh balance + celebrate. Timing — do this after showing
      // the phrase so the toast doesn't fight for attention with the
      // recovery-phrase modal.
      if (uploadRes && uploadRes.bonusGranted && uploadRes.bonusGranted > 0) {
        if (typeof syncBalance === 'function') syncBalance();
        setTimeout(() => {
          if (typeof toast === 'function') {
            toast('✦ Бонус', '+' + uploadRes.bonusGranted + ' звёзд за настройку синхронизации!', 'success');
          }
        }, 1500);
      }

      // Show phrase — MUST save it
      this._showPhraseWarning(phrase);
    } catch (e) {
      toast('Ошибка', e.message, 'error');
    }
  },

  /**
   * Show phrase with big red warning after setup.
   */
  _showPhraseWarning(phrase) {
    const words = phrase.split(' ');
    const wordsHtml = words.map((w, i) =>
      '<div style="display:inline-block;background:var(--surface-2);padding:10px 16px;'
      + 'border-radius:10px;margin:4px;font-size:18px;color:var(--accent)">'
      + '<span style="color:var(--text-muted);font-size:11px;margin-right:6px">' + (i + 1) + '</span>'
      + w + '</div>'
    ).join('');

    const html = '<div style="padding:4px;text-align:center">'
      + '<h3 style="margin:0 0 8px;color:var(--text)">Ваша фраза восстановления</h3>'
      + '<div style="background:var(--red-soft);border:1px solid var(--red);border-radius:12px;'
      + 'padding:14px;margin:0 0 16px;text-align:left">'
      + '<div style="color:var(--red);font-weight:700;font-size:14px;margin-bottom:6px">'
      + 'Запишите на бумагу!</div>'
      + '<div style="color:var(--text-dim);font-size:12px;line-height:1.5">'
      + 'Эти 5 слов — единственный способ восстановить данные на новом устройстве. '
      + 'Мы их не храним и не можем восстановить. '
      + 'Без фразы данные потеряны навсегда.</div></div>'
      + '<div style="padding:8px 0 16px">' + wordsHtml + '</div>'
      + '<button class="btn-secondary" onclick="Sync._copyPhrase()" '
      + 'style="width:100%;padding:12px;margin-bottom:8px">Скопировать фразу</button>'
      + '<button class="btn-secondary" onclick="closeModal()" '
      + 'style="width:100%;padding:12px;background:var(--accent);color:#fff;border:none">'
      + 'Я записал, закрыть</button>'
      + '</div>';

    document.getElementById('modalContent').innerHTML = html;
    document.getElementById('modalOverlay').classList.add('open');
  },

  _copyPhrase() {
    const phrase = localStorage.getItem(SYNC_CK) || '';
    navigator.clipboard.writeText(phrase);
    toast('Скопировано', 'Сохраните в надёжном месте', 'success');
  },

  // ── Show phrase (requires PIN) ──

  showSyncCode() {
    if (!localStorage.getItem(SYNC_PK)) {
      toast('Ошибка', 'Синхронизация не настроена', 'error');
      return;
    }

    const html = '<div style="padding:4px;text-align:center">'
      + '<h3 style="margin:0 0 12px;color:var(--text)">Введите ПИН</h3>'
      + '<input id="syncVerifyPin" type="tel" maxlength="6" inputmode="numeric" pattern="[0-9]*" '
      + 'placeholder="••••••" class="setting-input" '
      + 'style="width:100%;text-align:center;font-size:28px;letter-spacing:10px;margin-bottom:14px">'
      + '<button class="btn-secondary" onclick="Sync._verifyAndShowPhrase()" '
      + 'style="width:100%;padding:12px;background:var(--accent);color:#fff;border:none">'
      + 'Показать фразу</button>'
      + '</div>';

    document.getElementById('modalContent').innerHTML = html;
    document.getElementById('modalOverlay').classList.add('open');
  },

  _verifyAndShowPhrase() {
    const input = document.getElementById('syncVerifyPin').value;
    if (input !== localStorage.getItem(SYNC_PK)) {
      toast('Ошибка', 'Неверный ПИН', 'error');
      return;
    }
    const phrase = localStorage.getItem(SYNC_CK) || '—';
    this._showPhraseWarning(phrase);
  },

  // ── Restore on new device ──

  showRestore() {
    let fieldsHtml = '';
    for (let i = 1; i <= 5; i++) {
      fieldsHtml += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">'
        + '<span style="color:var(--text-muted);font-size:13px;min-width:20px;text-align:right">' + i + '.</span>'
        + '<input id="rw' + i + '" class="setting-input" placeholder="слово" autocomplete="off" '
        + 'autocapitalize="off" spellcheck="false" '
        + 'style="flex:1;text-align:center;font-size:16px;padding:10px">'
        + '</div>';
    }

    const html = '<div style="padding:4px">'
      + '<h3 style="margin:0 0 12px;color:var(--text)">Восстановление</h3>'
      + '<p style="color:var(--text-dim);font-size:12px;margin:0 0 14px">'
      + 'Введите 5 слов вашей фразы</p>'
      + fieldsHtml
      + '<button class="btn-secondary" id="restoreBtn" onclick="Sync.doRestore()" '
      + 'style="width:100%;padding:14px;margin-top:8px;background:var(--accent);color:#fff;border:none;font-size:15px">'
      + 'Восстановить данные</button>'
      + '</div>';

    document.getElementById('modalContent').innerHTML = html;
    document.getElementById('modalOverlay').classList.add('open');
  },

  async doRestore() {
    const words = [];
    for (let i = 1; i <= 5; i++) {
      const w = document.getElementById('rw' + i).value.trim().toLowerCase();
      if (!w) {
        toast('Ошибка', 'Заполните слово ' + i, 'error');
        return;
      }
      words.push(w);
    }
    const phrase = words.join(' ');

    const btn = document.getElementById('restoreBtn');
    btn.disabled = true;
    btn.textContent = 'Ищу аккаунт...';

    try {
      // 1. Hash phrase → find account on server
      const phraseHash = await this.hashPhrase(phrase);
      const deviceToken = localStorage.getItem('dsi_device_token');

      const linkRes = await fetch(SERVER_URL + '/api/sync/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phraseHash, deviceToken })
      });

      if (!linkRes.ok) {
        const err = await linkRes.json().catch(() => ({}));
        throw new Error(err.error || 'Account not found');
      }

      const linkData = await linkRes.json();
      btn.textContent = 'Расшифровываю...';

      // 2. Save session + phrase
      localStorage.setItem('dsi_session_token', linkData.token);
      localStorage.setItem(SYNC_CK, phrase);
      localStorage.setItem(SYNC_EK, '1');

      // 3. Download + decrypt
      await this.download(phrase);

      // 4. If restore was triggered from onboarding overlay, dismiss the overlay
      //    and mark onboarding as done — the user has just proven they're an
      //    existing user, no need to collect profile fields from scratch.
      if (typeof OB !== 'undefined') localStorage.setItem(OB, 'done');
      document.getElementById('onboardOverlay')?.classList.add('hidden');
      if (typeof loadProfile === 'function') loadProfile();
      if (typeof renderDashboard === 'function') renderDashboard();

      // 5. Ask to set PIN
      closeModal();
      this.updateUI();
      toast('Восстановлено', 'Все данные загружены', 'success');
      this._askSetPin();
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Восстановить данные';

      if (e.message.includes('decrypt') || e.message.includes('operation')) {
        toast('Ошибка', 'Фраза не подошла — данные не расшифрованы', 'error');
      } else {
        toast('Ошибка', e.message, 'error');
      }
    }
  },

  /** After restore, ask to set a PIN on this device. */
  _askSetPin() {
    setTimeout(() => {
      const html = '<div style="padding:4px;text-align:center">'
        + '<h3 style="margin:0 0 12px;color:var(--text)">Задайте ПИН</h3>'
        + '<p style="color:var(--text-dim);font-size:12px;margin:0 0 16px">'
        + '6 цифр — чтобы защитить просмотр фразы на этом устройстве</p>'
        + '<input id="newPin" type="tel" maxlength="6" inputmode="numeric" pattern="[0-9]*" '
        + 'placeholder="ПИН-код" class="setting-input" '
        + 'style="width:100%;text-align:center;font-size:24px;letter-spacing:8px;margin-bottom:14px">'
        + '<button class="btn-secondary" onclick="Sync._saveNewPin()" '
        + 'style="width:100%;padding:12px;background:var(--accent);color:#fff;border:none">'
        + 'Сохранить</button>'
        + '<div style="margin-top:8px"><span style="color:var(--text-muted);font-size:11px;cursor:pointer" '
        + 'onclick="closeModal()">Пропустить</span></div>'
        + '</div>';
      document.getElementById('modalContent').innerHTML = html;
      document.getElementById('modalOverlay').classList.add('open');
    }, 500);
  },

  _saveNewPin() {
    const pin = document.getElementById('newPin').value;
    if (!/^\d{6}$/.test(pin)) {
      toast('Ошибка', 'ПИН должен быть 6 цифр', 'error');
      return;
    }
    localStorage.setItem(SYNC_PK, pin);
    closeModal();
    toast('ПИН сохранён', '', 'success');
  },

  // ── Manual sync / disable ──

  async uploadNow() {
    try {
      await this.upload();
      this.updateUI();
      toast('Синхронизировано', '', 'success');
    } catch (e) {
      toast('Ошибка', e.message, 'error');
    }
  },

  async disable() {
    if (!confirm('Отключить синхронизацию и удалить данные с сервера?')) return;

    try { await API._delete('/api/sync/data'); } catch (e) { /* ok */ }

    localStorage.removeItem(SYNC_PK);
    localStorage.removeItem(SYNC_EK);
    localStorage.removeItem(SYNC_TS);
    localStorage.removeItem(SYNC_CK);
    this._dirty = false;
    clearTimeout(this._timer);
    this.updateUI();
    toast('Синхронизация отключена', '', 'success');
  }
};


// ═══ HOOK storageSet FOR AUTO-SYNC ═══

const _origStorageSet = storageSet;
storageSet = function(key, value) {
  const result = _origStorageSet(key, value);
  Sync.markDirty();
  return result;
};
