<?php
// Offline fixtures: public DNS service IPs, never a visitor's address.
define('OBSERVATORY_CONTEXT_LIBRARY', true);
require __DIR__ . '/../dist/api/context.php';
$databaseDirectory = isset($argv[1]) ? $argv[1] : dirname(__DIR__, 3) . '/work/observatory-data';
$diagnostics = array();
$diagnostic = function ($code) use (&$diagnostics) { $diagnostics[] = $code; };
function check_geo($condition, $message) {
    if (!$condition) throw new RuntimeException($message);
}
foreach (array('127.0.0.1', '::1', '192.168.1.1', '10.0.0.1', '100.64.0.1', '::ffff:127.0.0.1') as $address) {
    check_geo(observatory_ip_location($address, $databaseDirectory, $diagnostic)['status'] === 'local', 'Private and local fixtures must never be located.');
}
check_geo(observatory_ip_location('not-an-ip', $databaseDirectory, $diagnostic)['status'] === 'unavailable', 'Invalid address must degrade gracefully.');
check_geo(observatory_ip_location('8.8.8.8', $databaseDirectory . '/missing', $diagnostic)['status'] === 'unavailable', 'Missing database must degrade gracefully.');
check_geo(observatory_normalize_ip('::ffff:8.8.8.8') === '8.8.8.8', 'Mapped IPv6 must compare as IPv4.');
check_geo(observatory_normalize_ip('2001:0DB8:0:0:0:0:0:1') === '2001:db8::1', 'Equivalent IPv6 must be canonicalized.');
check_geo(observatory_normalize_ip('999.1.2.3') === null && observatory_normalize_ip('garbage') === null, 'Invalid connection addresses must be rejected.');
$server = array('REMOTE_ADDR' => '8.8.8.8', 'HTTP_X_FORWARDED_FOR' => '1.1.1.1', 'HTTP_USER_AGENT' => 'Offline fixture');
$direct = observatory_context_payload($server, $databaseDirectory . '/missing', array(), $diagnostic);
check_geo($direct['address'] === '8.8.8.8' && $direct['source']['addressSource'] === 'remote-address', 'Untrusted forwarding headers must be ignored.');
check_geo($direct['location']['status'] === 'unavailable' && $direct['schemaVersion'] === 2, 'Valid IP must work without location files.');
$forwarded = observatory_context_payload($server, $databaseDirectory . '/missing', array('8.8.8.8'), $diagnostic);
check_geo($forwarded['address'] === '1.1.1.1' && $forwarded['source']['addressSource'] === 'trusted-proxy', 'Only explicitly trusted proxy peers may supply a forwarding chain.');
$server['HTTP_X_FORWARDED_FOR'] = '8.8.4.4, 1.1.1.1';
$forwarded = observatory_context_payload($server, $databaseDirectory . '/missing', array('8.8.8.8'), $diagnostic);
check_geo($forwarded['address'] === '1.1.1.1', 'Right-to-left trust boundary must ignore attacker-prepended addresses.');
$server['HTTP_X_FORWARDED_FOR'] = "malformed secret /private/path";
$invalidForward = observatory_context_payload($server, $databaseDirectory . '/missing', array('8.8.8.8'), $diagnostic);
check_geo($invalidForward['address'] === '8.8.8.8' && in_array('forwarded-header-invalid', $diagnostics, true), 'Malformed forwarded headers must leave an explicitly labelled direct-peer observation.');
check_geo(observatory_context_payload(array('REMOTE_ADDR' => 'invalid visitor data'), $databaseDirectory, array(), $diagnostic) === null, 'Invalid peer address must never be returned as a verified IP.');
$brokenDirectory = $databaseDirectory . '/test-corrupt-fixture';
if (!is_dir($brokenDirectory)) mkdir($brokenDirectory);
file_put_contents($brokenDirectory . '/dbip-city-lite.mmdb', 'This is an intentionally invalid test database.');
try {
    $broken = observatory_ip_location('8.8.8.8', $brokenDirectory, $diagnostic);
    check_geo($broken['status'] === 'unavailable', 'Corrupt database must degrade gracefully.');
    check_geo(strpos($broken['note'], $brokenDirectory) === false, 'Internal file paths must never appear in a response.');
    $intactIp = observatory_context_payload(array('REMOTE_ADDR' => '8.8.8.8'), $brokenDirectory, array(), $diagnostic);
    check_geo($intactIp['address'] === '8.8.8.8' && $intactIp['location']['status'] === 'unavailable', 'Corrupt optional geodata must not break the IP payload.');
    check_geo($intactIp['location']['source'] === null && $intactIp['location']['databaseDate'] === null, 'Failed geodata must not retain misleading source fields.');
} finally {
    unlink($brokenDirectory . '/dbip-city-lite.mmdb');
    rmdir($brokenDirectory);
}
foreach (array('8.8.8.8', '1.1.1.1', '2001:4860:4860::8888') as $address) {
    $result = observatory_ip_location($address, $databaseDirectory, $diagnostic);
    check_geo($result['status'] === 'available', 'Public fixture must have a location record.');
    check_geo(is_string($result['countryCode']) && strlen($result['countryCode']) === 2, 'Country code must be present.');
    check_geo(preg_match('/^\d{4}-\d{2}$/D', $result['databaseDate']) === 1, 'Location dataset must have a valid source date.');
    check_geo(!isset($result['latitude']) && !isset($result['longitude']), 'Endpoint must not expose coordinates.');
    check_geo(strpos($result['note'], 'not GPS') !== false, 'Approximation note must be present.');
}
$google = observatory_ip_location('8.8.8.8', $databaseDirectory, $diagnostic);
check_geo($google['countryCode'] === 'US', 'Google public DNS fixture country should be US in this release.');
check_geo(isset($google['asn']) && $google['asn'] === 15169, 'Google public DNS ASN should be AS15169.');
check_geo(isset($google['organization']) && is_string($google['organization']), 'ASN organization should be exposed.');
check_geo($google['asnSource'] === 'DB-IP ASN Lite' && preg_match('/^\d{4}-\d{2}$/D', $google['asnDatabaseDate']) === 1, 'ASN source/date must be separate from geographic source/date.');
foreach ($diagnostics as $code) check_geo(preg_match('/^[a-z-]+$/D', $code) === 1 && strpos($code, '8.8.8.8') === false && strpos($code, $databaseDirectory) === false, 'Operational diagnostics must contain event codes only, never fixture IPs, paths or request contents.');
check_geo(in_array('geo-database-error', $diagnostics, true), 'Corrupt database must produce a useful safe diagnostic.');
echo "Connection PHP: canonical IPs, explicit proxy trust, IP independent of missing/corrupt geodata, offline IPv4/IPv6 + ASN fixtures, separate sources, and private diagnostics passed.\n";
