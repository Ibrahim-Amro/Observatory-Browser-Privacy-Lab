// Explicit, browser-local permission experiments. No uploads, recordings, or remote services.
const MDN = 'https://developer.mozilla.org/en-US/docs/Web/API/';
const POINTER_REQUESTS = new WeakMap();
const DEFINITIONS = [
  ['location', 'Precise location', 'Location', 'Allow a live position watch supplied by your browser.', ['Latitude, longitude and accuracy', 'Altitude, heading and speed when supplied', 'Position updates while this page remains alive'], 'Accuracy depends on the device. A location grant does not expose your full location history.', 'Geolocation_API', 'geolocation'],
  ['camera', 'Camera', 'Media', 'Open a local camera preview and inspect the video track settings.', ['Live camera frames', 'Selected camera label and video dimensions', 'Frame rate and facing direction when exposed'], 'This demo previews locally and never records or uploads. Access to one camera does not grant arbitrary cameras.', 'MediaDevices/getUserMedia', 'camera'],
  ['microphone', 'Microphone', 'Media', 'Measure a local microphone sound level without recording audio.', ['Live audio samples available to the page', 'Sound level and selected microphone label', 'Audio track settings when exposed'], 'Only a level meter is shown. No speech recognition, recording or audio upload is performed.', 'MediaDevices/getUserMedia', 'microphone'],
  ['display', 'Share a screen or tab', 'Media', 'Choose the exact screen, window or tab to preview locally.', ['Pixels from the surface you explicitly select', 'Capture dimensions and surface type when exposed'], 'Sharing is different from detecting screenshots. You must choose a surface each time; this demo requests no system audio and never records.', 'MediaDevices/getDisplayMedia'],
  ['clipboard', 'Read the clipboard', 'Clipboard', 'Check clipboard formats and compare local fingerprints while the page is focused.', ['Available clipboard MIME types and byte sizes', 'A change since the last successful read', 'An image in the clipboard, if one is supplied'], 'Clipboard contents and hashes are never displayed or logged. An image is not proof of a screenshot. Background reads are not attempted; changes while away can only be compared after return.', 'Clipboard_API', 'clipboard-read'],
  ['notifications', 'Notifications', 'Notifications', 'Ask whether this site may display browser notifications.', ['Permission to create notifications', 'Browser-reported notification permission state'], 'Permission does not expose notifications from other apps. No push subscription, server or unsolicited notifications are created in this lab.', 'Notifications_API', 'notifications'],
  ['motion', 'Device motion', 'Sensors', 'Listen for accelerometer and rotation readings when available.', ['Acceleration with and without gravity', 'Rotation rates and sample interval'], 'Some browsers require an explicit motion prompt; others expose this without one. Sensor availability and background delivery vary.', 'DeviceMotionEvent'],
  ['orientation', 'Device orientation', 'Sensors', 'Listen for device tilt and orientation events when available.', ['Alpha, beta and gamma angles', 'Whether a reading is absolute'], 'Sensor hardware, browser policy and OS privacy controls can prevent delivery. These angles do not reveal other apps.', 'DeviceOrientationEvent'],
  ['bluetooth', 'Bluetooth device', 'Hardware', 'Open the browser chooser for a Bluetooth device.', ['Name and identifier of the device you select'], 'No scanning of all nearby devices or GATT connection is performed. Services require explicit scope and device support.', 'Web_Bluetooth_API'],
  ['usb', 'USB device', 'Hardware', 'Open the browser chooser for a USB device.', ['Selected product, manufacturer and USB IDs', 'Serial number when the browser supplies it'], 'Protected device classes may be excluded. No device is opened, configured or read by this demo.', 'WebUSB_API'],
  ['serial', 'Serial port', 'Hardware', 'Open the browser chooser for a serial port.', ['Vendor and product IDs of the selected port'], 'No serial connection is opened and no bytes are read or written. A chooser only exposes the port you select.', 'Web_Serial_API'],
  ['hid', 'Human interface device', 'Hardware', 'Open the browser chooser for a supported HID device.', ['Selected product name and hardware IDs'], 'Protected keyboard and mouse reports are restricted. No device connection or input report is opened here.', 'WebHID_API'],
  ['midi', 'MIDI instruments', 'Hardware', 'List MIDI ports and count incoming messages from input ports.', ['Input and output port names and manufacturers', 'Incoming message counts from selected browser-visible inputs'], 'System-exclusive access is disabled. This demo sends no MIDI messages and does not retain message contents.', 'Web_MIDI_API', 'midi'],
  ['files', 'Choose local files', 'Files', 'Choose files and inspect their metadata only.', ['Selected file name, MIME type and size', 'Last modified date'], 'The picker grants access only to your selection. This demo does not read file contents or request write access.', 'File_API'],
  ['directory', 'Choose a folder', 'Files', 'Choose a folder and list only its immediate children.', ['Selected folder name', 'Top-level entry names and whether each is a file or folder'], 'This demo does not recurse, open files or request write access. No arbitrary filesystem search is possible.', 'Window/showDirectoryPicker'],
  ['persistent-storage', 'Persistent site storage', 'Storage', 'Ask the browser to protect this site’s own stored data from routine eviction.', ['Whether persistence is granted for this origin', 'Approximate quota and usage for this origin'], 'This is not access to other sites’ storage or disk contents. Browsers may decide silently without showing a prompt.', 'StorageManager/persist', 'persistent-storage'],
  ['storage-access', 'Embedded storage access', 'Storage', 'A cross-site embedded page can request access to its own unpartitioned cookies.', ['Unpartitioned same-origin cookies when embedded and allowed'], 'This experiment is relevant only in a cross-site embed. It does not reveal another website’s cookies and is not applicable to this top-level local page.', 'Storage_Access_API'],
  ['fullscreen', 'Fullscreen', 'Interaction', 'Enter fullscreen through this explicit button action.', ['Fullscreen state and its transitions'], 'This is a user-gesture capability, not broad surveillance permission. Press Escape to exit.', 'Fullscreen_API'],
  ['pointer-lock', 'Pointer lock', 'Interaction', 'Lock the pointer to this page and measure relative movement.', ['Relative mouse movement while locked'], 'This is a user-gesture capability. Press Escape to release the cursor; movement outside this page is not exposed after release.', 'Pointer_Lock_API'],
  ['window-management', 'Multiple screens', 'Display', 'Ask for details of the displays connected to this device.', ['Display count, labels and geometry', 'Primary and current display', 'Changes in the display arrangement'], 'Basic screen size is available without this grant; a complete display arrangement is restricted. No windows are opened or moved.', 'Window/getScreenDetails', 'window-management'],
  ['idle', 'Device idle status', 'Activity', 'Ask for device-wide active/idle and locked/unlocked signals.', ['User active or idle status', 'Screen locked or unlocked status'], 'The minimum idle threshold is 60 seconds. This gives coarse state, not keystrokes, app names or a record of what you did elsewhere.', 'Idle_Detection_API', 'idle-detection'],
  ['local-fonts', 'Installed fonts', 'Identity', 'Ask for the font names your browser allows this site to enumerate.', ['Font family, full name and style', 'Available font face count'], 'A font inventory can contribute to fingerprinting. This demo does not read font binary data; privacy protections may restrict the result.', 'Local_Font_Access_API', 'local-fonts'],
  ['speaker', 'Audio output selection', 'Media', 'Choose an audio output device through the browser.', ['Selected speaker or headset label', 'An origin-scoped output device ID'], 'No audio is played. Selecting an output does not grant microphone access or reveal system audio.', 'MediaDevices/selectAudioOutput', 'speaker-selection'],
  ['wake-lock', 'Keep the screen awake', 'Interaction', 'Request a screen wake lock while this page is visible.', ['Whether this page holds a screen wake lock', 'Automatic release by the browser'], 'This changes screen sleep behavior; it does not unlock a device or reveal activity. The browser can release it when hidden or low on battery.', 'Screen_Wake_Lock_API'],
  ['contacts', 'Choose contacts', 'Personal data', 'Choose individual contact details to share through the browser’s picker.', ['Count and field types of contacts you select'], 'This demo never displays contact values. Selection is required each time; the entire address book is not exposed.', 'Contact_Picker_API'],
  ['accelerometer', 'Accelerometer sensor', 'Sensors', 'Try the browser’s generic accelerometer interface.', ['Acceleration along three axes', 'Sensor timestamp'], 'This may be policy-gated or unavailable even if the API exists. Some browsers grant sensor access without a visible prompt.', 'Accelerometer'],
  ['gyroscope', 'Gyroscope sensor', 'Sensors', 'Try the browser’s generic gyroscope interface.', ['Angular velocity along three axes', 'Sensor timestamp'], 'This may be policy-gated or unavailable even if the API exists. No app activity or screen contents are exposed.', 'Gyroscope'],
  ['magnetometer', 'Magnetometer sensor', 'Sensors', 'Try the browser’s generic magnetic-field sensor interface.', ['Magnetic field strength along three axes', 'Sensor timestamp'], 'This experimental sensor is frequently unavailable or disabled. Hardware and browser policy determine whether readings arrive.', 'Magnetometer'],
];

export function createPermissionLab({ setSignal = () => {}, addEvent = () => {}, onChange = () => {} } = {}) {
  const nav = window.navigator;
  const doc = window.document;
  const secure = window.isSecureContext;
  const inFrame = window.self !== window.top;
  const policyNames = { location: 'geolocation', camera: 'camera', microphone: 'microphone', display: 'display-capture', bluetooth: 'bluetooth', usb: 'usb', serial: 'serial', hid: 'hid', midi: 'midi', fullscreen: 'fullscreen', 'window-management': 'window-management', idle: 'idle-detection', 'local-fonts': 'local-fonts', speaker: 'speaker-selection', 'wake-lock': 'screen-wake-lock', accelerometer: 'accelerometer', gyroscope: 'gyroscope', magnetometer: 'magnetometer' };
  const policyBlocked = {};
  try {
    const policy = doc.permissionsPolicy || doc.featurePolicy;
    const recognized = policy?.features?.();
    if (recognized && policy.allowsFeature) {
      for (const [id, name] of Object.entries(policyNames)) {
        // Only query recognized descriptors: unknown names can misleadingly
        // return false in older browsers. No request or permission use here.
        if (recognized.includes(name) && policy.allowsFeature(name) === false) policyBlocked[id] = name;
      }
    }
  } catch { /* Browser policy introspection is optional. */ }
  const support = {
    location: !!nav.geolocation,
    camera: !!nav.mediaDevices?.getUserMedia,
    microphone: !!nav.mediaDevices?.getUserMedia,
    display: !!nav.mediaDevices?.getDisplayMedia,
    clipboard: !!(nav.clipboard?.read || nav.clipboard?.readText),
    notifications: 'Notification' in window,
    motion: 'DeviceMotionEvent' in window,
    orientation: 'DeviceOrientationEvent' in window,
    bluetooth: !!nav.bluetooth?.requestDevice,
    usb: !!nav.usb?.requestDevice,
    serial: !!nav.serial?.requestPort,
    hid: !!nav.hid?.requestDevice,
    midi: !!nav.requestMIDIAccess,
    files: true,
    directory: !!window.showDirectoryPicker,
    'persistent-storage': !!nav.storage?.persist,
    'storage-access': inFrame && !!doc.requestStorageAccess,
    fullscreen: !!doc.documentElement.requestFullscreen && doc.fullscreenEnabled !== false,
    'pointer-lock': !!doc.documentElement.requestPointerLock,
    'window-management': !!window.getScreenDetails,
    idle: !!window.IdleDetector?.requestPermission,
    'local-fonts': !!window.queryLocalFonts,
    speaker: !!nav.mediaDevices?.selectAudioOutput,
    'wake-lock': !!nav.wakeLock?.request,
    contacts: !inFrame && !!nav.contacts?.select,
    accelerometer: !!window.Accelerometer,
    gyroscope: !!window.Gyroscope,
    magnetometer: !!window.Magnetometer,
  };
  const items = DEFINITIONS.map(([id, title, category, description, opens, limits, path, permission]) => ({
    id, title, category, description, opens, limits, source: MDN + path, permission,
    supported: !!support[id] && !policyBlocked[id] && (secure || ['files', 'fullscreen', 'pointer-lock'].includes(id)),
  }));
  const byId = Object.fromEntries(items.map(item => [item.id, item]));
  const states = Object.fromEntries(items.map(item => [item.id, {
    status: item.supported ? 'available' : 'unsupported',
    detail: item.id === 'storage-access' && !inFrame ? 'Not applicable in a top-level page; only meaningful in a cross-site embed.' : policyBlocked[item.id] ? `Blocked by this document’s Permissions Policy (${policyBlocked[item.id]}). A switch cannot override the host’s policy.` : item.id === 'contacts' && inFrame ? 'The contact picker requires a top-level page, not an embedded frame.' : item.supported ? 'Not requested. Click to try this experiment.' : secure ? `This browser does not expose ${item.title.toLowerCase()} here. A permission grant cannot add a missing browser API.` : 'This capability needs a secure context, such as HTTPS or localhost.',
    supported: item.supported, active: false, priorPermission: 'unknown',
  }]));
  const generations = {};
  const cleanups = {};
  const previews = {};
  const subscribers = new Set();
  let disposed = false;
  let clipboardFingerprint = null;
  let clipboardReading = null;
  let clipboardPaused = false;
  let clipboardAwayAt = 0;
  let clipboardCheck = null;

  const notify = () => {
    if (disposed) return;
    // A presentation callback must not prevent a real browser request or its
    // cleanup. Both overview and lab controls receive changes immediately.
    try { onChange(); } catch { /* Other subscribers can still update. */ }
    for (const callback of [...subscribers]) {
      try { callback(); } catch { /* Isolate a failed view from the other view. */ }
    }
  };
  const update = (id, status, detail, active = false) => {
    if (states[id].status === status && states[id].detail === detail && states[id].active === active) return;
    Object.assign(states[id], { status, detail, active });
    notify();
  };
  const signal = (id, key, value, kind = 'observed', note = '') => { if (!disposed) setSignal('Permissions', `${byId[id].title} · ${key}`, value, { kind, note, source: byId[id].source }); };
  const log = (id, detail, kind = 'permission') => { if (!disposed) addEvent(byId[id].title, detail, kind); };
  const alive = ctx => !disposed && generations[ctx.id] === ctx.generation;
  const ensure = ctx => {
    if (!alive(ctx)) throw new DOMException('This experiment was stopped.', 'AbortError');
  };
  const cleanupFor = (ctx, cleanup) => {
    if (!alive(ctx)) { Promise.resolve(cleanup()).catch(() => {}); return false; }
    (cleanups[ctx.id] ||= []).push(cleanup);
    return true;
  };
  const listen = (ctx, target, type, handler, options) => {
    if (!alive(ctx)) return;
    const safeHandler = event => { if (alive(ctx)) handler(event); };
    target.addEventListener(type, safeHandler, options);
    cleanupFor(ctx, () => target.removeEventListener(type, safeHandler, options));
  };
  const interval = (ctx, callback, milliseconds) => {
    const timer = setInterval(() => { if (alive(ctx)) callback(); }, milliseconds);
    cleanupFor(ctx, () => clearInterval(timer));
  };
  const activate = (ctx, detail) => {
    ensure(ctx);
    update(ctx.id, 'active', detail, true);
    signal(ctx.id, 'sampling', 'Active', 'permission', 'Started only by your explicit action.');
    log(ctx.id, detail);
  };
  const granted = (ctx, detail) => {
    ensure(ctx);
    update(ctx.id, 'granted', detail, false);
    signal(ctx.id, 'result', detail, 'permission');
    log(ctx.id, detail);
  };
  const number = value => typeof value === 'number' && Number.isFinite(value) ? Number(value.toFixed(3)) : 'Not supplied';
  const drain = id => {
    const callbacks = cleanups[id] || [];
    delete cleanups[id];
    for (const cleanup of callbacks.reverse()) {
      try { Promise.resolve(cleanup()).catch(() => {}); } catch { /* A released resource is already stopped. */ }
    }
    delete previews[id];
  };

  function stop(id, reason = 'Stopped by you. Browser grants may remain; revoke them in site settings.') {
    if (!states[id]) return;
    const wasOpen = states[id].active || states[id].status === 'requesting';
    generations[id] = (generations[id] || 0) + 1;
    drain(id);
    if (id === 'clipboard') { clipboardCheck = null; clipboardPaused = true; clipboardFingerprint = null; }
    if (wasOpen || states[id].status === 'granted') {
      update(id, 'stopped', reason);
      signal(id, 'sampling', 'Stopped', 'permission', 'No new observations are being collected by this experiment. Previously shown observations may remain visible.');
      log(id, reason);
    }
  }

  function stopAll() {
    for (const item of items) stop(item.id);
  }

  async function watchPermission(ctx, name) {
    if (!nav.permissions?.query) return;
    try {
      const result = await nav.permissions.query({ name });
      if (!alive(ctx)) return;
      states[ctx.id].priorPermission = result.state;
      listen(ctx, result, 'change', () => {
        states[ctx.id].priorPermission = result.state;
        if (result.state === 'denied') {
          stop(ctx.id, 'Browser permission was revoked. Sampling stopped.');
          update(ctx.id, 'denied', 'Browser permission was revoked. Change site settings to try again.');
        } else notify();
      });
    } catch { /* Some browsers do not recognize every permission descriptor. */ }
  }

  async function enumerateMedia(ctx) {
    try {
      const devices = await nav.mediaDevices.enumerateDevices();
      if (!alive(ctx)) return;
      const visible = devices.map(device => ({ kind: device.kind, label: device.label || 'Label withheld' }));
      signal(ctx.id, 'exposed device labels', visible, 'observed', 'These labels are what the browser exposes after this media grant; not a complete hardware inventory.');
    } catch { /* The selected stream still works without enumeration. */ }
  }

  async function openMedia(ctx, constraints, display = false) {
    const stream = await (display ? nav.mediaDevices.getDisplayMedia(constraints) : nav.mediaDevices.getUserMedia(constraints));
    if (!cleanupFor(ctx, () => stream.getTracks().forEach(track => track.stop()))) return null;
    previews[ctx.id] = stream;
    for (const track of stream.getTracks()) {
      const settings = track.getSettings();
      signal(ctx.id, `${track.kind} track`, { label: track.label || 'Label withheld', width: settings.width, height: settings.height, frameRate: settings.frameRate, facingMode: settings.facingMode, sampleRate: settings.sampleRate, channelCount: settings.channelCount, displaySurface: settings.displaySurface }, 'observed', 'Track settings are browser supplied. No recording or upload.');
      listen(ctx, track, 'ended', () => stop(ctx.id, 'The browser or device ended this media stream.'));
    }
    return stream;
  }

  async function digest(buffer) {
    const hash = await window.crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async function clipboardRead(ctx, manual = false, returning = false) {
    if (!alive(ctx) || clipboardReading === ctx.generation) return;
    if (!doc.hasFocus() || doc.visibilityState !== 'visible') {
      if (manual) throw new DOMException('Focus this page before reading the clipboard.', 'NotAllowedError');
      return;
    }
    clipboardReading = ctx.generation;
    notify();
    try {
      if (!manual) {
        // Never cause a clipboard permission prompt from a timer or a focus event.
        let permission;
        try { permission = await nav.permissions?.query({ name: 'clipboard-read' }); } catch { return; }
        if (!permission || permission.state !== 'granted') {
          if (permission?.state === 'denied') {
            stop(ctx.id, 'Clipboard read permission is denied. Automatic checks stopped.');
            update(ctx.id, 'denied', 'Clipboard read permission is denied. Use browser site settings to change it.');
          }
          return;
        }
      }
      ensure(ctx);
      if (!doc.hasFocus() || doc.visibilityState !== 'visible') return;
      const formats = [];
      const fingerprints = [];
      let bytes = 0;
      if (nav.clipboard.read) {
        const entries = await nav.clipboard.read();
        ensure(ctx);
        for (const entry of entries) {
          for (const type of entry.types) {
            const blob = await entry.getType(type);
            ensure(ctx);
            formats.push(type);
            bytes += blob.size;
            // A bounded sample keeps very large clipboard data from blocking the page.
            const sample = await blob.slice(0, 2 * 1024 * 1024).arrayBuffer();
            fingerprints.push(`${type}:${blob.size}:${await digest(sample)}`);
            ensure(ctx);
          }
        }
      } else {
        const text = await nav.clipboard.readText();
        ensure(ctx);
        const encoded = new TextEncoder().encode(text);
        bytes = encoded.byteLength;
        formats.push('text/plain');
        fingerprints.push(`text/plain:${bytes}:${await digest(encoded.subarray(0, 2 * 1024 * 1024))}`);
      }
      ensure(ctx);
      const fingerprint = fingerprints.sort().join('|');
      const changed = clipboardFingerprint !== null && clipboardFingerprint !== fingerprint;
      const image = formats.some(type => type.startsWith('image/'));
      signal(ctx.id, 'formats', [...new Set(formats)].join(', ') || 'Empty clipboard', 'observed', 'No clipboard contents or local hashes are displayed.');
      signal(ctx.id, 'total bytes', bytes, 'observed', 'Byte lengths are metadata. Fingerprints compare at most the first 2 MiB of each format, so some changes can be missed.');
      signal(ctx.id, 'last successful check', new Date().toLocaleTimeString(), 'observed');
      if (changed) {
        const context = returning || clipboardAwayAt ? 'since the last successful read, including a period away from the page' : 'since the previous successful read';
        log(ctx.id, `Clipboard ${image ? 'image' : 'data'} changed ${context}. ${image ? 'A screenshot is one possible explanation; copying an image is another.' : 'The source and exact time of the change are unknown.'}`, image ? 'estimate' : 'observed');
        signal(ctx.id, 'comparison', `Changed ${context}`, 'observed', 'This detects a clipboard difference, not what application caused it.');
      } else if (clipboardFingerprint === null) {
        log(ctx.id, `Baseline read: ${formats.length ? [...new Set(formats)].join(', ') : 'empty clipboard'}. No contents logged.`);
        signal(ctx.id, 'comparison', 'Baseline established', 'observed');
      }
      clipboardFingerprint = fingerprint;
      clipboardAwayAt = 0;
      let auto = false;
      try { auto = (await nav.permissions?.query({ name: 'clipboard-read' }))?.state === 'granted'; } catch { /* Manual activation may be required. */ }
      ensure(ctx);
      clipboardPaused = !auto;
      update(ctx.id, 'active', auto ? 'Focused-only automatic checks enabled. Return to the page to compare changes while away.' : 'Manual read succeeded. This browser requires another button click for future reads.', true);
    } catch (error) {
      if (!alive(ctx)) return;
      clipboardPaused = true;
      if (manual) throw error;
      signal(ctx.id, 'automatic checks', 'Paused by browser; click to check again', 'unavailable', 'No background clipboard reads are attempted.');
      update(ctx.id, 'active', 'Automatic reads paused by the browser. Click this card’s button for a manual check.', true);
    } finally { if (clipboardReading === ctx.generation) { clipboardReading = null; notify(); } }
  }

  const runners = {
    location(ctx) {
      const watch = nav.geolocation.watchPosition(position => {
        if (!alive(ctx)) return;
        const c = position.coords;
        if (!states[ctx.id].active) activate(ctx, 'Location permission allowed; position updates are now live.');
        signal(ctx.id, 'position', { latitude: c.latitude, longitude: c.longitude, accuracyMeters: c.accuracy, altitudeMeters: c.altitude, altitudeAccuracyMeters: c.altitudeAccuracy, headingDegrees: c.heading, speedMetersPerSecond: c.speed }, 'observed', 'Precise location is visible only after this explicit request. Missing fields are not supplied by the device.');
        signal(ctx.id, 'timestamp', new Date(position.timestamp).toLocaleTimeString());
        update(ctx.id, 'active', `Watching position. Reported accuracy: ±${Math.round(c.accuracy)} m.`, true);
      }, error => {
        if (!alive(ctx)) return;
        const denied = error.code === 1;
        if (denied) { stop(ctx.id, 'Location permission denied or revoked.'); update(ctx.id, 'denied', error.message || 'Location permission denied.'); }
        else { signal(ctx.id, 'position status', error.code === 3 ? 'Position request timed out' : 'Position unavailable', 'unavailable'); update(ctx.id, 'active', 'Position watch is active, but the device has not supplied a location.', true); }
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
      cleanupFor(ctx, () => nav.geolocation.clearWatch(watch));
      ensure(ctx);
      if (states[ctx.id].status === 'requesting') update(ctx.id, 'requesting', 'Waiting for location permission and a first position. Switch off to cancel this watch.');
      void watchPermission(ctx, 'geolocation');
    },
    async camera(ctx) {
      const stream = await openMedia(ctx, { video: true, audio: false });
      if (!stream) return;
      activate(ctx, 'Camera is on. Local preview only; stop to release every camera track.');
      void enumerateMedia(ctx);
      void watchPermission(ctx, 'camera');
    },
    async microphone(ctx) {
      const stream = await openMedia(ctx, { audio: true, video: false });
      if (!stream) return;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        const audio = new AudioContextClass();
        cleanupFor(ctx, () => audio.close());
        const source = audio.createMediaStreamSource(stream);
        const analyser = audio.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        cleanupFor(ctx, () => source.disconnect());
        void audio.resume().catch(() => {
          if (alive(ctx)) signal(ctx.id, 'audio context', 'Browser suspended the level meter; microphone stream is still open', 'unavailable');
        });
        ensure(ctx);
        const samples = new Float32Array(analyser.fftSize);
        interval(ctx, () => {
          analyser.getFloatTimeDomainData(samples);
          const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
          signal(ctx.id, 'sound level', `${Math.round(Math.min(1, rms) * 100)}% RMS`, 'observed', 'A relative microphone level, not a calibrated decibel measurement. No speech or audio is retained.');
        }, 300);
      }
      activate(ctx, 'Microphone is on. Only a local sound-level meter is shown.');
      void enumerateMedia(ctx);
      void watchPermission(ctx, 'microphone');
    },
    async display(ctx) {
      const stream = await openMedia(ctx, { video: true, audio: false }, true);
      if (stream) activate(ctx, 'Sharing the surface you selected. Local preview only; stop sharing to release it.');
    },
    async clipboard(ctx) {
      clipboardPaused = false;
      clipboardAwayAt = 0;
      clipboardCheck = (manual = false, returning = false) => clipboardRead(ctx, manual, returning);
      cleanupFor(ctx, () => { clipboardCheck = null; clipboardPaused = true; clipboardFingerprint = null; });
      await clipboardRead(ctx, true);
      ensure(ctx);
      interval(ctx, () => { if (!clipboardPaused) void clipboardRead(ctx); }, 1800);
      listen(ctx, window, 'blur', () => { clipboardAwayAt = Date.now(); });
      listen(ctx, doc, 'visibilitychange', () => {
        if (doc.visibilityState === 'hidden') clipboardAwayAt = Date.now();
        else if (!clipboardPaused) void clipboardRead(ctx, false, true);
      });
      listen(ctx, window, 'focus', () => { if (!clipboardPaused) void clipboardRead(ctx, false, true); });
      void watchPermission(ctx, 'clipboard-read');
    },
    async notifications(ctx) {
      const permission = await window.Notification.requestPermission();
      ensure(ctx);
      signal(ctx.id, 'permission', permission, 'permission');
      if (permission === 'granted') granted(ctx, 'Notifications are allowed. No notification or push subscription was created.');
      else { update(ctx.id, permission === 'denied' ? 'denied' : 'available', permission === 'denied' ? 'Notification access denied by the browser.' : 'No permission granted; the prompt was dismissed.'); log(ctx.id, `Browser returned ${permission}.`); }
    },
    async motion(ctx) {
      if (typeof window.DeviceMotionEvent.requestPermission === 'function') {
        const result = await window.DeviceMotionEvent.requestPermission();
        ensure(ctx);
        if (result !== 'granted') throw new DOMException('Motion permission not granted.', 'NotAllowedError');
      }
      let last = 0;
      listen(ctx, window, 'devicemotion', event => {
        if (performance.now() - last < 200) return;
        last = performance.now();
        const xyz = value => value ? { x: number(value.x), y: number(value.y), z: number(value.z) } : 'Not supplied';
        signal(ctx.id, 'acceleration', xyz(event.acceleration));
        signal(ctx.id, 'including gravity', xyz(event.accelerationIncludingGravity));
        signal(ctx.id, 'rotation rate', event.rotationRate ? { alpha: number(event.rotationRate.alpha), beta: number(event.rotationRate.beta), gamma: number(event.rotationRate.gamma) } : 'Not supplied');
        signal(ctx.id, 'interval ms', number(event.interval));
      });
      activate(ctx, 'Listening for motion events. No reading means the device or browser has not supplied one.');
      signal(ctx.id, 'sensor status', 'Waiting for readings; hardware may be unavailable', 'unavailable');
    },
    async orientation(ctx) {
      if (typeof window.DeviceOrientationEvent.requestPermission === 'function') {
        const result = await window.DeviceOrientationEvent.requestPermission();
        ensure(ctx);
        if (result !== 'granted') throw new DOMException('Orientation permission not granted.', 'NotAllowedError');
      }
      let last = 0;
      listen(ctx, window, 'deviceorientation', event => {
        if (performance.now() - last < 200) return;
        last = performance.now();
        signal(ctx.id, 'angles', { alpha: number(event.alpha), beta: number(event.beta), gamma: number(event.gamma), absolute: event.absolute });
      });
      activate(ctx, 'Listening for orientation events. No reading means the device or browser has not supplied one.');
      signal(ctx.id, 'sensor status', 'Waiting for readings; hardware may be unavailable', 'unavailable');
    },
    async bluetooth(ctx) {
      const device = await nav.bluetooth.requestDevice({ acceptAllDevices: true });
      ensure(ctx);
      signal(ctx.id, 'selected device', { name: device.name || 'Name withheld', id: device.id }, 'observed', 'Only the selected device; no connection was opened.');
      granted(ctx, 'Selected device metadata is visible. No Bluetooth connection was opened.');
    },
    async usb(ctx) {
      const device = await nav.usb.requestDevice({ filters: [] });
      ensure(ctx);
      signal(ctx.id, 'selected device', { product: device.productName, manufacturer: device.manufacturerName, vendorId: device.vendorId, productId: device.productId, serialNumber: device.serialNumber || 'Not supplied' });
      granted(ctx, 'Selected USB metadata is visible. No device connection was opened.');
    },
    async serial(ctx) {
      const port = await nav.serial.requestPort();
      ensure(ctx);
      signal(ctx.id, 'selected port', port.getInfo(), 'observed', 'Port remains closed; no bytes read or written.');
      granted(ctx, 'Selected serial-port metadata is visible. The port remains closed.');
    },
    async hid(ctx) {
      const devices = await nav.hid.requestDevice({ filters: [] });
      ensure(ctx);
      signal(ctx.id, 'selected devices', devices.map(device => ({ product: device.productName, vendorId: device.vendorId, productId: device.productId })), 'observed', 'No HID connection or input report is opened.');
      granted(ctx, `${devices.length} HID device${devices.length === 1 ? '' : 's'} selected; no connection opened.`);
    },
    async midi(ctx) {
      const access = await nav.requestMIDIAccess({ sysex: false });
      ensure(ctx);
      let messages = 0;
      const attached = new Map();
      const refresh = () => {
        if (!alive(ctx)) return;
        signal(ctx.id, 'ports', { inputs: [...access.inputs.values()].map(port => ({ name: port.name, manufacturer: port.manufacturer, state: port.state })), outputs: [...access.outputs.values()].map(port => ({ name: port.name, manufacturer: port.manufacturer, state: port.state })) }, 'observed', 'System-exclusive access is disabled; outputs are never opened.');
        for (const port of access.inputs.values()) {
          if (attached.has(port.id)) continue;
          const handler = () => { if (alive(ctx)) signal(ctx.id, 'incoming message count', ++messages, 'observed', 'Message contents are not retained or displayed.'); };
          port.addEventListener('midimessage', handler);
          attached.set(port.id, { port, handler });
          // Assigning a message listener can implicitly open an input port in some browsers.
          cleanupFor(ctx, () => { port.removeEventListener('midimessage', handler); return port.close(); });
        }
      };
      refresh();
      listen(ctx, access, 'statechange', refresh);
      signal(ctx.id, 'system exclusive', 'Disabled', 'permission');
      activate(ctx, 'MIDI input message counts are live. No output messages or system-exclusive access.');
    },
    async files(ctx) {
      let files;
      if (window.showOpenFilePicker) {
        const handles = await window.showOpenFilePicker({ multiple: true });
        ensure(ctx);
        files = await Promise.all(handles.map(handle => handle.getFile()));
      } else {
        files = await new Promise(resolve => {
          const input = doc.createElement('input');
          input.type = 'file'; input.multiple = true; input.tabIndex = -1;
          input.setAttribute('aria-label', 'Choose local files for metadata only');
          input.style.cssText = 'position:fixed;left:-10000px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
          let settled = false;
          let departed = false;
          let returnTimer;
          const markDeparted = () => { departed = true; };
          const onVisibility = () => { if (doc.visibilityState === 'hidden') departed = true; };
          const onReturn = () => {
            if (!departed || settled) return;
            clearTimeout(returnTimer);
            // Old engines may omit input.cancel; allow change to arrive first.
            returnTimer = setTimeout(() => finish([...input.files]), 300);
          };
          const finish = value => {
            if (settled) return;
            settled = true;
            clearTimeout(returnTimer);
            window.removeEventListener('blur', markDeparted);
            window.removeEventListener('focus', onReturn);
            doc.removeEventListener('visibilitychange', onVisibility);
            input.remove(); resolve(value);
          };
          input.addEventListener('change', () => finish([...input.files]), { once: true });
          input.addEventListener('cancel', () => finish([]), { once: true });
          window.addEventListener('blur', markDeparted);
          window.addEventListener('focus', onReturn);
          doc.addEventListener('visibilitychange', onVisibility);
          cleanupFor(ctx, () => finish([]));
          doc.body.append(input);
          if (typeof input.showPicker === 'function') input.showPicker();
          else input.click();
        });
      }
      ensure(ctx);
      if (!files.length) { update(ctx.id, 'available', 'No files selected.'); return; }
      signal(ctx.id, 'selected files', files.map(file => ({ name: file.name, type: file.type || 'Type not supplied', bytes: file.size, lastModified: new Date(file.lastModified).toISOString() })), 'observed', 'Metadata only. No file contents were read.');
      granted(ctx, `${files.length} selected file${files.length === 1 ? '' : 's'}: metadata only, no content read.`);
    },
    async directory(ctx) {
      const handle = await window.showDirectoryPicker({ mode: 'read' });
      ensure(ctx);
      const entries = [];
      let truncated = false;
      for await (const [name, entry] of handle.entries()) {
        ensure(ctx);
        if (entries.length >= 200) { truncated = true; break; }
        entries.push({ name, kind: entry.kind });
      }
      signal(ctx.id, 'selected folder', handle.name);
      signal(ctx.id, 'top-level entries', entries, 'observed', 'No recursion, file reads or write access. Up to 200 immediate entries are listed.');
      granted(ctx, `Listed ${entries.length}${truncated ? '+' : ''} immediate entries only. No file contents read.`);
    },
    async 'persistent-storage'(ctx) {
      const result = await nav.storage.persist();
      ensure(ctx);
      signal(ctx.id, 'persistent', result, 'permission');
      if (nav.storage.estimate) {
        const estimate = await nav.storage.estimate();
        ensure(ctx);
        signal(ctx.id, 'origin storage estimate', { usageBytes: estimate.usage, quotaBytes: estimate.quota }, 'estimate', 'An approximate allowance for this site; not disk size or other sites’ data.');
      }
      if (result) granted(ctx, 'Persistent storage granted for this origin. No user data was stored by this experiment.');
      else { update(ctx.id, 'denied', 'The browser did not grant persistence. It may decide without a prompt.'); log(ctx.id, 'Persistent storage was not granted.'); }
    },
    async 'storage-access'(ctx) {
      await doc.requestStorageAccess();
      ensure(ctx);
      granted(ctx, 'Storage access request completed for this embedded origin. No cookies were read.');
    },
    async fullscreen(ctx) {
      listen(ctx, doc, 'fullscreenchange', () => {
        if (!doc.fullscreenElement) stop(ctx.id, 'Fullscreen exited.');
        else signal(ctx.id, 'fullscreen', true, 'observed');
      });
      cleanupFor(ctx, () => { if (doc.fullscreenElement) return doc.exitFullscreen(); });
      await doc.documentElement.requestFullscreen();
      if (!alive(ctx)) { if (doc.fullscreenElement) await doc.exitFullscreen(); return; }
      signal(ctx.id, 'fullscreen', true, 'observed');
      activate(ctx, 'Fullscreen is active. Press Escape to exit.');
    },
    async 'pointer-lock'(ctx) {
      let dx = 0; let dy = 0; let last = 0;
      listen(ctx, doc, 'pointerlockchange', () => {
        if (doc.pointerLockElement === doc.documentElement) {
          if (!states[ctx.id].active) activate(ctx, 'Pointer is locked. Press Escape to release it.');
        } else stop(ctx.id, 'Pointer lock released.');
      });
      listen(ctx, doc, 'pointerlockerror', () => { stop(ctx.id, 'Pointer lock request failed.'); update(ctx.id, 'error', 'Browser rejected pointer lock. Click again to retry.'); });
      listen(ctx, doc, 'mousemove', event => {
        if (doc.pointerLockElement !== doc.documentElement) return;
        dx += event.movementX; dy += event.movementY;
        if (performance.now() - last < 150) return;
        last = performance.now();
        signal(ctx.id, 'relative movement total', { x: dx, y: dy });
      });
      cleanupFor(ctx, () => { if (doc.pointerLockElement) doc.exitPointerLock(); });
      // Older engines return void rather than a promise. A short-lived guard also
      // releases a late lock if Stop was clicked while the request was pending.
      let finishPending;
      const pending = new Promise(resolve => { finishPending = resolve; });
      let timer;
      POINTER_REQUESTS.set(doc, ctx);
      const settle = () => {
        clearTimeout(timer);
        doc.removeEventListener('pointerlockchange', guard);
        doc.removeEventListener('pointerlockerror', settle);
        if (POINTER_REQUESTS.get(doc) === ctx) POINTER_REQUESTS.delete(doc);
        finishPending();
      };
      const guard = () => { if (!alive(ctx) && POINTER_REQUESTS.get(doc) === ctx && doc.pointerLockElement) doc.exitPointerLock(); settle(); };
      doc.addEventListener('pointerlockchange', guard);
      doc.addEventListener('pointerlockerror', settle);
      timer = setTimeout(settle, 15000);
      try {
        const result = doc.documentElement.requestPointerLock();
        if (result?.then) {
          await result;
          if (!alive(ctx) && POINTER_REQUESTS.get(doc) === ctx && doc.pointerLockElement) doc.exitPointerLock();
          settle();
        }
        else await pending;
      } catch (error) { settle(); throw error; }
      if (!alive(ctx)) return;
      if (doc.pointerLockElement) activate(ctx, 'Pointer is locked. Press Escape to release it.');
      else if (states[ctx.id].status === 'requesting') {
        drain(ctx.id);
        update(ctx.id, 'error', 'The browser did not enter pointer lock. Click again to retry, and use a supported top-level browser window.');
        signal(ctx.id, 'request result', 'Pointer lock not entered', 'unavailable');
      }
    },
    async 'window-management'(ctx) {
      const details = await window.getScreenDetails();
      ensure(ctx);
      const refresh = () => {
        signal(ctx.id, 'screens', details.screens.map(screen => ({ label: screen.label || 'Label withheld', width: screen.width, height: screen.height, left: screen.left, top: screen.top, availableWidth: screen.availWidth, availableHeight: screen.availHeight, pixelRatio: screen.devicePixelRatio, primary: screen.isPrimary, internal: screen.isInternal, current: screen === details.currentScreen })), 'observed', 'Display arrangement, not screen pixels. No windows are opened or moved.');
      };
      refresh();
      listen(ctx, details, 'screenschange', refresh);
      listen(ctx, details, 'currentscreenchange', refresh);
      for (const screen of details.screens) listen(ctx, screen, 'change', refresh);
      activate(ctx, `${details.screens.length} display${details.screens.length === 1 ? '' : 's'} exposed. Listening for arrangement changes.`);
      void watchPermission(ctx, 'window-management');
    },
    async idle(ctx) {
      const permission = await window.IdleDetector.requestPermission();
      ensure(ctx);
      if (permission !== 'granted') throw new DOMException('Idle detection permission not granted.', 'NotAllowedError');
      const controller = new AbortController();
      const detector = new window.IdleDetector();
      cleanupFor(ctx, () => controller.abort());
      const refresh = () => signal(ctx.id, 'device state', { user: detector.userState || 'Waiting', screen: detector.screenState || 'Waiting' }, 'observed', 'Coarse idle/lock state only, with a minimum 60-second idle threshold.');
      listen(ctx, detector, 'change', refresh);
      await detector.start({ threshold: 60000, signal: controller.signal });
      ensure(ctx);
      refresh();
      activate(ctx, 'Idle detection is active. The browser’s minimum idle threshold is 60 seconds.');
      void watchPermission(ctx, 'idle-detection');
    },
    async 'local-fonts'(ctx) {
      const fonts = await window.queryLocalFonts();
      ensure(ctx);
      signal(ctx.id, 'font count', fonts.length);
      signal(ctx.id, 'font names (first 100)', fonts.slice(0, 100).map(font => ({ family: font.family, fullName: font.fullName, style: font.style })), 'observed', 'Font names only; no binary font data read. The browser may limit the inventory.');
      granted(ctx, `${fonts.length} font faces exposed. Names only; no font files read.`);
    },
    async speaker(ctx) {
      const device = await nav.mediaDevices.selectAudioOutput();
      ensure(ctx);
      signal(ctx.id, 'selected output', { label: device.label || 'Label withheld', kind: device.kind, deviceId: device.deviceId }, 'observed', 'The ID is origin-scoped and can change. No audio is played.');
      granted(ctx, 'Selected output metadata is visible. No audio is played.');
    },
    async 'wake-lock'(ctx) {
      const lock = await nav.wakeLock.request('screen');
      if (!cleanupFor(ctx, () => lock.release())) return;
      listen(ctx, lock, 'release', () => stop(ctx.id, 'Screen wake lock released by the browser. Click again to request a new one.'));
      signal(ctx.id, 'screen wake lock', 'Held', 'permission');
      activate(ctx, 'Screen wake lock held while the browser allows it. It may release when the page is hidden.');
    },
    async contacts(ctx) {
      // Call select immediately inside the gesture; do not await getProperties first.
      const contacts = await nav.contacts.select(['name', 'email', 'tel'], { multiple: true });
      ensure(ctx);
      signal(ctx.id, 'selected contact count', contacts.length);
      signal(ctx.id, 'shared field counts', { name: contacts.filter(contact => contact.name?.length).length, email: contacts.filter(contact => contact.email?.length).length, tel: contacts.filter(contact => contact.tel?.length).length }, 'observed', 'Values are not displayed, logged or retained. Only your chosen contacts were provided.');
      granted(ctx, `${contacts.length} contact${contacts.length === 1 ? '' : 's'} selected. Field counts only; no contact values retained.`);
    },
  };

  for (const [id, constructorName] of [['accelerometer', 'Accelerometer'], ['gyroscope', 'Gyroscope'], ['magnetometer', 'Magnetometer']]) {
    runners[id] = ctx => {
      const sensor = new window[constructorName]({ frequency: 5 });
      cleanupFor(ctx, () => sensor.stop());
      listen(ctx, sensor, 'reading', () => signal(ctx.id, 'sensor reading', { x: number(sensor.x), y: number(sensor.y), z: number(sensor.z), timestamp: number(sensor.timestamp) }, 'observed', id === 'accelerometer' ? 'Units: meters per second squared.' : id === 'gyroscope' ? 'Units: radians per second.' : 'Units: microteslas.'));
      listen(ctx, sensor, 'error', event => {
        const error = event.error;
        stop(ctx.id, `${constructorName} stopped: ${error?.name || 'sensor unavailable'}.`);
        update(ctx.id, error?.name === 'NotAllowedError' ? 'denied' : 'error', error?.message || 'The device or browser did not make this sensor available.');
      });
      sensor.start();
      activate(ctx, 'Sensor requested; waiting for readings. API presence does not guarantee available hardware.');
    };
  }

  async function run(id) {
    const item = byId[id];
    if (!item) return { status: 'error', detail: 'Unknown experiment.', supported: false, active: false };
    if (disposed) return { ...readState(id), status: 'stopped', active: false, detail: 'This session has been disposed.' };
    if (!states[id].supported) { log(id, states[id].detail, 'unavailable'); return readState(id); }
    if (states[id].status === 'requesting') return readState(id);
    if (states[id].active) {
      if (id === 'clipboard' && clipboardCheck) {
        const generation = generations[id];
        try { await clipboardCheck(true, !!clipboardAwayAt); }
        catch (error) {
          if (disposed || generations[id] !== generation) return readState(id);
          const detail = `${error.name || 'Error'}: ${error.message || 'Clipboard read blocked.'}`;
          stop(id, 'Clipboard read was blocked. Focus the page and check its site permissions before trying again.');
          update(id, 'denied', detail);
          log(id, detail, 'unavailable');
        }
      }
      return readState(id);
    }
    drain(id);
    const ctx = { id, generation: (generations[id] || 0) + 1 };
    generations[id] = ctx.generation;
    update(id, 'requesting', 'Waiting for your browser or selection. Nothing is granted until the browser allows it.');
    try {
      // No awaited work before the runner: chooser and gesture APIs keep user activation.
      await runners[id](ctx);
    } catch (error) {
      if (!alive(ctx)) return readState(id);
      drain(id);
      const interactionRequest = id === 'fullscreen' || id === 'pointer-lock';
      const nativeRefusal = interactionRequest && error.name === 'TypeError' && /not\s+(?:granted|allowed)|permission[^.]*denied|request[^.]*denied/i.test(error.message || '');
      const denied = nativeRefusal || ['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(error.name);
      const cancelled = ['AbortError', 'NotFoundError'].includes(error.name);
      const nativeDetail = `${error.name || 'Error'}: ${error.message || (denied ? 'Blocked by browser permission or policy.' : 'The experiment could not start.')}`;
      const capability = id === 'fullscreen' ? 'fullscreen' : 'pointer lock';
      const detail = interactionRequest && !cancelled ? `The browser ${denied ? 'refused' : 'could not start'} ${capability}. Focus this page and click again. Your browser or an embedding page’s policy may restrict this capability. Browser response: ${nativeDetail}` : nativeDetail;
      update(id, denied ? 'denied' : cancelled ? 'available' : 'error', detail);
      signal(id, 'request result', cancelled ? 'Cancelled or no matching device' : denied ? 'Denied or blocked by policy' : 'Could not start', 'unavailable', detail);
      log(id, detail, 'unavailable');
    }
    return readState(id);
  }

  function readState(id) {
    return states[id] ? { ...states[id], requestId: generations[id] || 0, checking: id === 'clipboard' && clipboardReading === generations[id] } : { status: 'unsupported', detail: 'Unknown experiment.', supported: false, active: false };
  }

  async function readExistingPermissions() {
    if (disposed) return {};
    if (window.Notification && states.notifications) states.notifications.priorPermission = window.Notification.permission;
    if (!nav.permissions?.query) { notify(); return {}; }
    const results = await Promise.all(items.filter(item => item.permission && item.supported).map(async item => {
      try {
        const result = await nav.permissions.query({ name: item.permission, ...(item.id === 'midi' ? { sysex: false } : {}) });
        if (disposed) return [item.id, 'unknown'];
        states[item.id].priorPermission = result.state;
        if (states[item.id].status === 'available') states[item.id].detail = result.state === 'granted' ? 'Browser reports a previous grant. This experiment has not started; click to use it.' : result.state === 'denied' ? 'Browser reports access is denied. Change site settings to allow this experiment.' : 'Browser reports no grant. Click to request this capability.';
        return [item.id, result.state];
      } catch { return [item.id, 'unknown']; }
    }));
    // Notification.permission is read-only and works even without Permissions.query support for it.
    notify();
    return Object.fromEntries(results);
  }

  return {
    items, run, stop, stopAll, readState, readExistingPermissions,
    subscribe(callback) {
      if (disposed || typeof callback !== 'function') return () => {};
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },
    getPreview: id => previews[id] || null,
    dispose() { stopAll(); disposed = true; subscribers.clear(); },
  };
}
