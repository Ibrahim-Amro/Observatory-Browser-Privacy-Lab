<?php
// Offline fixtures: public DNS service IPs, never a visitor's address.
$_SERVER['REQUEST_METHOD'] = 'HEAD';
require __DIR__ . '/../dist/api/context.php';
$databaseDirectory = isset($argv[1]) ? $argv[1] : dirname(__DIR__, 3) . '/work/observatory-data';
function check_geo($condition, $message) {
    if (!$condition) throw new RuntimeException($message);
}
foreach (array('127.0.0.1', '::1', '192.168.1.1', '10.0.0.1', '100.64.0.1', '::ffff:127.0.0.1') as $address) {
    check_geo(observatory_ip_location($address, $databaseDirectory)['status'] === 'local', 'Private and local fixtures must never be located.');
}
check_geo(observatory_ip_location('not-an-ip', $databaseDirectory)['status'] === 'unavailable', 'Invalid address must degrade gracefully.');
check_geo(observatory_ip_location('8.8.8.8', $databaseDirectory . '/missing')['status'] === 'unavailable', 'Missing database must degrade gracefully.');
$brokenDirectory = $databaseDirectory . '/test-corrupt-fixture';
if (!is_dir($brokenDirectory)) mkdir($brokenDirectory);
file_put_contents($brokenDirectory . '/dbip-city-lite.mmdb', 'This is an intentionally invalid test database.');
try {
    $broken = observatory_ip_location('8.8.8.8', $brokenDirectory);
    check_geo($broken['status'] === 'unavailable', 'Corrupt database must degrade gracefully.');
    check_geo(strpos($broken['note'], $brokenDirectory) === false, 'Internal file paths must never appear in a response.');
} finally {
    unlink($brokenDirectory . '/dbip-city-lite.mmdb');
    rmdir($brokenDirectory);
}
foreach (array('8.8.8.8', '1.1.1.1', '2001:4860:4860::8888') as $address) {
    $result = observatory_ip_location($address, $databaseDirectory);
    check_geo($result['status'] === 'available', 'Public fixture must have a location record.');
    check_geo(is_string($result['countryCode']) && strlen($result['countryCode']) === 2, 'Country code must be present.');
    check_geo($result['databaseDate'] === '2026-10', 'Expected October 2026 database.');
    check_geo(!isset($result['latitude']) && !isset($result['longitude']), 'Endpoint must not expose coordinates.');
    check_geo(strpos($result['note'], 'not GPS') !== false, 'Approximation note must be present.');
}
$google = observatory_ip_location('8.8.8.8', $databaseDirectory);
check_geo($google['countryCode'] === 'US', 'Google public DNS fixture country should be US in this release.');
check_geo(isset($google['asn']) && $google['asn'] === 15169, 'Google public DNS ASN should be AS15169.');
check_geo(isset($google['organization']) && is_string($google['organization']), 'ASN organization should be exposed.');
echo "Offline geodata: public IPv4/IPv6, ASN, approximate labels, private/invalid addresses, missing/corrupt databases and path redaction passed.\n";
