// Educational content: observations are deliberately separated from inferences.
// References checked against primary browser documentation and web standards.
export const guides = [
  {
    id: 'baseline',
    title: 'No prompt does not mean no data',
    summary: 'A browser exposes useful information before a permission dialog appears.',
    body: 'A page can observe interactions inside its document and read many browser, display, language, time zone, rendering and capability signals. Browsers may restrict, round or replace these values. Baseline mode here means this session has not requested additional access. It does not prove that your browser has no earlier grants for this origin. A browser permission is also different from consent to a website privacy policy.',
    source: 'https://developer.mozilla.org/en-US/docs/Web/Privacy'
  },
  {
    id: 'network',
    title: 'The first request already says something',
    summary: 'Servers receive network and request metadata while loading a page.',
    body: 'A server can observe the connection reaching it and ordinary HTTP request headers. A localhost server usually sees a loopback address. A hosted server may see a visitor connection, proxy, or configured intermediary. The connection panel labels its source: this website and any explicitly disclosed browser-side lookup provider are different observations. A browser request to an external provider also reveals its connection IP and normal request metadata to that provider. A server request would instead expose the server connection. IP-based location is approximate and separate from permission-based device location.',
    source: 'https://www.w3.org/TR/fingerprinting-guidance/'
  },
  {
    id: 'fingerprints',
    title: 'A fingerprint is a combination, not a name',
    summary: 'Ordinary signals can become more distinctive when combined.',
    body: 'This demo takes a fresh, versioned snapshot of browser hints, screen dimensions, color depth, pixel ratio, WebGL metadata, a canvas drawing, and eight fixed font-width samples. The exact ordered hash inputs are available with the result. Ordinary window dimensions and the timestamp are excluded; simple window resizing need not change the signature. Blocked values are recorded as unavailable instead of reusing older GPU or rendering data. Similar devices can match, one device can change, and privacy defenses can add noise. This demo does not use the signatures to track you across websites or measure population uniqueness.',
    source: 'https://developer.mozilla.org/en-US/docs/Glossary/Fingerprinting'
  },
  {
    id: 'attention',
    title: 'A page can observe attention signals',
    summary: 'Focus and visibility reveal page state, with limited meaning.',
    body: 'Focus describes whether this document can receive input; it does not measure attention. Visibility describes whether the browser considers the document visible. Switching tabs, minimizing a window, opening a browser dialog or moving to another app can affect these signals. They cannot reveal which other app or tab you opened, whether you are looking at the screen, or what you do elsewhere. Background execution may be throttled or suspended.',
    source: 'https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API'
  },
  {
    id: 'clipboard',
    title: 'Clipboard clues need careful interpretation',
    summary: 'A copied image is not proof that a screenshot was taken.',
    body: 'Copy, cut and paste events describe actions delivered to this page. Optional clipboard reads may reveal current text or image data, subject to browser security, focus, activation and permission requirements. Browser behavior differs. A changed clipboard may come from another app, a copied image or a screenshot; the clipboard does not reliably identify its origin. It is not a history of everything you copied.',
    source: 'https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API'
  },
  {
    id: 'permission-layers',
    title: 'Access grows one capability at a time',
    summary: 'There is no universal switch that unlocks everything.',
    body: 'Each browser feature has its own conditions: availability, secure context, browser policy, user interaction, prior permission, and sometimes operating system approval. A granted state does not guarantee that hardware is present or that access will succeed. Features can be unsupported, restricted in frames, blocked by settings or denied by the user. Select capabilities individually and compare the actual observed results.',
    source: 'https://developer.mozilla.org/en-US/docs/Web/API/Permissions_API'
  },
  {
    id: 'mobile',
    title: 'Mobile gestures end at the browser boundary',
    summary: 'Touch data belongs to interactions the page actually receives.',
    body: 'Web pages may receive touch or pointer positions, contact size, pressure and movement when the browser exposes them. Scrolling and viewport changes can reveal that the page moved or resized. An operating system edge gesture may never reach the document. Opening a notification shade or task switcher cannot be positively identified from a generic focus or visibility change.',
    source: 'https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events'
  },
  {
    id: 'extension-comparisons',
    title: 'Compare readings without inventing an extension verdict',
    summary: 'References, API changes, and changed browser values are different kinds of evidence.',
    body: 'Capture a baseline, change the extension configuration, reload when required, capture another snapshot, and compare the same schema. Separate changed, unchanged, unavailable, and unstable values. A browser update, display change, randomization, or another environmental change can also alter results. Matching readings do not prove that an extension failed. Isolated extension worlds can remain invisible to page scripts. Exposed resource references do not establish successful execution, and multiple references from one origin do not mean multiple extensions.',
    source: 'https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts'
  },
  {
    id: 'reset',
    title: 'Stopping collection is different from revoking access',
    summary: 'This site can stop its session; the browser controls saved grants.',
    body: 'Stopping demos releases their active streams and watchers. Reset clears the local session readings and prevents disposed watchers from repopulating it. These controls do not revoke saved browser permissions, erase local exports, undo aggregate page-entry counts, or remove ordinary hosting logs. Those server-side activities are described in the privacy information. To remove saved access, use this origin\'s browser permission settings; operating system settings may independently block a feature.',
    source: 'https://www.w3.org/TR/permissions/'
  }
];

export const limitations = [
  {
    title: 'Screenshots',
    observable: 'Keyboard shortcuts that the browser delivers, and an optional later clipboard image.',
    hidden: 'There is no standard web event confirming an operating system screenshot, its saved file or a photograph of the screen. Shortcut and clipboard clues can miss captures or produce false positives.',
    source: 'https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent'
  },
  {
    title: 'Other tabs, apps and the taskbar',
    observable: 'This document\'s focus and visibility state.',
    hidden: 'Which app or tab you visit, what you read there, or whether a phone taskbar or notification shade opened. A page state change does not identify its cause.',
    source: 'https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API'
  },
  {
    title: 'Clipboard outside this page',
    observable: 'Permitted reads of the current clipboard and paste data supplied to this document.',
    hidden: 'A complete copy history, reliable background access or the source app. Focus and user interaction requirements still apply even when a browser remembers permission.',
    source: 'https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API'
  },
  {
    title: 'Installed extensions',
    observable: 'Already-exposed extension-origin resource references, plus a separate count of distinct exposed origins. Three references can share one origin. Protocol/count summaries are shown without raw extension IDs or paths; nothing is probed.',
    hidden: 'A standard inventory of all installed extensions, or proof that referenced code ran. navigator.plugins is normally a standardized PDF-viewer list; it is not an extensions list. No observed hint does not prove absence.',
    source: 'https://developer.mozilla.org/en-US/docs/Web/API/Navigator/plugins'
  },
  {
    title: 'Remote control and automation',
    observable: 'navigator.webdriver may report cooperative browser automation.',
    hidden: 'Universal detection of a person, bot, remote desktop tool or operating system input controller. A false webdriver value is not proof that the session is manually controlled.',
    source: 'https://developer.mozilla.org/en-US/docs/Web/API/Navigator/webdriver'
  },
  {
    title: 'Injected scripts',
    observable: 'Added script elements, selected code-related HTML attributes, and changes to a fixed sample of JavaScript API references. This lab compares references with its module-load snapshot; normal UI updates are excluded from generic change counts.',
    hidden: 'Whether a script ran, who caused a change, whether it is malicious, or whether earlier code already modified the baseline. Extensions can execute in isolated script environments. Unchanged references and no DOM hints cannot certify that no extension or external tool is involved.',
    source: 'https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts'
  },
  {
    title: 'Display and hardware measurements',
    observable: 'Reported screen dimensions, viewport size, pixel ratio and available browser properties.',
    hidden: 'Guaranteed physical resolution, exact hardware specifications or a complete monitor inventory. Privacy features can replace display values; zoom and browser UI also affect measurements.',
    source: 'https://support.mozilla.org/en-US/kb/resist-fingerprinting'
  },
  {
    title: 'Fingerprints and identity',
    observable: 'A versioned summary of a fresh ordered browser, screen, graphics, canvas, and font-width snapshot. Exact input fields and unavailable states can be inspected.',
    hidden: 'A verified unique identity, a person\'s real name, or a defensible uniqueness percentage without comparison data. Signatures can collide, change, or be randomized. Ordinary window dimensions are not included in this demo\'s grouping hash.',
    source: 'https://www.w3.org/TR/fingerprinting-guidance/'
  },
  {
    title: 'Cookies and site storage',
    observable: 'Storage available to this origin and cookies that are exposed to its scripts.',
    hidden: 'All cookies and storage from every website. HttpOnly cookies are unavailable to page JavaScript, and cookie scope and browser policies constrain access.',
    source: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Cookies'
  },
  {
    title: 'Referrer and browsing history',
    observable: 'The referrer string the browser provides for this navigation, if any.',
    hidden: 'Your complete browsing history or the referring page\'s contents. Referrer policy can shorten or remove the value; a direct visit commonly has no referrer.',
    source: 'https://developer.mozilla.org/en-US/docs/Web/API/Document/referrer'
  },
  {
    title: 'Screen sharing',
    observable: 'Pixels from the surface you explicitly select in the browser\'s sharing chooser.',
    hidden: 'Silent access to every window or monitor. Sharing requires user involvement and may be stopped; permission for one capture cannot be treated as permanent blanket access.',
    source: 'https://w3c.github.io/mediacapture-screen-share/'
  },
  {
    title: 'Permission coverage',
    observable: 'Supported capabilities, queryable states and the outcome of explicit access attempts.',
    hidden: 'Every imaginable permission on every device. Browser support, policies, prior grants and operating system settings differ. An unsupported query is an unknown state, not a denial.',
    source: 'https://developer.mozilla.org/en-US/docs/Web/API/Permissions_API'
  }
];
