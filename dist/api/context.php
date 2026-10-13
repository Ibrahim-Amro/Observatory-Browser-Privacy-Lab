<?php
// Reflect this visitor's own request metadata. No database, file writes or external calls.
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');
header('X-Content-Type-Options: nosniff');
header('Vary: Sec-Fetch-Site');
$method = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';
if ($method !== 'GET' && $method !== 'HEAD') {
    http_response_code(405);
    header('Allow: GET, HEAD');
    echo '{"error":"Method not allowed"}';
    exit;
}
if (isset($_SERVER['HTTP_SEC_FETCH_SITE']) && $_SERVER['HTTP_SEC_FETCH_SITE'] === 'cross-site') {
    http_response_code(403);
    echo '{"error":"Same-origin request required"}';
    exit;
}
$allowed = array('user-agent', 'accept', 'accept-language', 'sec-ch-ua', 'sec-ch-ua-platform', 'sec-ch-ua-mobile', 'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest', 'dnt', 'sec-gpc', 'referer');
$selected = array();
foreach ($allowed as $name) {
    $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    if (isset($_SERVER[$key])) $selected[$name] = substr((string) $_SERVER[$key], 0, 2048);
}
// Do not trust arbitrary forwarding headers as proof of the visitor's address.
$address = isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : 'Not exposed';
$family = filter_var($address, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) ? 'IPv6' : (filter_var($address, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) ? 'IPv4' : 'Unknown');
if ($method !== 'HEAD') {
    echo json_encode(array('local' => false, 'address' => $address, 'family' => $family, 'headers' => (object) $selected, 'cookiePresent' => !empty($_SERVER['HTTP_COOKIE'])), JSON_INVALID_UTF8_SUBSTITUTE | JSON_UNESCAPED_SLASHES);
}
