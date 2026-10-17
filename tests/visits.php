<?php
declare(strict_types=1);
require_once __DIR__ . '/../dist/api/lib/visit-counter.php';

function check(bool $condition, string $message): void { if (!$condition) throw new RuntimeException($message); }
function read_json(string $path): array { return json_decode((string) file_get_contents($path), true, 32, JSON_THROW_ON_ERROR); }

if (($argv[1] ?? '') === 'worker') {
    for ($i = 0; $i < 10; $i++) observatory_record_visit($argv[2], '203.0.113.10', 'Test browser', (int) $argv[3]);
    exit(0);
}

$root = dirname(__DIR__, 3) . '/work/visit-tests-' . bin2hex(random_bytes(6));
check(mkdir($root, 0700, true), 'Test directory could not be created.');
$directories = [];
try {
    $dir = $root . '/sessions'; $directories[] = $dir;
    $t = strtotime('2026-10-14T12:00:00Z');
    $report = observatory_record_visit($dir, '203.0.113.10', 'Test browser', $t);
    $report = observatory_record_visit($dir, '203.0.113.10', 'Test browser', $t + 600);
    check($report['totalPageViews'] === 2 && $report['totalVisits'] === 1, 'Repeated page entry within 30 minutes must share a visit.');
    $report = observatory_record_visit($dir, '203.0.113.10', 'Test browser', $t + 2401);
    check($report['totalVisits'] === 2, 'A 30-minute inactivity gap must create a visit.');
    $report = observatory_record_visit($dir, '203.0.113.11', 'Other browser', $t + 2402);
    check($report['estimatedDailyVisitors']['2026-10-14'] === 2, 'A second daily estimate must be counted.');
    check($report['dailyPageViews']['2026-10-14'] === 4 && $report['dailyVisits']['2026-10-14'] === 3, 'Daily counts must agree with these entries.');
    $raw = (string) file_get_contents($dir . '/visitor-stats.json');
    check(strpos($raw, '203.0.113') === false && strpos($raw, 'Test browser') === false && strpos($raw, 'activeSalt') === false && strpos($raw, 'activeVisitors') === false, 'Aggregate report must contain no raw identity or private identifiers.');
    $state = read_json($dir . '/visitor-state.json'); $oldHashes = array_keys($state['activeVisitors']); $oldSalt = $state['activeSalt'];
    check(strpos((string) file_get_contents($dir . '/visitor-state.json'), '203.0.113') === false && strpos((string) file_get_contents($dir . '/visitor-state.json'), 'Test browser') === false, 'Private state must not store raw IP or UA.');
    $report = observatory_record_visit($dir, '203.0.113.10', 'Test browser', strtotime('2026-10-15T00:01:00Z'));
    $state = read_json($dir . '/visitor-state.json');
    check($state['activeDay'] === '2026-10-15' && $state['activeSalt'] !== $oldSalt, 'UTC rollover must replace the salt.');
    check(count($state['activeVisitors']) === 1 && !array_intersect($oldHashes, array_keys($state['activeVisitors'])), 'UTC rollover must discard every old daily hash.');
    check($report['totalPageViews'] === 5 && $report['totalVisits'] === 4 && $report['dailyPageViews']['2026-10-14'] === 4, 'Lifetime totals and prior daily aggregates must survive rollover.');
    $report = observatory_record_visit($dir, '203.0.113.10', 'Test browser', $t + 91 * 86400);
    check(!isset($report['dailyPageViews']['2026-10-14']) && $report['totalPageViews'] === 6, 'Daily history must expire after 90 days without losing lifetime totals.');

    $beforeState = (string) file_get_contents($dir . '/visitor-state.json'); $beforeReport = (string) file_get_contents($dir . '/visitor-stats.json');
    file_put_contents($dir . '/visitor-state.json', '{broken existing JSON');
    try { observatory_record_visit($dir, '203.0.113.10', 'Test browser', $t); throw new RuntimeException('Corrupt state was accepted.'); }
    catch (RuntimeException $error) { check($error->getMessage() === 'Counter unavailable.', 'Corrupt state must fail generically.'); }
    check(file_get_contents($dir . '/visitor-state.json') === '{broken existing JSON' && file_get_contents($dir . '/visitor-stats.json') === $beforeReport, 'Corrupt state and valid report must remain intact.');
    file_put_contents($dir . '/visitor-state.json', $beforeState); file_put_contents($dir . '/visitor-stats.json', '{broken aggregate');
    try { observatory_record_visit($dir, '203.0.113.10', 'Test browser', $t); throw new RuntimeException('Corrupt report was accepted.'); }
    catch (RuntimeException $error) { check($error->getMessage() === 'Counter unavailable.', 'Corrupt report must fail generically.'); }
    check(file_get_contents($dir . '/visitor-stats.json') === '{broken aggregate' && file_get_contents($dir . '/visitor-state.json') === $beforeState, 'Corrupt report and valid state must remain intact.');

    check(observatory_visit_origin_allowed(['HTTPS' => 'on', 'HTTP_HOST' => 'example.com', 'HTTP_ORIGIN' => 'https://example.com', 'HTTP_SEC_FETCH_SITE' => 'same-origin']), 'Same-origin POST must be allowed.');
    check(!observatory_visit_origin_allowed(['HTTPS' => 'on', 'HTTP_HOST' => 'example.com', 'HTTP_ORIGIN' => 'https://other.example', 'HTTP_SEC_FETCH_SITE' => 'same-site']), 'Mismatched Origin must be rejected.');
    check(!observatory_visit_origin_allowed(['HTTPS' => 'on', 'HTTP_HOST' => 'example.com', 'HTTP_ORIGIN' => 'https://example.com', 'HTTP_SEC_FETCH_SITE' => 'cross-site']), 'Cross-site requests must be rejected.');
    check(!observatory_visit_origin_allowed(['HTTP_HOST' => 'example.com', 'HTTP_ORIGIN' => 'null']), 'Opaque Origin must be rejected.');
    check(observatory_visit_should_skip(['HTTP_USER_AGENT' => 'Googlebot/2.1']) && observatory_visit_should_skip(['HTTP_SEC_GPC' => '1']) && observatory_visit_should_skip(['HTTP_DNT' => '1']), 'Bots and privacy opt-out signals must be skipped.');
    check(!observatory_visit_should_skip(['HTTP_USER_AGENT' => 'Mozilla/5.0 Chrome/130.0']), 'Ordinary browser request must remain countable.');

    if (function_exists('proc_open')) {
        $concurrent = $root . '/concurrent'; $directories[] = $concurrent; $workers = [];
        for ($i = 0; $i < 6; $i++) {
            $process = proc_open([PHP_BINARY, __FILE__, 'worker', $concurrent, (string) $t], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
            check(is_resource($process), 'Could not start concurrent worker.'); fclose($pipes[0]); $workers[] = [$process, $pipes];
        }
        foreach ($workers as [$process, $pipes]) {
            $output = stream_get_contents($pipes[1]); $errors = stream_get_contents($pipes[2]); fclose($pipes[1]); fclose($pipes[2]);
            check(proc_close($process) === 0, 'Concurrent counter worker failed: ' . $output . $errors);
        }
        $report = read_json($concurrent . '/visitor-stats.json');
        check($report['totalPageViews'] === 60 && $report['totalVisits'] === 1 && $report['estimatedDailyVisitors']['2026-10-14'] === 1, 'Locked concurrent updates must not lose entries or duplicate visits.');
    }
    echo "Visitor counter: session inactivity, daily estimates/rollover, 90-day retention, private aggregates, origins/opt-outs, corrupt-file preservation, and locked persistence passed.\n";
} finally {
    foreach ($directories as $directory) {
        foreach (['visitor-state.json', 'visitor-stats.json', 'visitor-counter.lock'] as $file) if (is_file($directory . '/' . $file)) unlink($directory . '/' . $file);
        if (is_dir($directory)) rmdir($directory);
    }
    if (is_dir($root)) rmdir($root);
}
