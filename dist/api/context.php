<?php
// PHP 7.3+. Same-origin connection reflection with optional offline geodata.
// No IP-provider requests, cookies or session identifiers. Operational failures
// log bounded event codes only: never IPs, headers, paths or exception messages.

function observatory_context_diagnostic($code, $callback = null) {
    $allowed = array('invalid-remote-address', 'forwarded-header-invalid', 'geo-reader-unavailable', 'geo-database-error', 'asn-database-error', 'endpoint-exception', 'json-encoding-failed', 'fatal-php-error');
    if (!in_array($code, $allowed, true)) $code = 'endpoint-exception';
    if (is_callable($callback)) { call_user_func($callback, $code); return; }
    @error_log('[Observatory context] ' . $code);
}

function observatory_normalize_ip($address) {
    if (!is_string($address) || strlen($address) > 64 || filter_var($address, FILTER_VALIDATE_IP) === false) return null;
    $packed = @inet_pton($address);
    if ($packed === false) return null;
    // Treat IPv4-mapped IPv6 and IPv4 as the same comparable observation.
    if (strlen($packed) === 16 && substr($packed, 0, 12) === str_repeat("\0", 10) . "\xff\xff") $packed = substr($packed, 12);
    $normal = @inet_ntop($packed);
    return $normal === false ? null : strtolower($normal);
}

function observatory_connection_address($server, $trustedProxies = array(), $diagnostic = null) {
    $peer = observatory_normalize_ip(isset($server['REMOTE_ADDR']) ? $server['REMOTE_ADDR'] : null);
    if ($peer === null) { observatory_context_diagnostic('invalid-remote-address', $diagnostic); return null; }
    $trusted = array();
    foreach (array_slice($trustedProxies, 0, 64) as $proxy) { $normal = observatory_normalize_ip($proxy); if ($normal !== null) $trusted[] = $normal; }
    $result = array('address' => $peer, 'addressSource' => 'remote-address');
    // Arbitrary client forwarding headers are always ignored. Configure exact
    // trusted proxy IPs explicitly before considering a bounded XFF chain.
    if (!in_array($peer, $trusted, true) || empty($server['HTTP_X_FORWARDED_FOR'])) return $result;
    $raw = $server['HTTP_X_FORWARDED_FOR'];
    if (!is_string($raw) || strlen($raw) > 2048) { observatory_context_diagnostic('forwarded-header-invalid', $diagnostic); return $result; }
    $chain = explode(',', $raw);
    if (count($chain) > 32) { observatory_context_diagnostic('forwarded-header-invalid', $diagnostic); return $result; }
    $validated = array();
    foreach ($chain as $entry) {
        $normal = observatory_normalize_ip(trim($entry));
        if ($normal === null) { observatory_context_diagnostic('forwarded-header-invalid', $diagnostic); return $result; }
        $validated[] = $normal;
    }
    for ($index = count($validated) - 1; $index >= 0; $index--) {
        if (!in_array($validated[$index], $trusted, true)) return array('address' => $validated[$index], 'addressSource' => 'trusted-proxy');
    }
    return $result;
}

function observatory_geodata_text($value) {
    if (!is_string($value) || $value === '') return null;
    $value = preg_replace('/[\x00-\x1F\x7F]/', '', $value);
    return substr($value, 0, 200);
}

function observatory_public_ip($address) {
    if (!is_string($address) || !filter_var($address, FILTER_VALIDATE_IP)) return false;
    if (stripos($address, '::ffff:') === 0) $address = substr($address, 7);
    if (!filter_var($address, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) return false;
    // Shared-address space is not a globally routable visitor address.
    $packed = @inet_pton($address);
    if (strlen((string) $packed) === 4) {
        $bytes = unpack('C4', $packed);
        if ($bytes[1] === 100 && $bytes[2] >= 64 && $bytes[2] <= 127) return false;
    }
    return true;
}

/** Internal helper; the HTTP endpoint never accepts an address or path input. */
function observatory_ip_location($address, $databaseDirectory = null, $diagnostic = null) {
    $result = array(
        'status' => 'unavailable', 'city' => null, 'region' => null,
        'country' => null, 'countryCode' => null, 'databaseDate' => null,
        'source' => null,
        'note' => 'An offline IP-location database is not available on this host. No external lookup was attempted.'
    );
    if (!filter_var($address, FILTER_VALIDATE_IP)) return $result;
    if (!observatory_public_ip($address)) {
        $result['status'] = 'local';
        $result['note'] = 'This is a local, private or reserved connection address; no public IP location is inferred.';
        return $result;
    }
    // In /home/account/public_html/observatory/api this resolves to the private
    // /home/account/observatory-data directory, outside every public web path.
    if ($databaseDirectory === null) $databaseDirectory = dirname(__DIR__, 3) . '/observatory-data';
    $autoload = __DIR__ . '/lib/maxmind-db/autoload.php';
    try {
        if (!is_readable($autoload)) { observatory_context_diagnostic('geo-reader-unavailable', $diagnostic); return $result; }
        require_once $autoload;
        if (!class_exists('MaxMind\\Db\\Reader')) { observatory_context_diagnostic('geo-reader-unavailable', $diagnostic); return $result; }
    } catch (\Throwable $error) {
        observatory_context_diagnostic('geo-reader-unavailable', $diagnostic);
        return $result;
    }

    $cityPath = $databaseDirectory . '/dbip-city-lite.mmdb';
    $countryPath = $databaseDirectory . '/dbip-country-lite.mmdb';
    $locationPath = is_readable($cityPath) ? $cityPath : $countryPath;
    if (is_readable($locationPath)) {
        $reader = null;
        try {
            $reader = @new \MaxMind\Db\Reader($locationPath);
            $record = $reader->get($address);
            $result['databaseDate'] = gmdate('Y-m', $reader->metadata()->buildEpoch);
            $result['source'] = $locationPath === $cityPath ? 'DB-IP City Lite' : 'DB-IP Country Lite';
            if (is_array($record)) {
                $result['city'] = observatory_geodata_text(isset($record['city']['names']['en']) ? $record['city']['names']['en'] : null);
                $result['region'] = observatory_geodata_text(isset($record['subdivisions'][0]['names']['en']) ? $record['subdivisions'][0]['names']['en'] : null);
                $result['country'] = observatory_geodata_text(isset($record['country']['names']['en']) ? $record['country']['names']['en'] : null);
                $result['countryCode'] = observatory_geodata_text(isset($record['country']['iso_code']) ? $record['country']['iso_code'] : null);
                if ($result['country'] !== null || $result['countryCode'] !== null || $result['city'] !== null) {
                    $result['status'] = 'available';
                    $result['note'] = 'Approximate IP-based location from an offline database. It may describe a VPN, proxy or network gateway and can be wrong; it is not GPS.';
                } else {
                    $result['note'] = 'The offline database has no location record for this connection address. No external lookup was attempted.';
                }
            } else {
                $result['note'] = 'The offline database has no location record for this connection address. No external lookup was attempted.';
            }
        } catch (\Throwable $error) {
            // Missing/corrupt/incompatible files must not expose paths or errors.
            observatory_context_diagnostic('geo-database-error', $diagnostic);
            $result['source'] = null;
            $result['databaseDate'] = null;
            $result['note'] = 'The offline location database could not be read. No external lookup was attempted.';
        } finally {
            if ($reader !== null) { try { $reader->close(); } catch (\Throwable $ignored) {} }
        }
    }

    $asnPath = $databaseDirectory . '/dbip-asn-lite.mmdb';
    if (is_readable($asnPath)) {
        $reader = null;
        try {
            $reader = @new \MaxMind\Db\Reader($asnPath);
            $record = $reader->get($address);
            if (is_array($record)) {
                if (isset($record['autonomous_system_number']) && is_numeric($record['autonomous_system_number'])) $result['asn'] = (int) $record['autonomous_system_number'];
                $organization = observatory_geodata_text(isset($record['autonomous_system_organization']) ? $record['autonomous_system_organization'] : null);
                if ($organization !== null) $result['organization'] = $organization;
                if (isset($result['asn']) || isset($result['organization'])) {
                    $result['asnSource'] = 'DB-IP ASN Lite';
                    $result['asnDatabaseDate'] = gmdate('Y-m', $reader->metadata()->buildEpoch);
                }
            }
        } catch (\Throwable $error) {
            // ASN is optional; a failure cannot suppress a valid city result.
            observatory_context_diagnostic('asn-database-error', $diagnostic);
        } finally {
            if ($reader !== null) { try { $reader->close(); } catch (\Throwable $ignored) {} }
        }
    }
    return $result;
}

function observatory_context_payload($server, $databaseDirectory = null, $trustedProxies = array(), $diagnostic = null) {
    $connection = observatory_connection_address($server, $trustedProxies, $diagnostic);
    if ($connection === null) return null;
    $address = $connection['address'];
    $allowed = array('user-agent', 'accept', 'accept-language', 'sec-ch-ua', 'sec-ch-ua-platform', 'sec-ch-ua-mobile', 'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest', 'dnt', 'sec-gpc', 'referer');
    $selected = array();
    foreach ($allowed as $name) {
        $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
        if (isset($server[$key])) $selected[$name] = substr(preg_replace('/[\x00-\x1F\x7F]/', '', (string) $server[$key]), 0, 2048);
    }
    try { $location = observatory_ip_location($address, $databaseDirectory, $diagnostic); }
    catch (\Throwable $error) { observatory_context_diagnostic('geo-database-error', $diagnostic); $location = array('status' => 'unavailable', 'note' => 'Optional location lookup failed. The connection IP remains available.'); }
    return array('schemaVersion' => 2, 'local' => $address === '::1' || strpos($address, '127.') === 0, 'address' => $address,
        'family' => strpos($address, ':') !== false ? 'IPv6' : 'IPv4', 'headers' => (object) $selected,
        'cookiePresent' => !empty($server['HTTP_COOKIE']), 'location' => $location,
        'source' => array('id' => 'same-origin-host', 'addressSource' => $connection['addressSource']));
}

if (!defined('OBSERVATORY_CONTEXT_LIBRARY')) {
    ini_set('display_errors', '0');
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, private, max-age=0');
    header('X-Content-Type-Options: nosniff');
    header('Vary: Sec-Fetch-Site');
    register_shutdown_function(function () {
        $error = error_get_last();
        if ($error !== null && in_array($error['type'], array(E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR), true)) observatory_context_diagnostic('fatal-php-error');
    });
    $method = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';
    if ($method !== 'GET' && $method !== 'HEAD') { http_response_code(405); header('Allow: GET, HEAD'); echo '{"error":"Method not allowed"}'; exit; }
    if (isset($_SERVER['HTTP_SEC_FETCH_SITE']) && $_SERVER['HTTP_SEC_FETCH_SITE'] === 'cross-site') { http_response_code(403); echo '{"error":"Same-origin request required"}'; exit; }
    try {
        // Exact proxy IPs only; unset means no forwarded headers are trusted.
        $configured = getenv('OBSERVATORY_TRUSTED_PROXIES');
        $proxies = is_string($configured) && strlen($configured) <= 4096 ? array_map('trim', explode(',', $configured)) : array();
        $payload = observatory_context_payload($_SERVER, null, $proxies);
        if ($payload === null) { http_response_code(503); if ($method !== 'HEAD') echo '{"error":"Connection address unavailable"}'; exit; }
        $json = json_encode($payload, JSON_INVALID_UTF8_SUBSTITUTE | JSON_UNESCAPED_SLASHES);
        if ($json === false || strlen($json) > 32768) { observatory_context_diagnostic('json-encoding-failed'); http_response_code(503); if ($method !== 'HEAD') echo '{"error":"Connection response unavailable"}'; exit; }
        if ($method !== 'HEAD') echo $json;
    } catch (\Throwable $error) {
        observatory_context_diagnostic('endpoint-exception'); http_response_code(503);
        if ($method !== 'HEAD') echo '{"error":"Connection response unavailable"}';
    }
}
