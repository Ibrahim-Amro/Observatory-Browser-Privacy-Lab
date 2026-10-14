<?php
// Reflect this request and look up its connection IP in private, offline files.
// No visitor-IP API calls, file writes, cookies, sessions or application logs.

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
function observatory_ip_location($address, $databaseDirectory = null) {
    $result = array(
        'status' => 'unavailable', 'city' => null, 'region' => null,
        'country' => null, 'countryCode' => null, 'databaseDate' => null,
        'source' => 'DB-IP City Lite',
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
    if (!is_readable($autoload)) return $result;
    require_once $autoload;
    if (!class_exists('MaxMind\\Db\\Reader')) return $result;

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
            }
        } catch (\Throwable $error) {
            // ASN is optional; a failure cannot suppress a valid city result.
        } finally {
            if ($reader !== null) { try { $reader->close(); } catch (\Throwable $ignored) {} }
        }
    }
    return $result;
}

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
    echo json_encode(array(
        'local' => in_array($address, array('127.0.0.1', '::1', '::ffff:127.0.0.1'), true),
        'address' => $address, 'family' => $family, 'headers' => (object) $selected,
        'cookiePresent' => !empty($_SERVER['HTTP_COOKIE']),
        'location' => observatory_ip_location($address)
    ), JSON_INVALID_UTF8_SUBSTITUTE | JSON_UNESCAPED_SLASHES);
}
